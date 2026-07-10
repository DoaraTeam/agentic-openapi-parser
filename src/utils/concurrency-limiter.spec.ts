import { ConcurrencyLimiter } from './concurrency-limiter';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ConcurrencyLimiter', () => {
  it('rejects a limit below 1', () => {
    expect(() => new ConcurrencyLimiter(0)).toThrow(/limit must be >= 1/);
  });

  it('runs tasks immediately while under the limit', async () => {
    const limiter = new ConcurrencyLimiter(2);
    const order: string[] = [];

    await Promise.all([
      limiter.run(async () => {
        order.push('a');
      }),
      limiter.run(async () => {
        order.push('b');
      }),
    ]);

    expect(order).toEqual(['a', 'b']);
  });

  it('queues tasks beyond the limit until an earlier one finishes', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const first = deferred<void>();
    const started: string[] = [];

    const taskA = limiter.run(async () => {
      started.push('a');
      await first.promise;
    });
    const taskB = limiter.run(async () => {
      started.push('b');
    });

    // Give the microtask queue a chance to run task A's start but not task B's (still gated).
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual(['a']);

    first.resolve();
    await Promise.all([taskA, taskB]);
    expect(started).toEqual(['a', 'b']);
  });

  it('releases the slot even when a task throws', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await expect(
      limiter.run(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    const result = await limiter.run(async () => 'ok');
    expect(result).toBe('ok');
  });
});
