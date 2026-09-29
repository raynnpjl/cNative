import { z } from 'zod';

export const sortOptions = [
  ['popularity.desc', 'Popularity — High to Low'],
  ['popularity.asc', 'Popularity — Low to High'],
  ['vote_average.desc', 'Rating — High to Low'],
  ['vote_average.asc', 'Rating — Low to High'],
  ['first_air_date.desc', 'First Air Date — Newest First'],
  ['first_air_date.asc', 'First Air Date — Oldest First'],
  ['vote_count.desc', 'Vote Count — High to Low'],
  ['vote_count.asc', 'Vote Count — Low to High'],
] as const;

export const tmdbTvSortSchema = z.enum(sortOptions.map(([value]) => value));
export type TmdbTvSort = z.infer<typeof tmdbTvSortSchema>;
const genreIds = z.array(z.number().int().positive()).max(100)
  .refine(ids => new Set(ids).size === ids.length, 'Duplicate genre IDs');

export const displayLanguageSchema = z.enum(['zh-CN', 'en-US']);
export type DisplayLanguage = z.infer<typeof displayLanguageSchema>;
const displayLanguagesSchema = z.object({
  titleLanguage: displayLanguageSchema,
  synopsisLanguage: displayLanguageSchema,
  episodeNameLanguage: displayLanguageSchema,
});
export type DisplayLanguages = z.infer<typeof displayLanguagesSchema>;
export const chineseDisplayLanguages: DisplayLanguages = {
  titleLanguage: 'zh-CN', synopsisLanguage: 'zh-CN', episodeNameLanguage: 'zh-CN',
};

export const catalogConfigSchema = z.strictObject({
  ...displayLanguagesSchema.shape,
  id: z.string().regex(/^catalog_[a-zA-Z0-9_-]{1,80}$/),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  showInHome: z.boolean(),
  sortBy: tmdbTvSortSchema,
  originCountry: z.string().regex(/^[A-Z]{2}$/).optional(),
  originalLanguage: z.string().regex(/^[a-z]{2,3}$/).optional(),
  includeGenres: genreIds,
  excludeGenres: genreIds,
  firstAirDateFrom: z.iso.date().optional(),
  firstAirDateTo: z.iso.date().optional(),
  voteAverageMin: z.number().min(0).max(10).optional(),
  voteAverageMax: z.number().min(0).max(10).optional(),
  voteCountMin: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  runtimeMin: z.number().int().min(0).max(1440).optional(),
  runtimeMax: z.number().int().min(0).max(1440).optional(),
  releasedOnly: z.boolean(),
}).superRefine((catalog, ctx) => {
  const ranges = [
    ['voteAverageMin', 'voteAverageMax'],
    ['runtimeMin', 'runtimeMax'],
    ['firstAirDateFrom', 'firstAirDateTo'],
  ] as const;
  for (const [lower, upper] of ranges) {
    const min = catalog[lower];
    const max = catalog[upper];
    if (min !== undefined && max !== undefined && min > max) {
      ctx.addIssue({ code: 'custom', path: [upper], message: 'Maximum must be at least the minimum' });
    }
  }
  if (catalog.includeGenres.some(id => catalog.excludeGenres.includes(id))) {
    ctx.addIssue({ code: 'custom', path: ['excludeGenres'], message: 'A genre cannot be both included and excluded' });
  }
});

export const addonConfigSchema = z.strictObject({
  includeAdult: z.boolean(),
  searchScope: z.enum(['chinese', 'all']),
  catalogs: z.array(catalogConfigSchema).max(50),
}).superRefine((config, ctx) => {
  if (new Set(config.catalogs.map(catalog => catalog.id)).size !== config.catalogs.length) {
    ctx.addIssue({ code: 'custom', path: ['catalogs'], message: 'Catalog IDs must be unique' });
  }
});

export type CatalogConfig = z.infer<typeof catalogConfigSchema>;
export type AddonConfig = z.infer<typeof addonConfigSchema>;

export function createCatalog(id: string, name = '新建剧集目录'): CatalogConfig {
  return {
    ...chineseDisplayLanguages,
    id, name, enabled: true, showInHome: true, sortBy: 'popularity.desc',
    originalLanguage: 'zh', includeGenres: [], excludeGenres: [],
    voteAverageMin: 0, voteAverageMax: 10, voteCountMin: 0, releasedOnly: true,
  };
}

export function createDefaultConfig(): AddonConfig {
  return {
    includeAdult: false, searchScope: 'chinese',
    catalogs: [{ ...createCatalog('catalog_default', '华语热门剧集'), includeGenres: [18] }],
  };
}

export const lookupSchema = z.object({
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })),
  countries: z.array(z.object({ iso_3166_1: z.string(), english_name: z.string(), native_name: z.string().optional() })),
  languages: z.array(z.object({ iso_639_1: z.string(), english_name: z.string(), name: z.string() })),
});
export type Lookups = z.infer<typeof lookupSchema>;
