import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addonConfigSchema, createDefaultConfig } from '../shared/config.js';
import { JsonConfigStore } from '../addon/src/config/config.store.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function path() {
  const dir = await mkdtemp(join(tmpdir(), 'cnative-config-'));
  directories.push(dir);
  return join(dir, 'config.json');
}

describe('configuration validation', () => {
  it('provides the requested default catalog', () => {
    expect(addonConfigSchema.parse(createDefaultConfig()).catalogs[0]).toMatchObject({ name: '华语热门剧集', enabled: true, showInHome: true, originalLanguage: 'zh', sortBy: 'popularity.desc' });
  });
  it.each([
    { voteAverageMin: -1 }, { voteAverageMax: 11 }, { voteAverageMin: 8, voteAverageMax: 6 },
    { runtimeMin: 50, runtimeMax: 20 }, { voteCountMin: 1.5 }, { originCountry: 'China' },
    { originalLanguage: 'zh-CN' }, { firstAirDateFrom: '2026-02-30' },
    { firstAirDateFrom: '2026-01-01', firstAirDateTo: '2020-01-01' },
    { includeGenres: [18], excludeGenres: [18] }, { includeGenres: [18, 18] }, { sortBy: 'random' },
  ])('rejects invalid filters %j', changes => {
    const config = createDefaultConfig();
    Object.assign(config.catalogs[0]!, changes);
    expect(addonConfigSchema.safeParse(config).success).toBe(false);
  });
  it('rejects other metadata languages, unknown settings and duplicate IDs', () => {
    const config = createDefaultConfig();
    expect(addonConfigSchema.safeParse({ ...config, metadataLanguage: 'en-US' }).success).toBe(false);
    expect(addonConfigSchema.safeParse({ ...config, provider: 'other' }).success).toBe(false);
    expect(addonConfigSchema.safeParse({ ...config, catalogs: [config.catalogs[0], config.catalogs[0]] }).success).toBe(false);
  });
  it('has no selectable genre match mode in the configuration contract', () => {
    const config = createDefaultConfig();
    expect(config.catalogs[0]).not.toHaveProperty('genreJoinMode');
    expect(addonConfigSchema.safeParse({ ...config, catalogs: [{ ...config.catalogs[0], genreJoinMode: 'and' }] }).success).toBe(false);
  });
});

describe('atomic persistence', () => {
  it('creates defaults, saves renamed stable IDs, survives reopen and returns copies', async () => {
    const file = await path();
    const store = await JsonConfigStore.open(file);
    const config = await store.get();
    config.catalogs[0]!.name = '大陆热门剧集';
    await store.save(config);
    config.catalogs[0]!.name = 'Unsaved';
    const reopened = await JsonConfigStore.open(file);
    expect((await reopened.get()).catalogs[0]).toMatchObject({ id: 'catalog_default', name: '大陆热门剧集' });
    expect(await readdir(join(file, '..'))).toEqual(['config.json']);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(await reopened.get());
  });
  it('serializes concurrent writes and never replaces valid data with invalid input', async () => {
    const file = await path();
    const store = await JsonConfigStore.open(file);
    await Promise.all([store.save({ ...createDefaultConfig(), includeAdult: true }), store.save({ ...createDefaultConfig(), catalogs: [] })]);
    await expect(store.save({ catalogs: [] })).rejects.toThrow();
    expect((await store.get()).catalogs).toEqual([]);
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(await store.get());
  });
  it('does not overwrite corrupt saved configuration', async () => {
    const file = await path();
    await writeFile(file, '{bad');
    await expect(JsonConfigStore.open(file)).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('{bad');
  });
});
