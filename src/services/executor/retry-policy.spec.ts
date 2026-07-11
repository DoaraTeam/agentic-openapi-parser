import { RetryPolicy } from './retry-policy';

describe('RetryPolicy', () => {
  describe('shouldRetry', () => {
    it('never retries when maxRetries is not set (default 0)', () => {
      const policy = new RetryPolicy();
      expect(policy.shouldRetry(0, 500)).toBe(false);
    });

    it('retries a retryable status code up to maxRetries', () => {
      const policy = new RetryPolicy({ maxRetries: 2 });
      expect(policy.shouldRetry(0, 503)).toBe(true);
      expect(policy.shouldRetry(1, 503)).toBe(true);
      expect(policy.shouldRetry(2, 503)).toBe(false);
    });

    it('does not retry a non-retryable status code', () => {
      const policy = new RetryPolicy({ maxRetries: 3 });
      expect(policy.shouldRetry(0, 400)).toBe(false);
      expect(policy.shouldRetry(0, 401)).toBe(false);
    });

    it('honors a custom retryableStatusCodes list', () => {
      const policy = new RetryPolicy({ maxRetries: 1, retryableStatusCodes: [418] });
      expect(policy.shouldRetry(0, 418)).toBe(true);
      expect(policy.shouldRetry(0, 500)).toBe(false);
    });

    it('retries network errors (no status code) by default', () => {
      const policy = new RetryPolicy({ maxRetries: 1 });
      expect(policy.shouldRetry(0, undefined)).toBe(true);
    });

    it('does not retry network errors when retryOnNetworkError is false', () => {
      const policy = new RetryPolicy({ maxRetries: 1, retryOnNetworkError: false });
      expect(policy.shouldRetry(0, undefined)).toBe(false);
    });
  });

  describe('delayFor', () => {
    it('produces a delay within [0, retryDelayMs * 2^attempt] with no Retry-After header', () => {
      const policy = new RetryPolicy({ retryDelayMs: 100 });
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      expect(policy.delayFor(0)).toBe(50);
      expect(policy.delayFor(1)).toBe(100);
      expect(policy.delayFor(2)).toBe(200);

      spy.mockRestore();
    });

    it('honors a Retry-After header given as a number of seconds, overriding backoff math', () => {
      const policy = new RetryPolicy({ retryDelayMs: 100 });
      expect(policy.delayFor(5, '2')).toBe(2000);
    });

    it('honors a Retry-After header given as an HTTP-date', () => {
      const policy = new RetryPolicy();
      const target = new Date(Date.now() + 5000);

      const delay = policy.delayFor(0, target.toUTCString());

      expect(delay).toBeGreaterThan(4000);
      expect(delay).toBeLessThanOrEqual(5000);
    });

    it('clamps a past Retry-After date to 0 instead of a negative delay', () => {
      const policy = new RetryPolicy();
      const pastDate = new Date(Date.now() - 60_000).toUTCString();

      expect(policy.delayFor(0, pastDate)).toBe(0);
    });

    it('falls back to backoff math when the header is unparseable', () => {
      const policy = new RetryPolicy({ retryDelayMs: 100 });
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      expect(policy.delayFor(0, 'not-a-valid-value')).toBe(50);

      spy.mockRestore();
    });

    it('falls back to backoff math when no header is given', () => {
      const policy = new RetryPolicy({ retryDelayMs: 100 });
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);

      expect(policy.delayFor(0, undefined)).toBe(50);

      spy.mockRestore();
    });
  });
});
