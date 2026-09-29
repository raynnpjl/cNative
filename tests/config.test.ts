import { describe, expect, it } from 'vitest';
import { addonConfigSchema, createDefaultConfig } from '../shared/config.js';

describe('configuration validation', () => {
  it('provides the requested default catalog', () => {
    expect(addonConfigSchema.parse(createDefaultConfig()).catalogs[0]).toMatchObject({ name: '华语热门剧集', enabled: true, showInHome: true, originalLanguage: 'zh', sortBy: 'popularity.desc', titleLanguage: 'zh-CN', synopsisLanguage: 'zh-CN', episodeNameLanguage: 'zh-CN' });
  });
  it.each([
    { voteAverageMin: -1 }, { voteAverageMax: 11 }, { voteAverageMin: 8, voteAverageMax: 6 },
    { runtimeMin: 50, runtimeMax: 20 }, { voteCountMin: 1.5 }, { originCountry: 'China' },
    { originalLanguage: 'zh-CN' }, { firstAirDateFrom: '2026-02-30' },
    { firstAirDateFrom: '2026-01-01', firstAirDateTo: '2020-01-01' },
    { includeGenres: [18], excludeGenres: [18] }, { includeGenres: [18, 18] }, { sortBy: 'random' },
    { titleLanguage: 'zh' }, { synopsisLanguage: 'fr-FR' }, { episodeNameLanguage: 'en' },
    { titleLanguage: undefined }, { synopsisLanguage: undefined }, { episodeNameLanguage: undefined },
  ])('rejects invalid filters %j', changes => {
    const config = createDefaultConfig();
    Object.assign(config.catalogs[0]!, changes);
    expect(addonConfigSchema.safeParse(config).success).toBe(false);
  });
  it('rejects obsolete global preferences, unknown settings and duplicate IDs', () => {
    const config = createDefaultConfig();
    expect(addonConfigSchema.safeParse({ ...config, metadataLanguage: 'en-US' }).success).toBe(false);
    expect(addonConfigSchema.safeParse({ ...config, metadataLanguage: 'zh-CN', titleMode: 'native' }).success).toBe(false);
    expect(addonConfigSchema.safeParse({ ...config, provider: 'other' }).success).toBe(false);
    expect(addonConfigSchema.safeParse({ ...config, catalogs: [config.catalogs[0], config.catalogs[0]] }).success).toBe(false);
  });
  it('has no selectable genre match mode in the configuration contract', () => {
    const config = createDefaultConfig();
    expect(config.catalogs[0]).not.toHaveProperty('genreJoinMode');
    expect(addonConfigSchema.safeParse({ ...config, catalogs: [{ ...config.catalogs[0], genreJoinMode: 'and' }] }).success).toBe(false);
  });
});
