import { z } from 'zod';
import { MemoryCache, TTL } from '../../cache/memory-cache.js';
import type { TmdbQuery } from '../../catalogs/discover-query.builder.js';
import type { DisplayLanguage, Lookups } from '../../../../shared/config.js';
import { TmdbError } from '../../utils/errors.js';
import { externalIdsSchema, findSchema, genreSchema, imagesSchema, seasonSchema, seriesDetailSchema, seriesPageSchema } from './tmdb.types.js';

interface TmdbOptions {
  token?: string;
  apiKey?: string;
  fetcher?: typeof fetch;
}

export class TmdbClient {
  private readonly cache = new MemoryCache<unknown>();
  private readonly fetcher: typeof fetch;
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly options: TmdbOptions) { this.fetcher = options.fetcher ?? fetch; }

  get configured(): boolean { return Boolean(this.options.token || this.options.apiKey); }

  validateCredentials() { return this.request('/authentication', z.object({ success: z.literal(true) }), {}, TTL.catalog); }

  private async limited<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 6) await new Promise<void>(resolve => this.waiting.push(resolve));
    else this.active++;
    try { return await operation(); } finally {
      const next = this.waiting.shift();
      if (next) next(); else this.active--;
    }
  }

  private async request<T>(path: string, schema: z.ZodType<T>, query: TmdbQuery = {}, ttl: number = TTL.metadata, language: DisplayLanguage = 'zh-CN'): Promise<T> {
    if (!this.configured) throw new TmdbError(503);
    const parameters = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, language }).sort(([a], [b]) => a.localeCompare(b))) {
      parameters.set(key, String(value));
    }
    const cacheKey = `${path}?${parameters}`;
    const value = await this.cache.remember(cacheKey, ttl, () => this.limited(async () => {
      if (!this.options.token && this.options.apiKey) parameters.set('api_key', this.options.apiKey);
      let response: Response;
      try {
        response = await this.fetcher(`https://api.themoviedb.org/3${path}?${parameters}`, {
          headers: { accept: 'application/json', ...(this.options.token ? { Authorization: `Bearer ${this.options.token}` } : {}) },
          signal: AbortSignal.timeout(12_000),
        });
      } catch { throw new TmdbError(504); }
      if (!response.ok) throw new TmdbError(response.status);
      let data: unknown;
      try { data = await response.json(); } catch { throw new TmdbError(502); }
      const parsed = schema.safeParse(data);
      if (!parsed.success) throw new TmdbError(502);
      return parsed.data;
    }));
    return schema.parse(value);
  }

  discover(query: TmdbQuery) { return this.request('/discover/tv', seriesPageSchema, query, TTL.catalog); }
  search(query: string, page: number, includeAdult: boolean) {
    return this.request('/search/tv', seriesPageSchema, { query, page, include_adult: includeAdult }, TTL.catalog);
  }
  series(id: number, language: DisplayLanguage = 'zh-CN') {
    return this.request(`/tv/${id}`, seriesDetailSchema, { append_to_response: 'external_ids,credits,images', include_image_language: language.slice(0, 2) }, TTL.metadata, language);
  }
  season(id: number, season: number, language: DisplayLanguage = 'zh-CN') { return this.request(`/tv/${id}/season/${season}`, seasonSchema, {}, TTL.metadata, language); }
  images(id: number, language: DisplayLanguage = 'zh-CN') { return this.request(`/tv/${id}/images`, imagesSchema, { include_image_language: language.slice(0, 2) }, TTL.metadata, language); }
  externalIds(id: number) { return this.request(`/tv/${id}/external_ids`, externalIdsSchema, {}, TTL.mapping); }
  find(imdbId: string) { return this.request(`/find/${imdbId}`, findSchema, { external_source: 'imdb_id' }, TTL.mapping); }
  async genres() {
    const schema = z.object({ genres: z.array(genreSchema) });
    const [chinese, english] = await Promise.all([
      this.request('/genre/tv/list', schema, {}, TTL.lookup),
      this.request('/genre/tv/list', schema, {}, TTL.lookup, 'en-US'),
    ]);
    const englishNames = new Map(english.genres.map(genre => [genre.id, genre.name]));
    return chinese.genres.map(genre => ({
      id: genre.id,
      name: [...new Set([genre.name, englishNames.get(genre.id)].filter(Boolean))].join(' · '),
    }));
  }
  async lookups(): Promise<Lookups> {
    return { genres: await this.genres() };
  }
}
