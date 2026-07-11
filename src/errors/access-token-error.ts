import { AgenticOpenApiError } from './agentic-openapi-error';

/** Thrown by an AccessTokenProvider (e.g. ClientCredentialsTokenProvider) when it cannot obtain a
 *  usable access token at all — as opposed to TokenRefresher, which never throws and instead
 *  falls back to the existing token. */
export class AccessTokenError extends AgenticOpenApiError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
