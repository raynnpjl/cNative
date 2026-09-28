import type { AddonConfig } from '../config/config.schema.js';
import type { IdResolver } from '../ids/id-resolver.service.js';
import type { TmdbClient } from '../providers/tmdb/tmdb.client.js';
import type { Genre, TmdbSeriesSummary } from '../providers/tmdb/tmdb.types.js';
import { mapPreview, resolveTitleLogo } from '../metadata/metadata.mapper.js';
import { isChineseSeries } from '../utils/language.js';
import { parseSkip, skipToTmdbPage, TMDB_MAX_PAGE, TMDB_PAGE_SIZE } from '../utils/pagination.js';
import { InputError, TmdbError } from '../utils/errors.js';
import { buildDiscoverQuery, type TmdbQuery } from './discover-query.builder.js';

export const SEARCH_CATALOG_ID = 'cnative_search';
export const ALL_GENRES = '全部 · All';
export interface CatalogExtra { skip?: string; genre?: string; search?: string }

export class CatalogService {
  constructor(private readonly tmdb: TmdbClient, private readonly ids: IdResolver) {}

  private async preview(show: TmdbSeriesSummary, genres: Genre[], titleMode: AddonConfig['titleMode']) {
    const [id, logo] = await Promise.all([
      this.ids.toExternalId(show.id),
      this.tmdb.images(show.id).then(resolveTitleLogo).catch((error: unknown) => {
        // Optional artwork must not hide a valid catalog or search result.
        if (error instanceof TmdbError) return undefined;
        throw error;
      }),
    ]);
    return mapPreview(show, id, genres, titleMode, logo);
  }

  async get(id: string, extra: CatalogExtra, config: AddonConfig) {
    const skip = parseSkip(extra.skip);
    const page = skipToTmdbPage(skip);
    if (page > TMDB_MAX_PAGE) return [];
    const genres = await this.tmdb.genres();
    if (id === SEARCH_CATALOG_ID) {
      // Search is a dedicated, non-paginated Stremio search catalog. Filtering
      // reduces result count, so a returned-count skip cannot index TMDB pages.
      const query = extra.search?.trim();
      if (!query || skip !== 0) return [];
      if (query.length > 200) throw new InputError('Search query is too long');
      const results = await this.tmdb.search(query, 1, config.includeAdult);
      const shows = results.results.filter(show => config.searchScope === 'all' || isChineseSeries(show));
      return Promise.all(shows.map(show => this.preview(show, genres, config.titleMode)));
    }
    const catalog = config.catalogs.find(catalog => catalog.id === id && catalog.enabled);
    if (!catalog || extra.search !== undefined || (!catalog.showInHome && !extra.genre)) return [];
    const genre = extra.genre && extra.genre !== ALL_GENRES ? genres.find(genre => genre.name === extra.genre) : undefined;
    if (extra.genre && extra.genre !== ALL_GENRES && !genre) throw new InputError('Unknown genre');
    const query: TmdbQuery = { ...buildDiscoverQuery(catalog, page, genre?.id), include_adult: config.includeAdult };
    const from = query['first_air_date.gte'];
    const to = query['first_air_date.lte'];
    if (typeof from === 'string' && typeof to === 'string' && from > to) return [];
    const results = await this.tmdb.discover(query);
    if (page > results.total_pages) return [];
    // At most one upstream page is sliced, only for a non-aligned client offset.
    return Promise.all(results.results.slice(skip % TMDB_PAGE_SIZE)
      .map(show => this.preview(show, genres, config.titleMode)));
  }
}
