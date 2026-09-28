export const TTL = {
  catalog: 5 * 60_000,
  metadata: 6 * 60 * 60_000,
  lookup: 24 * 60 * 60_000,
  mapping: 30 * 24 * 60 * 60_000,
} as const;

export class MemoryCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();
  private readonly pending = new Map<string, Promise<T>>();

  constructor(private readonly maxEntries = 2000, private readonly now = Date.now) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= this.now()) { this.entries.delete(key); return undefined; }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttl: number): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttl });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  async remember(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const active = this.pending.get(key);
    if (active) return active;
    const promise = load().then(value => { this.set(key, value, ttl); return value; });
    this.pending.set(key, promise);
    try { return await promise; } finally { this.pending.delete(key); }
  }
}
