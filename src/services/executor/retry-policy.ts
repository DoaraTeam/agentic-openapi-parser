import { RetryOptions } from '@/types';

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/** Decides whether a failed attempt should be retried and how long to wait first.
 *  Isolated from DynamicToolExecutorService so the backoff math has its own unit tests
 *  and can be swapped without touching request/response wiring. */
export class RetryPolicy {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly retryableStatusCodes: number[];
  private readonly retryOnNetworkError: boolean;

  constructor(options?: RetryOptions) {
    this.maxRetries = options?.maxRetries ?? 0;
    this.retryDelayMs = options?.retryDelayMs ?? 300;
    this.retryableStatusCodes = options?.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES;
    this.retryOnNetworkError = options?.retryOnNetworkError ?? true;
  }

  /** `attempt` is 0-indexed: 0 for the first retry decision, after the initial call failed. */
  shouldRetry(attempt: number, statusCode: number | undefined): boolean {
    if (attempt >= this.maxRetries) return false;
    if (statusCode === undefined) return this.retryOnNetworkError;
    return this.retryableStatusCodes.includes(statusCode);
  }

  /**
   * A server's `Retry-After` value takes priority over our own backoff math — it's the server
   * telling us exactly how long it wants us to wait. Falls back to exponential backoff with full
   * jitter (a random delay in [0, retryDelayMs * 2^attempt]) when the header is absent or unparseable.
   */
  delayFor(attempt: number, retryAfterHeader?: string): number {
    const retryAfterMs = this.parseRetryAfter(retryAfterHeader);
    if (retryAfterMs !== undefined) return retryAfterMs;

    const cap = this.retryDelayMs * 2 ** attempt;
    return Math.random() * cap;
  }

  /** Accepts both forms the header comes in: a delay in seconds, or an HTTP-date to wait until. */
  private parseRetryAfter(header: string | undefined): number | undefined {
    if (!header) return undefined;

    const seconds = Number(header);
    if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);

    const targetMs = Date.parse(header);
    if (!Number.isNaN(targetMs)) return Math.max(0, targetMs - Date.now());

    return undefined;
  }
}
