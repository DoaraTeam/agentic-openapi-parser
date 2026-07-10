export interface SpecCacheEntry {
  document: Record<string, unknown>;
  etag?: string;
  cachedAt: number;
}

/** In-memory TTL cache for dereferenced OpenAPI documents, keyed by spec URL/path. Isolated from
 *  OpenApiParserService so the expiry/staleness logic has its own tests. */
export class SpecCache {
  private readonly entries = new Map<string, SpecCacheEntry>();

  constructor(private readonly ttlMs: number) {}

  /** Returns the entry only if it's still within its TTL window. */
  get(key: string): SpecCacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    return Date.now() - entry.cachedAt < this.ttlMs ? entry : undefined;
  }

  /** Returns the entry regardless of TTL expiry — used for ETag revalidation of an expired entry. */
  getStale(key: string): SpecCacheEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: Omit<SpecCacheEntry, 'cachedAt'>): void {
    this.entries.set(key, { ...entry, cachedAt: Date.now() });
  }

  /** Refreshes cachedAt without re-fetching — used after a 304 Not Modified revalidation. */
  touch(key: string): void {
    const entry = this.entries.get(key);
    if (entry) entry.cachedAt = Date.now();
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
