import type { DisplayLanguage, DisplayLanguages } from '../../../shared/config.js';
import type { Genre, TmdbEpisode, TmdbImages, TmdbSeason, TmdbSeriesDetail, TmdbSeriesSummary } from '../providers/tmdb/tmdb.types.js';
import { imageUrl } from '../utils/images.js';
import { isImdbId } from '../ids/id-resolver.service.js';
import { metadataId } from '../ids/metadata-id.js';

export interface MetaPreview {
  id: string;
  imdb_id?: string;
  tmdb_id: number;
  type: 'series';
  name: string;
  poster?: string;
  background?: string;
  logo?: string;
  posterShape: 'poster';
  description: string;
  genres: string[];
  releaseInfo?: string;
}

export function resolveDisplayTitle(show: Pick<TmdbSeriesSummary, 'name' | 'original_name'>): string {
  return show.name?.trim() || show.original_name?.trim() || '';
}

export function mapPreview(show: TmdbSeriesSummary, externalId: string, genres: Genre[], languages: DisplayLanguages, logo?: string): MetaPreview {
  return {
    // Keep metadata ownership separate from external IDs used for ratings and matching.
    id: metadataId(externalId, languages), type: 'series', name: resolveDisplayTitle(show),
    imdb_id: isImdbId(externalId) ? externalId : undefined, tmdb_id: show.id,
    poster: imageUrl(show.poster_path), background: imageUrl(show.backdrop_path, 'w1280'), posterShape: 'poster',
    logo,
    description: show.overview?.trim() || '',
    genres: genres.filter(genre => show.genre_ids.includes(genre.id)).map(genre => genre.name),
    releaseInfo: show.first_air_date?.slice(0, 4) || undefined,
  };
}

export function episodeId(seriesId: string, season: number, episode: number): string { return `${seriesId}:${season}:${episode}`; }

export function mapEpisode(episode: TmdbEpisode, seriesId: string, language: DisplayLanguage, seasonPoster?: string | null) {
  return {
    id: episodeId(seriesId, episode.season_number, episode.episode_number),
    title: episode.name?.trim() || (language === 'en-US' ? `Episode ${episode.episode_number}` : `第 ${episode.episode_number} 集`),
    season: episode.season_number, episode: episode.episode_number,
    released: episode.air_date ? `${episode.air_date}T00:00:00.000Z` : undefined,
    overview: episode.overview?.trim() || undefined,
    runtime: episode.runtime ? `${episode.runtime} min` : undefined,
    thumbnail: imageUrl(episode.still_path, 'w342'),
    seasonPoster: imageUrl(seasonPoster),
  };
}

export function resolveTitleLogo(images: TmdbImages | undefined, language: DisplayLanguage): string | undefined {
  return (images?.logos ?? [])
    .filter(image => image.iso_639_1 === language.slice(0, 2))
    .sort((a, b) => b.vote_average - a.vote_average || b.vote_count - a.vote_count)
    .map(image => imageUrl(image.file_path?.replace(/\.svg$/i, '.png')))
    .find(Boolean);
}

export function mapMetadata(show: TmdbSeriesDetail, externalId: string, seasons: TmdbSeason[], languages: DisplayLanguages, genres: Genre[]) {
  return {
    // Keep name for accessibility and the client's missing/failed-image fallback.
    ...mapPreview(show, externalId, show.genres, languages, resolveTitleLogo(show.images, languages.titleLanguage)),
    genres: show.genres.map(genre => genres.find(label => label.id === genre.id)?.name ?? genre.name),
    cast: show.credits.cast.map(person => person.name),
    runtime: show.episode_run_time[0] ? `${show.episode_run_time[0]} min` : undefined,
    videos: seasons.filter(season => season.season_number > 0)
      .sort((a, b) => a.season_number - b.season_number)
      .flatMap(season => [...season.episodes].sort((a, b) => a.episode_number - b.episode_number)
        .map(episode => mapEpisode(episode, externalId, languages.episodeNameLanguage, season.poster_path))),
  };
}
