/** A simple counting semaphore: caps how many `run()` callbacks execute at once, queueing the
 *  rest in call order. Used to bound concurrent outbound requests through a single executor
 *  instance (e.g. an LLM turn that fires off 20 tool calls against one flaky provider). */
export class ConcurrencyLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly limit: number) {
    if (limit < 1) {
      throw new Error(`ConcurrencyLimiter limit must be >= 1, got ${limit}`);
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}
