import { MemoryCache, TTL } from '../cache/memory-cache.js';
import type { TmdbClient } from '../providers/tmdb/tmdb.client.js';

export const CNATIVE_ID_PREFIX = 'cnative:';
export const isImdbId = (value: string): boolean => /^tt\d{7,}$/.test(value);

export class IdResolver {
  private readonly imdbByTmdb = new MemoryCache<string | null>(10_000);
  private readonly tmdbByImdb = new MemoryCache<number | null>(10_000);

  constructor(private readonly tmdb: TmdbClient) {}

  remember(tmdbId: number, imdbId: string | null | undefined): string {
    const valid = imdbId && isImdbId(imdbId) ? imdbId : null;
    this.imdbByTmdb.set(String(tmdbId), valid, TTL.mapping);
    if (valid) this.tmdbByImdb.set(valid, tmdbId, TTL.mapping);
    return valid ?? `tmdb:${tmdbId}`;
  }

  async toExternalId(tmdbId: number): Promise<string> {
    const imdbId = await this.imdbByTmdb.remember(String(tmdbId), TTL.mapping, async () => {
      const ids = await this.tmdb.externalIds(tmdbId);
      const resolved = this.remember(tmdbId, ids.imdb_id);
      return isImdbId(resolved) ? resolved : null;
    });
    return imdbId ?? `tmdb:${tmdbId}`;
  }

  async toTmdbId(id: string): Promise<number | null> {
    if (id.startsWith(CNATIVE_ID_PREFIX)) id = id.slice(CNATIVE_ID_PREFIX.length);
    if (/^tmdb:[1-9]\d*$/.test(id)) {
      const value = Number(id.slice(5));
      return Number.isSafeInteger(value) ? value : null;
    }
    if (!isImdbId(id)) return null;
    return this.tmdbByImdb.remember(id, TTL.mapping, async () => {
      const found = await this.tmdb.find(id);
      const tmdbId = found.tv_results[0]?.id ?? null;
      if (tmdbId !== null) this.remember(tmdbId, id);
      return tmdbId;
    });
  }
}
