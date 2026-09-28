import { describe, expect, it, vi } from 'vitest';
import { MemoryCache, TTL } from '../addon/src/cache/memory-cache.js';
import { TmdbClient } from '../addon/src/providers/tmdb/tmdb.client.js';
import { tmdbFixture } from './fixtures.js';

describe('bounded cache', () => {
  it('expires entries, keeps mappings longer and evicts least recently used entries', () => {
    let now = 0; const cache = new MemoryCache<number>(2, () => now);
    cache.set('query', 1, TTL.catalog); cache.set('mapping', 2, TTL.mapping);
    now = TTL.catalog + 1;
    expect(cache.get('query')).toBeUndefined(); expect(cache.get('mapping')).toBe(2);
    cache.set('third', 3, 100); cache.get('mapping'); cache.set('fourth', 4, 100);
    expect(cache.get('third')).toBeUndefined();
  });
  it('coalesces concurrent loads and retries failures', async () => {
    const cache = new MemoryCache<number>(); const load = vi.fn(async () => 3);
    expect(await Promise.all([cache.remember('key', 1000, load), cache.remember('key', 1000, load)])).toEqual([3, 3]);
    expect(load).toHaveBeenCalledOnce();
    await expect(cache.remember('error', 1000, async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    expect(await cache.remember('error', 1000, async () => 4)).toBe(4);
  });
});

describe('TMDB client', () => {
  it('joins Chinese and English genre names by ID and caches both language lists', async () => {
    const { client, fetcher, urls } = tmdbFixture();
    expect(await client.genres()).toEqual([
      { id: 18, name: '剧情 · Drama' }, { id: 35, name: '喜剧 · Comedy' }, { id: 9648, name: '悬疑 · Mystery' },
    ]);
    await client.genres();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(urls.map(url => url.searchParams.get('language')).sort()).toEqual(['en-US', 'zh-CN']);
  });
  it('does not invent or duplicate genre names when TMDB lacks a Chinese label', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ genres: [{ id: 10765, name: 'Sci-Fi & Fantasy' }] }));
    expect(await new TmdbClient({ token: 'test', fetcher }).genres()).toEqual([{ id: 10765, name: 'Sci-Fi & Fantasy' }]);
  });
  it('uses Bearer auth and caches lookups, catalog, search, series and seasons', async () => {
    const { client, fetcher } = tmdbFixture();
    await client.lookups(); await client.lookups();
    await client.discover({ page: 1 }); await client.discover({ page: 1 });
    await client.search('逐玉', 1, false); await client.search('逐玉', 1, false);
    await client.series(101); await client.series(101);
    await client.season(101, 1); await client.season(101, 1);
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
  });
  it('appends Chinese title images to the cached localized series request', async () => {
    const { client, urls } = tmdbFixture();
    const series = await client.series(101);
    await client.series(101);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.searchParams.get('language')).toBe('zh-CN');
    expect(urls[0]?.searchParams.get('append_to_response')?.split(',')).toContain('images');
    expect(urls[0]?.searchParams.get('include_image_language')).toBe('zh');
    expect(series).toHaveProperty('images.logos');
  });
  it('supports v3 keys and propagates upstream failure without caching it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 429 })).mockImplementation(async () => Response.json({ genres: [] }));
    const client = new TmdbClient({ apiKey: 'test-key', fetcher });
    await expect(client.genres()).rejects.toMatchObject({ status: 429 });
    await expect(client.genres()).resolves.toEqual([]);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('api_key=test-key');
  });
  it('validates upstream payloads and hides credentials from errors', async () => {
    const client = new TmdbClient({ apiKey: 'secret', fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error('https://example?api_key=secret')) });
    await expect(client.genres()).rejects.toThrow('504');
    const malformed = new TmdbClient({ token: 'secret', fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ genres: 'wrong' })) });
    await expect(malformed.genres()).rejects.toMatchObject({ status: 502 });
  });
});
