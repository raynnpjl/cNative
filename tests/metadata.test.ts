import { describe, expect, it } from 'vitest';
import { chineseDisplayLanguages, createDefaultConfig } from '../shared/config.js';
import { IdResolver } from '../addon/src/ids/id-resolver.service.js';
import { MetadataService } from '../addon/src/metadata/metadata.service.js';
import { mapEpisode, mapMetadata, resolveDisplayTitle } from '../addon/src/metadata/metadata.mapper.js';
import { imageUrl } from '../addon/src/utils/images.js';
import { detail, episode, genres, season, show, tmdbFixture } from './fixtures.js';

describe('Chinese metadata', () => {
  it('prefers the requested localized title, then the original name', () => {
    expect(resolveDisplayTitle(show)).toBe('逐玉');
    expect(resolveDisplayTitle({ ...show, name: '中文译名' })).toBe('中文译名');
    expect(resolveDisplayTitle({ ...show, name: '' })).toBe('逐玉');
    expect(resolveDisplayTitle({ ...show, name: 'Pursuit of Jade' })).toBe('Pursuit of Jade');
  });
  it.each(['US', 'HK', 'TW', 'MO', 'SG', undefined])('rejects metadata outside China even with Chinese original language: %s', async country => {
    const { client, fetcher, urls } = tmdbFixture();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => new URL(String(input)).pathname === '/3/tv/101'
      ? Response.json({ ...detail, origin_country: country ? [country] : [] }) : original(input, init));
    expect(await new MetadataService(client, new IdResolver(client)).get('cnative:zh-zh-zh:tmdb:101', createDefaultConfig())).toBeNull();
    expect(urls.some(url => url.pathname.includes('/season/'))).toBe(false);
  });
  it('accepts China co-productions regardless of original language', async () => {
    const { client, fetcher } = tmdbFixture();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => new URL(String(input)).pathname === '/3/tv/101'
      ? Response.json({ ...detail, origin_country: ['US', 'CN'], original_language: 'en' }) : original(input, init));
    expect(await new MetadataService(client, new IdResolver(client)).get('cnative:en-en-en:tmdb:101', createDefaultConfig())).toMatchObject({ tmdb_id: 101, videos: [{ id: 'tt1234567:1:1' }] });
  });
  it('uses Chinese episodes and conventional fallback titles/IDs, never fake dates or artwork', () => {
    expect(mapEpisode(episode, 'tt1234567', 'zh-CN')).toMatchObject({ id: 'tt1234567:1:1', title: '初见', overview: '相逢的故事。', runtime: '45 min' });
    const missing = mapEpisode({ ...episode, name: '', overview: '', air_date: null, still_path: null }, 'tmdb:101', 'zh-CN');
    expect(missing).toMatchObject({ id: 'tmdb:101:1:1', title: '第 1 集' });
    expect(missing.overview).toBeUndefined(); expect(missing.released).toBeUndefined(); expect(missing.thumbnail).toBeUndefined();
    expect(imageUrl(null)).toBeUndefined(); expect(imageUrl('undefined')).toBeUndefined();
  });
  it('retrieves regular seasons in zh-CN and uses bilingual genre labels', async () => {
    const { client, urls } = tmdbFixture();
    const service = new MetadataService(client, new IdResolver(client));
    const meta = await service.get('cnative:zh-zh-zh:tt1234567', createDefaultConfig());
    expect(meta).toMatchObject({ id: 'cnative:zh-zh-zh:tt1234567', imdb_id: 'tt1234567', tmdb_id: 101, name: '逐玉', logo: 'https://image.tmdb.org/t/p/w500/chinese-logo.png', description: show.overview, genres: ['剧情 · Drama', '喜剧 · Comedy', '悬疑 · Mystery'], cast: ['演员甲'] });
    expect(meta).not.toHaveProperty('imdbRating');
    expect(meta?.videos[0]?.id).toBe('tt1234567:1:1');
    expect(urls.filter(url => !url.pathname.endsWith('/genre/tv/list')).every(url => url.searchParams.get('language') === 'zh-CN')).toBe(true);
    expect(urls.some(url => url.pathname.endsWith('/season/0'))).toBe(false);
    expect(await service.get('cnative:zh-zh-zh:tmdb:999', createDefaultConfig())).toBeNull();
  });
  it('keeps native metadata IDs without inventing an IMDb mapping', () => {
    const meta = mapMetadata({ ...detail, external_ids: { imdb_id: null } }, 'tmdb:101', [season], chineseDisplayLanguages, genres);
    expect(meta.id).toBe('cnative:zh-zh-zh:tmdb:101');
    expect(meta.tmdb_id).toBe(101);
    expect(meta.imdb_id).toBeUndefined();
    expect(meta.videos[0]?.id).toBe('tmdb:101:1:1');
  });
  it.each([
    undefined,
    { logos: [] },
    { logos: [{ iso_639_1: 'en', file_path: '/english-logo.png', vote_average: 9, vote_count: 100 }] },
    { logos: [{ iso_639_1: null, file_path: '/unknown-language.png', vote_average: 9, vote_count: 100 }] },
    { logos: [{ iso_639_1: 'zh', file_path: 'null', vote_average: 9, vote_count: 100 }] },
  ])('keeps the native text title when Chinese title art is unavailable: %j', images => {
    const meta = mapMetadata({ ...detail, images }, 'tt1234567', [season], chineseDisplayLanguages, genres);
    expect(meta.name).toBe('逐玉');
    expect(JSON.parse(JSON.stringify(meta))).not.toHaveProperty('logo');
  });
  it('skips invalid artwork and requests a PNG rendering of a Chinese SVG logo', () => {
    const images = { logos: [
      { iso_639_1: 'zh', file_path: 'https://other.example/logo.png', vote_average: 10, vote_count: 100 },
      { iso_639_1: 'zh', file_path: '/chinese-title.svg', vote_average: 8, vote_count: 2 },
    ] };
    const meta = mapMetadata({ ...detail, images }, 'tt1234567', [season], chineseDisplayLanguages, genres);
    expect(meta).toMatchObject({ name: '逐玉', logo: 'https://image.tmdb.org/t/p/w500/chinese-title.png' });
  });
});

describe('IMDb mapping', () => {
  it('caches both directions and preserves TMDB fallback IDs', async () => {
    const { client, urls } = tmdbFixture();
    const ids = new IdResolver(client);
    expect(await ids.toExternalId(101)).toBe('tt1234567');
    expect(await ids.toExternalId(101)).toBe('tt1234567');
    expect(await ids.toTmdbId('tt1234567')).toBe(101);
    expect(urls).toHaveLength(1);
    expect(await ids.toExternalId(102)).toBe('tmdb:102');
    expect(await ids.toTmdbId('tmdb:102')).toBe(102);
  });
  it('finds IMDb TV matches and rejects movie-only/invalid IDs', async () => {
    const { client } = tmdbFixture();
    const ids = new IdResolver(client);
    expect(await ids.toTmdbId('tt1234567')).toBe(101);
    expect(await ids.toTmdbId('tt9999999')).toBeNull();
    expect(await ids.toTmdbId('tmdb:10garbage')).toBeNull();
    expect(await ids.toTmdbId('tt1234567:1:1')).toBeNull();
  });
  it('resolves only external IDs and rejects metadata and malformed IDs', async () => {
    const { client, urls } = tmdbFixture();
    const ids = new IdResolver(client);
    expect(await ids.toTmdbId('tt1234567')).toBe(101);
    expect(await ids.toTmdbId('tmdb:102')).toBe(102);
    for (const id of ['cnative:tt1234567', 'cnative:zh-zh-zh:tt1234567', 'cnative:', 'tmdb:0', 'tmdb:102:1:1', 'tmdb:9007199254740992']) {
      expect(await ids.toTmdbId(id)).toBeNull();
    }
    expect(urls).toHaveLength(1);
  });
});
