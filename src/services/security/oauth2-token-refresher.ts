import axios from 'axios';
import { OAuth2TokenState, TokenRefresher, ILogger } from '@/types';
import { DEFAULT_LOGGER } from '@/utils';

const DEFAULT_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_EXPIRES_IN_SECS = 3600;

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
  /**
   * Manual dot-path overrides for non-standard response shapes (e.g. "data.token.accessToken").
   * Only needed when the built-in auto-detection (snake_case, camelCase, and a 1-level "data"/
   * "result" envelope) can't find the field — most hand-rolled internal auth endpoints don't need
   * these. When given, the override fully replaces auto-detection for that field (no fallback).
   */
  responseAccessTokenPath?: string;
  responseRefreshTokenPath?: string;
  responseExpiresInPath?: string;
  /** Used only when no expiry field can be found anywhere in the response — many internal auth
   *  endpoints don't return a TTL at all. Defaults to 3600 (1 hour). */
  defaultExpiresInSecs?: number;
}

function getByPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    return isRecord(acc) ? acc[key] : undefined;
  }, obj);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

// Nhiều hệ thống nội bộ (không phải SaaS chuẩn OAuth2) trả response theo camelCase, hoặc bọc
// trong 1 lớp envelope ("data"/"result") thay vì đúng chuẩn RFC 6749 (snake_case, phẳng). Thử lần
// lượt các vị trí phổ biến này trước khi coi là "không tìm thấy" — cố tình không đệ quy sâu hơn 1
// lớp để tránh đoán sai; case sâu hơn dùng các *Path option ở trên.
function findInResponse(data: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  const envelopes = [data.data, data.result].filter(isRecord);
  const candidates = [
    data[snakeKey],
    data[camelKey],
    ...envelopes.map((envelope) => envelope[snakeKey]),
    ...envelopes.map((envelope) => envelope[camelKey]),
  ];
  return candidates.find((value) => value !== undefined);
}

/** OAuth2 refresh_token-grant TokenRefresher. Refresh failures are logged and swallowed — the
 *  caller falls back to the existing (possibly stale) token rather than aborting the tool call. */
export class Oauth2RefreshTokenRefresher implements TokenRefresher {
  private readonly refreshThresholdMs: number;
  private readonly logger: ILogger;
  private readonly onRefreshed?: (newState: OAuth2TokenState) => void | Promise<void>;
  private readonly requestFormat: OAuth2RefreshRequestFormat;
  private readonly responseAccessTokenPath?: string;
  private readonly responseRefreshTokenPath?: string;
  private readonly responseExpiresInPath?: string;
  private readonly defaultExpiresInSecs: number;

  constructor(options: Oauth2RefreshTokenRefresherOptions = {}) {
    this.refreshThresholdMs = options.refreshThresholdMs ?? DEFAULT_REFRESH_THRESHOLD_MS;
    this.logger = options.logger ?? DEFAULT_LOGGER;
    this.onRefreshed = options.onRefreshed;
    this.requestFormat = options.requestFormat ?? 'form';
    this.responseAccessTokenPath = options.responseAccessTokenPath;
    this.responseRefreshTokenPath = options.responseRefreshTokenPath;
    this.responseExpiresInPath = options.responseExpiresInPath;
    this.defaultExpiresInSecs = options.defaultExpiresInSecs ?? DEFAULT_EXPIRES_IN_SECS;
  }

  async refreshIfNeeded(state: OAuth2TokenState): Promise<OAuth2TokenState | undefined> {
    if (!state.tokenExpiresAt || !state.refreshToken || !state.tokenUrl) return undefined;

    const expiresInMs = state.tokenExpiresAt.getTime() - Date.now();
    if (expiresInMs >= this.refreshThresholdMs) return undefined;

    this.logger.warn('Token is expiring soon. Auto-renewing...');
    try {
      const contentType = this.requestFormat === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';
      // Gửi kèm cả 2 convention (snake_case chuẩn RFC 6749 + camelCase phổ biến ở hệ thống nội
      // bộ tự viết) — field nào undefined sẽ tự bị lược bỏ khỏi cả form lẫn JSON body, không có
      // rủi ro; field lạ hầu như luôn được server bỏ qua an toàn.
      const response = await axios.post(
        state.tokenUrl,
        {
          grant_type: 'refresh_token',
          refresh_token: state.refreshToken,
          refreshToken: state.refreshToken,
          client_id: state.clientId,
          clientId: state.clientId,
          client_secret: state.clientSecret,
          clientSecret: state.clientSecret,
        },
        { headers: { 'Content-Type': contentType } }
      );

      const data = (response.data ?? {}) as Record<string, unknown>;

      const accessToken = this.responseAccessTokenPath
        ? getByPath(data, this.responseAccessTokenPath)
        : findInResponse(data, 'access_token', 'accessToken');

      if (typeof accessToken !== 'string' || !accessToken) {
        this.logger.error(
          'Failed to auto-renew token: no access token found in the response at any known location.',
        );
        return undefined;
      }

      const refreshTokenRaw = this.responseRefreshTokenPath
        ? getByPath(data, this.responseRefreshTokenPath)
        : findInResponse(data, 'refresh_token', 'refreshToken');
      const newRefreshToken = typeof refreshTokenRaw === 'string' && refreshTokenRaw ? refreshTokenRaw : state.refreshToken;

      const expiresInRaw = this.responseExpiresInPath
        ? getByPath(data, this.responseExpiresInPath)
        : findInResponse(data, 'expires_in', 'expiresIn');
      const expiresInNum = Number(expiresInRaw);
      const expiresInSecs = Number.isFinite(expiresInNum) && expiresInNum > 0 ? expiresInNum : this.defaultExpiresInSecs;

      const newState: OAuth2TokenState = {
        ...state,
        accessToken,
        refreshToken: newRefreshToken,
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
