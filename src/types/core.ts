export enum DynamicProviderAuthType {
  NONE = 'NONE',
  API_KEY = 'API_KEY',
  BEARER = 'BEARER',
  OAUTH2 = 'OAUTH2',
  BASIC = 'BASIC',
}

export interface DynamicToolDefinition {
  name: string;
  description: string;
  method: string;
  url: string;
  parameters: Record<string, unknown>[];
  security?: Record<string, unknown>[];
  providerId?: string;
  requestBodySchema?: Record<string, unknown>;
  requestBodyRequired?: boolean;
  tags?: string[];
}

export interface ParsedOpenApiSpec {
  document: Record<string, unknown>;
  tools: DynamicToolDefinition[];
}

export interface ResponseProcessor {
  process(data: unknown): unknown;
}

export interface OAuth2TokenState {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
}

export interface TokenRefresher {
  /**
   * Returns a refreshed token state if a refresh happened (the executor uses it immediately for
   * the in-flight request), or undefined if no refresh was needed or possible. Must not throw —
   * refresh failures are caught internally and reported via undefined so the caller falls back
   * to the existing token.
   */
  refreshIfNeeded(state: OAuth2TokenState): Promise<OAuth2TokenState | undefined>;
}

export interface AccessTokenProvider {
  /**
   * Returns a currently-valid access token, acquiring or renewing it internally as needed (e.g. an
   * OAuth2 client_credentials grant). Unlike TokenRefresher there is no pre-existing token to fall
   * back to on the very first call, so implementations may throw when no valid token can be
   * obtained at all — the executor lets that propagate as-is rather than forcing it through the
   * HTTP-response-shaped error handling used for a failed tool call.
   */
  getAccessToken(): Promise<string>;
}

export interface RetryOptions {
  /** Number of retry attempts after the initial call. Default 0 (no retry). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (attempt 0 waits up to this long). Default 300. */
  retryDelayMs?: number;
  /** HTTP status codes worth retrying. Default [408, 429, 500, 502, 503, 504]. */
  retryableStatusCodes?: number[];
  /** Whether to retry when the request fails with no HTTP response at all (timeout, DNS, reset). Default true. */
  retryOnNetworkError?: boolean;
}

export interface RequestStartInfo {
  /** Correlates this call's start/end/retry events — needed because executeMany can run the same toolName concurrently more than once. */
  requestId: string;
  toolName: string;
}

export interface RequestEndInfo extends RequestStartInfo {
  durationMs: number;
  success: boolean;
  statusCode?: number;
}

export interface RetryInfo extends RequestStartInfo {
  /** 1-based: the attempt that just failed and is about to be retried. */
  attempt: number;
  delayMs: number;
  statusCode?: number;
}

export interface ObservabilityHooks {
  onRequestStart?: (info: RequestStartInfo) => void;
  onRequestEnd?: (info: RequestEndInfo) => void;
  onRetry?: (info: RetryInfo) => void;
}

export interface ExecuteToolOptions {
  authType?: DynamicProviderAuthType;
  accessToken?: string;
  timeout?: number;
  responseProcessors?: ResponseProcessor[];
  tokenRefresher?: TokenRefresher;
  oauth2State?: OAuth2TokenState;
  /** Supplies the access token from scratch (e.g. OAuth2 client_credentials). Takes precedence over tokenRefresher/oauth2State when both are set — the two model different grant types and aren't meant to be combined. */
  accessTokenProvider?: AccessTokenProvider;
  retry?: RetryOptions;
  /** Must match the namespace passed to parseAndFlatten() for this tool, so its name can be resolved back to the OpenAPI operation. */
  namespace?: string;
  /** Synchronous callbacks for wiring into an APM/tracing tool of the caller's choice. A throwing hook is caught and logged — it never fails the tool call. */
  hooks?: ObservabilityHooks;
}

export interface IAiAdapter<TTool = unknown, TReturnType = TTool[]> {
  getTools(): TReturnType;
}

export interface ToolCallRequest {
  toolName: string;
  args: Record<string, unknown>;
}

export type ToolCallOutcome =
  | { toolName: string; status: 'fulfilled'; value: unknown }
  | { toolName: string; status: 'rejected'; reason: unknown };
