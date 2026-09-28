import type { CatalogConfig } from '../config/config.schema.js';
import { InputError } from '../utils/errors.js';

export type TmdbQuery = Record<string, string | number | boolean>;

export function buildDiscoverQuery(catalog: CatalogConfig, page: number, additionalGenre?: number): TmdbQuery {
  const query: TmdbQuery = { language: 'zh-CN', page, sort_by: catalog.sortBy };
  const filters = [
    ['with_origin_country', catalog.originCountry], ['with_original_language', catalog.originalLanguage],
    ['vote_average.gte', catalog.voteAverageMin], ['vote_average.lte', catalog.voteAverageMax],
    ['vote_count.gte', catalog.voteCountMin], ['with_runtime.gte', catalog.runtimeMin],
    ['with_runtime.lte', catalog.runtimeMax], ['first_air_date.gte', catalog.firstAirDateFrom],
    ['first_air_date.lte', catalog.firstAirDateTo],
  ] as const;
  for (const [key, value] of filters) if (value !== undefined && value !== '') query[key] = value;

  let genres = [...catalog.includeGenres];
  if (additionalGenre !== undefined) {
    if (catalog.excludeGenres.includes(additionalGenre)) throw new InputError('Genre is excluded by this catalog');
    if (genres.length > 1) {
      // TMDB documents flat AND or OR lists, not grouped boolean expressions.
      if (!genres.includes(additionalGenre)) throw new InputError('Choose one of this catalog’s included genres');
      genres = [additionalGenre];
    } else { genres = [...new Set([...genres, additionalGenre])]; }
  }
  if (genres.length) query.with_genres = genres.join(additionalGenre !== undefined ? ',' : '|');
  if (catalog.excludeGenres.length) query.without_genres = catalog.excludeGenres.join(',');
  if (catalog.releasedOnly) {
    const today = new Date().toISOString().slice(0, 10);
    query['first_air_date.lte'] = catalog.firstAirDateTo && catalog.firstAirDateTo < today ? catalog.firstAirDateTo : today;
    query.include_null_first_air_dates = false;
  }
  return query;
}
