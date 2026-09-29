import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../addon/src/app.js';
import { encodeInstallation, testEncryptionKey } from './installation-fixture.js';
import { createDefaultConfig, type AddonConfig } from '../shared/config.js';
import { buildManifest } from '../addon/src/manifest.js';
import { TmdbClient } from '../addon/src/providers/tmdb/tmdb.client.js';
import { genres, tmdbFixture } from './fixtures.js';

let server: Server;
let base: string;
let encoded: string;
let fixture: ReturnType<typeof tmdbFixture>;
beforeEach(async () => {
  encoded = encodeInstallation({ version: 1, config: createDefaultConfig(), credentials: { apiKey: 'test-key', token: 'test-token' } });
  fixture = tmdbFixture();
  await new Promise<void>((resolve, reject) => {
    server = createApp({ encryptionKey: testEncryptionKey, fetcher: fixture.fetcher }).listen(0, '127.0.0.1', error => error ? reject(error) : resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  base = `http://127.0.0.1:${address.port}`;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
const get = (path: string) => fetch(`${base}/${encoded}${path}`);
const save = async (config: unknown) => {
  const response = await fetch(`${base}/api/configure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config, encodedConfig: encoded }) });
  if (response.ok) encoded = (await response.clone().json()).encodedConfig;
  return response;
};

describe('Stremio and configuration HTTP', () => {
  it('saves the example catalog and sends all expected upstream filters', async () => {
    const config = createDefaultConfig();
    Object.assign(config.catalogs[0]!, { name: '大陆热门剧集', voteAverageMin: 6, voteCountMin: 20 });
    expect((await save(config)).status).toBe(200);
    const response = await get('/catalog/series/catalog_default.json');
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await response.json()).toMatchObject({ metas: [{ id: 'cnative:zh-zh-zh:tt1234567', imdb_id: 'tt1234567', tmdb_id: 101, name: '逐玉', description: '这是 TMDB 中文剧情简介。', genres: ['剧情 · Drama'] }, ...Array.from({ length: 19 }, () => ({}))] });
    const query = fixture.urls.find(url => url.pathname.endsWith('/discover/tv'))?.searchParams;
    expect(Object.fromEntries(query!)).toMatchObject({ language: 'zh-CN', include_adult: 'false', with_origin_country: 'CN', sort_by: 'popularity.desc', 'vote_average.gte': '6', 'vote_count.gte': '20', page: '1' });
    expect(query!.has('with_original_language')).toBe(false);
    const manifest = await (await get('/manifest.json')).json();
    expect(manifest.name).toBe('cNative');
    expect(manifest.version).toBe('1.2.0');
    expect(manifest.behaviorHints.configurationRequired).toBe(false);
    expect(manifest.catalogs[0].name).toBe('大陆热门剧集');
    expect(manifest.catalogs[0].id).toBe('catalog_default');
  });
  it('uses TMDB pages and pushes Stremio genre into the request', async () => {
    const response = await get(`/catalog/series/catalog_default/genre=${encodeURIComponent('悬疑 · Mystery')}&skip=20.json`);
    expect(response.status).toBe(200);
    const discover = fixture.urls.find(url => url.pathname.endsWith('/discover/tv'))!;
    expect(discover.searchParams.get('page')).toBe('2');
    expect(discover.searchParams.get('with_genres')).toBe('18,9648');
    expect(await (await get('/catalog/series/catalog_default/skip=10000.json')).json()).toEqual({ metas: [] });
    expect((await get('/catalog/series/catalog_default/skip=-1.json')).status).toBe(400);
    expect((await get('/catalog/series/catalog_default/skip=0&skip=20.json')).status).toBe(400);
  });
  it('includes multiple selected genres and narrows a bilingual Stremio selection by ID', async () => {
    const config = createDefaultConfig();
    config.catalogs[0]!.includeGenres = [18, 35];
    expect((await save(config)).status).toBe(200);
    expect((await get('/catalog/series/catalog_default.json')).status).toBe(200);
    expect((await get(`/catalog/series/catalog_default/genre=${encodeURIComponent('喜剧 · Comedy')}.json`)).status).toBe(200);
    expect(fixture.urls.filter(url => url.pathname.endsWith('/discover/tv')).map(url => url.searchParams.get('with_genres'))).toEqual(['18|35', '35']);
  });
  it('returns an IMDb-compatible detailed episode response', async () => {
    const response = await get('/meta/series/cnative:zh-zh-zh:tt1234567.json');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ meta: { name: '逐玉', videos: [{ id: 'tt1234567:1:1', title: '初见', overview: '相逢的故事。' }] } });
    expect(await (await get('/meta/movie/tt1234567.json')).json()).toEqual({ meta: null });
  });
  it('separates native metadata IDs from IMDb rating IDs in catalogs, search and details', async () => {
    const paths = [
      '/catalog/series/catalog_default.json',
      ...['逐玉', 'Pursuit of Jade'].map(query => `/catalog/series/cnative_search/search=${encodeURIComponent(query)}.json`),
    ];
    for (const path of paths) {
      const catalog = await (await get(path)).json();
      const preview = catalog.metas[0];
      expect(preview).toMatchObject({ id: 'cnative:zh-zh-zh:tt1234567', imdb_id: 'tt1234567', tmdb_id: 101, type: 'series', name: '逐玉', logo: 'https://image.tmdb.org/t/p/w500/chinese-logo.png' });
      expect(preview).not.toHaveProperty('imdbRating');
      const response = await get(`/meta/series/${encodeURIComponent(preview.id)}.json`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ meta: {
        id: preview.id, imdb_id: preview.imdb_id, tmdb_id: preview.tmdb_id, name: preview.name, description: preview.description, logo: 'https://image.tmdb.org/t/p/w500/chinese-logo.png',
        videos: [{ id: 'tt1234567:1:1', title: '初见', overview: '相逢的故事。' }],
      } });
    }
    const manifest = await (await get('/manifest.json')).json();
    expect(manifest.resources).toContainEqual({ name: 'meta', types: ['series'], idPrefixes: ['cnative:'] });
    expect(manifest.catalogs).toContainEqual(expect.objectContaining({ id: 'cnative_search', name: 'cNative' }));
  });
  it('searches once, retains literal ampersands and includes only China origins regardless of language', async () => {
    const query = '逐玉 & Pursuit of Jade';
    const response = await get(`/catalog/series/cnative_search/search=${encodeURIComponent(query)}.json`);
    const body = await response.json();
    expect(body.metas.map((meta: { tmdb_id: number }) => meta.tmdb_id)).toEqual([101, 104]);
    expect(fixture.urls.filter(url => url.pathname.endsWith('/search/tv'))).toHaveLength(1);
    expect(fixture.urls.find(url => url.pathname.endsWith('/search/tv'))?.searchParams.get('query')).toBe(query);
    expect(await (await get(`/catalog/series/catalog_default/search=${encodeURIComponent(query)}.json`)).json()).toEqual({ metas: [] });
  });
  it('caches preview artwork and keeps results usable when optional images fail', async () => {
    const fetcher = fixture.fetcher.getMockImplementation()!;
    fixture.fetcher.mockImplementation(async (input, init) => {
      if (new URL(String(input)).pathname.endsWith('/tv/101/images')) return new Response('{}', { status: 502 });
      return fetcher(input, init);
    });
    const path = `/catalog/series/cnative_search/search=${encodeURIComponent('逐玉')}.json`;
    for (let request = 0; request < 2; request++) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { metas } = await response.json();
      expect(metas[0]).toMatchObject({ id: 'cnative:zh-zh-zh:tt1234567', imdb_id: 'tt1234567', tmdb_id: 101, name: '逐玉' });
      expect(metas[0]).not.toHaveProperty('logo');
      expect(metas[1].logo).toBe('https://image.tmdb.org/t/p/w500/chinese-logo.png');
    }
    const images = fixture.urls.filter(url => url.pathname.endsWith('/tv/104/images'));
    expect(images).toHaveLength(1);
    expect(images[0]?.searchParams.get('include_image_language')).toBe('zh');
  });
  it('rejects invalid configuration without changing the installed URL', async () => {
    const previous = encoded;
    expect((await save({ ...createDefaultConfig(), metadataLanguage: 'en-US' })).status).toBe(400);
    expect(encoded).toBe(previous);
    expect((await (await get('/manifest.json')).json()).catalogs[0].name).toBe('华语热门剧集');
  });
  it('honors enable/home controls and exposes TMDB lookup choices', async () => {
    const config = createDefaultConfig();
    config.catalogs[0]!.showInHome = false;
    await save(config);
    expect(await (await get('/catalog/series/catalog_default.json')).json()).toEqual({ metas: [] });
    expect((await (await get(`/catalog/series/catalog_default/genre=${encodeURIComponent('全部 · All')}.json`)).json()).metas).toHaveLength(20);
    config.catalogs[0]!.enabled = false;
    await save(config);
    expect((await (await get('/manifest.json')).json()).catalogs).toHaveLength(1);
    expect(await (await fetch(`${base}/api/lookups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ encodedConfig: encoded }) })).json()).toEqual({ genres });
  });
});

it('preserves enabled catalog order and narrows bilingual genre options', () => {
  const first = createDefaultConfig().catalogs[0]!;
  const config: AddonConfig = { ...createDefaultConfig(), catalogs: [
    { ...first, id: 'catalog_second', showInHome: false, includeGenres: [18, 35] },
    { ...first, id: 'catalog_disabled', enabled: false }, first,
  ] };
  const manifest = buildManifest(config, genres, true);
  expect(manifest.catalogs.map(catalog => catalog.id)).toEqual(['catalog_second', 'catalog_default', 'cnative_search']);
  expect(manifest.catalogs[0]?.extra?.[0]).toMatchObject({ isRequired: true, options: ['全部 · All', '剧情 · Drama', '喜剧 · Comedy'] });
});

it('fails clearly when TMDB credentials are absent', async () => {
  await expect(new TmdbClient({}).genres()).rejects.toMatchObject({ status: 503 });
});
