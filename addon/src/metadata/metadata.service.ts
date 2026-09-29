import type { AddonConfig } from '../config/config.schema.js';
import { ORIGIN_COUNTRY } from '../../../shared/config.js';
import type { IdResolver } from '../ids/id-resolver.service.js';
import { parseMetadataId } from '../ids/metadata-id.js';
import type { TmdbClient } from '../providers/tmdb/tmdb.client.js';
import { TmdbError } from '../utils/errors.js';
import { mapMetadata } from './metadata.mapper.js';

export class MetadataService {
  constructor(private readonly tmdb: TmdbClient, private readonly ids: IdResolver) {}

  async get(id: string, config: AddonConfig) {
    const parsed = parseMetadataId(id);
    if (!parsed) return null;
    const { languages } = parsed;
    const tmdbId = await this.ids.toTmdbId(parsed.externalId);
    if (tmdbId === null) return null;
    try {
      const show = await this.tmdb.series(tmdbId, languages.titleLanguage);
      if (!show.origin_country.includes(ORIGIN_COUNTRY)) return null;
      if (show.adult && !config.includeAdult) return null;
      const canonicalId = this.ids.remember(tmdbId, show.external_ids.imdb_id);
      const [synopsis, seasons, genres] = await Promise.all([
        languages.synopsisLanguage === languages.titleLanguage ? show : this.tmdb.series(tmdbId, languages.synopsisLanguage),
        Promise.all(show.seasons.filter(season => season.season_number > 0).map(async season => {
          const names = await this.tmdb.season(tmdbId, season.season_number, languages.episodeNameLanguage);
          if (languages.episodeNameLanguage === languages.synopsisLanguage) return names;
          const descriptions = await this.tmdb.season(tmdbId, season.season_number, languages.synopsisLanguage);
          const overviews = new Map(descriptions.episodes.map(episode => [
            `${episode.season_number}:${episode.episode_number}`, episode.overview,
          ]));
          return { ...names, episodes: names.episodes.map(episode => ({
            ...episode, overview: overviews.get(`${episode.season_number}:${episode.episode_number}`),
          })) };
        })),
        this.tmdb.genres(),
      ]);
      // Retain the requested metadata identity even if TMDB gains an IMDb mapping later.
      return { ...mapMetadata({ ...show, overview: synopsis.id === show.id ? synopsis.overview : undefined }, canonicalId, seasons, languages, genres), id };
    } catch (error) {
      if (error instanceof TmdbError && error.status === 404) return null;
      throw error;
    }
  }
}
