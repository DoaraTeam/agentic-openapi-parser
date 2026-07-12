import axios from 'axios';
import { OAuth2TokenState, TokenRefresher, ILogger } from '@/types';
import { DEFAULT_LOGGER } from '@/utils';

const DEFAULT_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export type OAuth2RefreshRequestFormat = 'form' | 'json';

export interface Oauth2RefreshTokenRefresherOptions {
  /** How far ahead of expiry to trigger a refresh, in ms. Defaults to 5 minutes. */
  refreshThresholdMs?: number;
  logger?: ILogger;
  /** Fire-and-forget hook for persisting the refreshed token (e.g. to a DB via a queue job). */
  onRefreshed?: (newState: OAuth2TokenState) => void | Promise<void>;
  /** Most OAuth2 token endpoints (Google, Microsoft, HubSpot, Salesforce, Spotify...) accept
   *  application/x-www-form-urlencoded, which is the default. A few (e.g. Atlassian's
   *  auth.atlassian.com) require a JSON body instead. */
  requestFormat?: OAuth2RefreshRequestFormat;
}

/** OAuth2 refresh_token-grant TokenRefresher. Refresh failures are logged and swallowed — the
 *  caller falls back to the existing (possibly stale) token rather than aborting the tool call. */
export class Oauth2RefreshTokenRefresher implements TokenRefresher {
  private readonly refreshThresholdMs: number;
  private readonly logger: ILogger;
  private readonly onRefreshed?: (newState: OAuth2TokenState) => void | Promise<void>;
  private readonly requestFormat: OAuth2RefreshRequestFormat;

  constructor(options: Oauth2RefreshTokenRefresherOptions = {}) {
    this.refreshThresholdMs = options.refreshThresholdMs ?? DEFAULT_REFRESH_THRESHOLD_MS;
    this.logger = options.logger ?? DEFAULT_LOGGER;
    this.onRefreshed = options.onRefreshed;
    this.requestFormat = options.requestFormat ?? 'form';
  }

  async refreshIfNeeded(state: OAuth2TokenState): Promise<OAuth2TokenState | undefined> {
    if (!state.tokenExpiresAt || !state.refreshToken || !state.tokenUrl) return undefined;

    const expiresInMs = state.tokenExpiresAt.getTime() - Date.now();
    if (expiresInMs >= this.refreshThresholdMs) return undefined;

    this.logger.warn('Token is expiring soon. Auto-renewing...');
    try {
      const contentType = this.requestFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';
      const response = await axios.post(
        state.tokenUrl,
        {
          grant_type: 'refresh_token',
          refresh_token: state.refreshToken,
          client_id: state.clientId,
          client_secret: state.clientSecret,
        },
        { headers: { 'Content-Type': contentType } }
      );

      const expiresInSecs = response.data.expires_in || 3600;
      const newState: OAuth2TokenState = {
        ...state,
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || state.refreshToken,
        tokenExpiresAt: new Date(Date.now() + expiresInSecs * 1000),
      };

      await this.onRefreshed?.(newState);
      this.logger.log('Successfully auto-renewed token.');
      return newState;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to auto-renew token: ${message}`);
      return undefined;
    }
  }
}
