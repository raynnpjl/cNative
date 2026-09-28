import type { AddonConfig } from '../config/config.schema.js';
import type { IdResolver } from '../ids/id-resolver.service.js';
import type { TmdbClient } from '../providers/tmdb/tmdb.client.js';
import { TmdbError } from '../utils/errors.js';
import { mapMetadata } from './metadata.mapper.js';

export class MetadataService {
  constructor(private readonly tmdb: TmdbClient, private readonly ids: IdResolver) {}

  async get(id: string, config: AddonConfig) {
    const tmdbId = await this.ids.toTmdbId(id);
    if (tmdbId === null) return null;
    try {
      const show = await this.tmdb.series(tmdbId);
      if (show.adult && !config.includeAdult) return null;
      const canonicalId = this.ids.remember(tmdbId, show.external_ids.imdb_id);
      const seasons = await Promise.all(show.seasons.filter(season => season.season_number > 0)
        .map(season => this.tmdb.season(tmdbId, season.season_number)));
      return mapMetadata(show, canonicalId, seasons, config.titleMode, await this.tmdb.genres());
    } catch (error) {
      if (error instanceof TmdbError && error.status === 404) return null;
      throw error;
    }
  }
}
