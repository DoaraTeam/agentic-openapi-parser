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

  /** Exponential backoff with full jitter: a random delay in [0, retryDelayMs * 2^attempt]. */
  delayFor(attempt: number): number {
    const cap = this.retryDelayMs * 2 ** attempt;
    return Math.random() * cap;
  }
}
