import axios from 'axios';
import { AccessTokenProvider, ILogger } from '@/types';
import { DEFAULT_LOGGER } from '@/utils';

const DEFAULT_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_EXPIRES_IN_SECS = 3600;

export interface ClientCredentialsConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Optional space-delimited scope string, sent only if provided. */
  scope?: string;
}

export interface ClientCredentialsTokenProviderOptions {
  /** How far ahead of expiry to trigger a re-fetch, in ms. Defaults to 5 minutes. */
  refreshThresholdMs?: number;
  logger?: ILogger;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * OAuth2 client_credentials-grant AccessTokenProvider: a machine-to-machine flow with no user
 * involved and no refresh_token, so the only operation is "fetch a token, cache it, fetch a new
 * one again once it's close to expiry." Out of scope by design (the caller's responsibility, not
 * this library's): authorization_code/PKCE flows and refresh_token rotation — see
 * Oauth2RefreshTokenRefresher for that grant type instead.
 */
export class ClientCredentialsTokenProvider implements AccessTokenProvider {
  private readonly refreshThresholdMs: number;
  private readonly logger: ILogger;
  private cached?: CachedToken;
  private pendingFetch?: Promise<CachedToken>;

  constructor(
    private readonly config: ClientCredentialsConfig,
    options: ClientCredentialsTokenProviderOptions = {}
  ) {
    this.refreshThresholdMs = options.refreshThresholdMs ?? DEFAULT_REFRESH_THRESHOLD_MS;
    this.logger = options.logger ?? DEFAULT_LOGGER;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && !this.isNearExpiry(this.cached)) {
      return this.cached.accessToken;
    }

    try {
      const token = await this.fetchTokenOnce();
      this.cached = token;
      return token.accessToken;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      if (this.cached) {
        this.logger.warn(`Failed to renew client_credentials token, reusing cached token: ${message}`);
        return this.cached.accessToken;
      }

      this.logger.error(`Failed to obtain client_credentials access token: ${message}`);
      throw new Error(`Failed to obtain client_credentials access token: ${message}`);
    }
  }

  private isNearExpiry(token: CachedToken): boolean {
    return token.expiresAt - Date.now() < this.refreshThresholdMs;
  }

  /** Concurrent callers during a token fetch share the same in-flight request instead of each firing their own. */
  private fetchTokenOnce(): Promise<CachedToken> {
    if (!this.pendingFetch) {
      this.pendingFetch = this.fetchToken().finally(() => {
        this.pendingFetch = undefined;
      });
    }
    return this.pendingFetch;
  }

  private async fetchToken(): Promise<CachedToken> {
    const response = await axios.post(
      this.config.tokenUrl,
      {
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...(this.config.scope ? { scope: this.config.scope } : {}),
      },
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = response.data.access_token as string | undefined;
    if (!accessToken) {
      throw new Error('Token endpoint response did not include an access_token');
    }

    const expiresInSecs = (response.data.expires_in as number | undefined) ?? DEFAULT_EXPIRES_IN_SECS;
    return { accessToken, expiresAt: Date.now() + expiresInSecs * 1000 };
  }
}
