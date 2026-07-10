import { SpecCache } from './spec-cache';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('SpecCache', () => {
  it('returns undefined for a key that was never set', () => {
    const cache = new SpecCache(1000);
    expect(cache.get('missing')).toBeUndefined();
    expect(cache.getStale('missing')).toBeUndefined();
  });

  it('returns a set entry via get() while within the TTL', () => {
    const cache = new SpecCache(1000);
    cache.set('spec', { document: { ok: true } });

    expect(cache.get('spec')?.document).toEqual({ ok: true });
  });

  it('expires an entry from get() after the TTL elapses, but keeps it in getStale()', async () => {
    const cache = new SpecCache(10);
    cache.set('spec', { document: { ok: true } });

    await wait(20);

    expect(cache.get('spec')).toBeUndefined();
    expect(cache.getStale('spec')?.document).toEqual({ ok: true });
  });

  it('touch() refreshes cachedAt so the entry becomes fresh again', async () => {
    const cache = new SpecCache(10);
    cache.set('spec', { document: { ok: true } });

    await wait(20);
    expect(cache.get('spec')).toBeUndefined();

    cache.touch('spec');
    expect(cache.get('spec')?.document).toEqual({ ok: true });
  });

  it('touch() on a missing key is a no-op', () => {
    const cache = new SpecCache(1000);
    expect(() => cache.touch('missing')).not.toThrow();
  });

  it('invalidate() removes a single entry', () => {
    const cache = new SpecCache(1000);
    cache.set('a', { document: { id: 'a' } });
    cache.set('b', { document: { id: 'b' } });

    cache.invalidate('a');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')?.document).toEqual({ id: 'b' });
  });

  it('clear() removes every entry', () => {
    const cache = new SpecCache(1000);
    cache.set('a', { document: { id: 'a' } });
    cache.set('b', { document: { id: 'b' } });

    cache.clear();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('stores and returns the etag alongside the document', () => {
    const cache = new SpecCache(1000);
    cache.set('spec', { document: {}, etag: 'W/"abc"' });

    expect(cache.get('spec')?.etag).toBe('W/"abc"');
  });
});
