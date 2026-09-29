import { describe, expect, it } from 'vitest';
import { chineseDisplayLanguages, createDefaultConfig, type DisplayLanguage, type DisplayLanguages } from '../shared/config.js';
import { CatalogService, SEARCH_CATALOG_ID } from '../addon/src/catalogs/catalog.service.js';
import { IdResolver } from '../addon/src/ids/id-resolver.service.js';
import { metadataId, parseMetadataId } from '../addon/src/ids/metadata-id.js';
import { MetadataService } from '../addon/src/metadata/metadata.service.js';
import { mapEpisode, resolveTitleLogo } from '../addon/src/metadata/metadata.mapper.js';
import { englishDetail, englishSeason, episode, season, show, tmdbFixture } from './fixtures.js';

const locales: DisplayLanguage[] = ['zh-CN', 'en-US'];
const combinations: DisplayLanguages[] = locales.flatMap(titleLanguage => locales.flatMap(synopsisLanguage =>
  locales.map(episodeNameLanguage => ({ titleLanguage, synopsisLanguage, episodeNameLanguage }))));

describe('per-catalog display languages', () => {
  it.each(combinations)('serves cards and details with $titleLanguage / $synopsisLanguage / $episodeNameLanguage', async languages => {
    const { client, urls } = tmdbFixture();
    const ids = new IdResolver(client);
    const catalogs = new CatalogService(client, ids);
    const metadata = new MetadataService(client, ids);
    const config = createDefaultConfig();
    Object.assign(config.catalogs[0]!, languages);
    const cards = await catalogs.get('catalog_default', { skip: '19' }, config);
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    const id = metadataId('tmdb:120', languages);
    expect(parseMetadataId(id)).toEqual({ externalId: 'tmdb:120', languages });
    expect(card).toMatchObject({
      id, tmdb_id: 120,
      name: languages.titleLanguage === 'en-US' ? englishDetail.name : show.name,
      description: languages.synopsisLanguage === 'en-US' ? englishDetail.overview : show.overview,
      logo: `https://image.tmdb.org/t/p/w500/${languages.titleLanguage === 'en-US' ? 'english' : 'chinese'}-logo.png`,
    });
    // No catalog is needed to restore preferences from a saved library identity.
    const meta = await metadata.get(card.id, { ...config, catalogs: [] });
    expect(meta).toMatchObject({ id, name: card.name, description: card.description, logo: card.logo });
    expect(meta?.videos[0]).toMatchObject({
      id: 'tmdb:120:1:1',
      title: languages.episodeNameLanguage === 'en-US' ? englishSeason.episodes[0]!.name : episode.name,
      overview: languages.synopsisLanguage === 'en-US' ? englishSeason.episodes[0]!.overview : episode.overview,
    });
    const details = urls.filter(url => url.pathname === '/3/tv/120');
    const seasons = urls.filter(url => url.pathname === '/3/tv/120/season/1');
    expect(details.map(url => url.searchParams.get('language')).sort()).toEqual([...new Set([languages.titleLanguage, languages.synopsisLanguage])].sort());
    expect(seasons.map(url => url.searchParams.get('language')).sort()).toEqual([...new Set([languages.episodeNameLanguage, languages.synopsisLanguage])].sort());
    for (const url of details) expect(url.searchParams.get('include_image_language')).toBe(url.searchParams.get('language')!.slice(0, 2));
    const count = urls.length;
    await metadata.get(card.id, config);
    await catalogs.get('catalog_default', { skip: '19' }, config);
    expect(urls).toHaveLength(count);
  });

  it('keeps simultaneous catalog identities independent, with identical discovery pages and playback IDs', async () => {
    const { client, urls } = tmdbFixture();
    const ids = new IdResolver(client);
    const catalogs = new CatalogService(client, ids);
    const metadata = new MetadataService(client, ids);
    const config = createDefaultConfig();
    config.catalogs = combinations.map((languages, index) => ({ ...config.catalogs[0]!, ...languages, id: `catalog_${index}` }));
    const pages = await Promise.all(config.catalogs.map(catalog => catalogs.get(catalog.id, { skip: '20', genre: '悬疑 · Mystery' }, config)));
    for (const page of pages) expect(page.map(card => card.tmdb_id)).toEqual(pages[0]!.map(card => card.tmdb_id));
    expect(new Set(pages.map(page => page[0]!.id)).size).toBe(8);
    const metas = await Promise.all(pages.map(page => metadata.get(page[0]!.id, config)));
    expect(metas.map(meta => meta?.id)).toEqual(pages.map(page => page[0]!.id));
    expect(metas.every(meta => meta?.imdb_id === 'tt1234567' && meta.videos[0]?.id === 'tt1234567:1:1')).toBe(true);
    const discovery = urls.filter(url => url.pathname === '/3/discover/tv');
    expect(discovery).toHaveLength(1);
    expect(Object.fromEntries(discovery[0]!.searchParams)).toMatchObject({ page: '2', language: 'zh-CN', with_origin_country: 'CN', with_genres: '18,9648', sort_by: 'popularity.desc' });
    expect(discovery[0]!.searchParams.has('with_original_language')).toBe(false);
    for (const catalog of config.catalogs) expect(await catalogs.get(catalog.id, { skip: '10000' }, config)).toEqual([]);
    const search = await catalogs.get(SEARCH_CATALOG_ID, { search: 'Pursuit of Jade' }, config);
    expect(search[0]).toMatchObject({ id: 'cnative:zh-zh-zh:tt1234567', name: show.name, description: show.overview });
  });

  it('joins episode descriptions by season and episode number without removing untranslated episodes', async () => {
    const { client, fetcher } = tmdbFixture();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/season/1')) return Response.json({ ...season, episodes: url.searchParams.get('language') === 'en-US' ? [
        { ...episode, episode_number: 2, overview: 'Second' },
        { ...episode, overview: 'First' },
        { ...episode, season_number: 2, episode_number: 3, overview: 'Wrong season' },
      ] : [episode, { ...episode, episode_number: 2, name: '再见' }, { ...episode, episode_number: 3, name: '三' }] });
      return original(input, init);
    });
    const meta = await new MetadataService(client, new IdResolver(client)).get('cnative:zh-en-zh:tt1234567', createDefaultConfig());
    expect(meta?.videos.map(video => [video.id, video.title, video.overview])).toEqual([
      ['tt1234567:1:1', '初见', 'First'], ['tt1234567:1:2', '再见', 'Second'], ['tt1234567:1:3', '三', undefined],
    ]);
  });

  it.each(locales)('uses agreed missing-field fallbacks in %s without borrowing another locale', async language => {
    const { client, fetcher } = tmdbFixture();
    const original = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => {
      const response = await original(input, init);
      const data = await response.json();
      const path = new URL(String(input)).pathname;
      if (/\/tv\/101$/.test(path)) Object.assign(data, { name: ' ', overview: null, images: { logos: [{ iso_639_1: language === 'en-US' ? 'zh' : 'en', file_path: '/wrong.png' }] } });
      if (path.endsWith('/season/1')) data.episodes = [{ ...episode, name: null, overview: ' ' }];
      if (path.endsWith('/discover/tv')) data.results = [{ ...show, name: '', overview: null }];
      if (path.endsWith('/images')) data.logos = [];
      return Response.json(data, { status: response.status });
    });
    const languages = { titleLanguage: language, synopsisLanguage: language, episodeNameLanguage: language };
    const config = createDefaultConfig();
    Object.assign(config.catalogs[0]!, languages);
    const ids = new IdResolver(client);
    const [card] = await new CatalogService(client, ids).get('catalog_default', {}, config);
    expect(card).toMatchObject({ name: show.original_name, description: '' });
    expect(card?.logo).toBeUndefined();
    const meta = await new MetadataService(client, ids).get(card!.id, config);
    expect(meta).toMatchObject({ name: show.original_name, description: '' });
    expect(meta?.logo).toBeUndefined();
    expect(meta?.videos[0]?.title).toBe(language === 'en-US' ? 'Episode 1' : '第 1 集');
    expect(meta?.videos[0]?.overview).toBeUndefined();
  });

  it('preserves legitimate Latin episode names, even in Chinese responses', () => {
    for (const language of locales) expect(mapEpisode({ ...episode, name: 'First Meeting' }, 'tt1234567', language).title).toBe('First Meeting');
    expect(resolveTitleLogo({ logos: [{ iso_639_1: 'zh', file_path: '/zh.png', vote_average: 10, vote_count: 20 }] }, 'en-US')).toBeUndefined();
  });

  it('keeps a saved TMDB metadata ID stable after an IMDb mapping becomes available', async () => {
    const { client } = tmdbFixture();
    const id = metadataId('tmdb:101', chineseDisplayLanguages);
    const meta = await new MetadataService(client, new IdResolver(client)).get(id, createDefaultConfig());
    expect(meta).toMatchObject({ id, tmdb_id: 101, imdb_id: 'tt1234567', videos: [{ id: 'tt1234567:1:1' }] });
  });

  it.each(['tt1234567', 'cnative:tt1234567', 'cnative:zh-zh:tt1234567', 'cnative:fr-en-en:tt1234567', 'cnative:en-en-en:tt1234567:1:1', 'cnative:en-en-en:tmdb:0', 'cnative:en-en-en:tmdb:9007199254740992'])('rejects obsolete or invalid metadata IDs without fetching: %s', async id => {
    const { client, urls } = tmdbFixture();
    expect(await new MetadataService(client, new IdResolver(client)).get(id, createDefaultConfig())).toBeNull();
    expect(urls).toEqual([]);
  });
});
