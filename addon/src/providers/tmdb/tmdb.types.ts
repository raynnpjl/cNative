import { z } from 'zod';

const text = z.string().nullish();
export const genreSchema = z.object({ id: z.number().int(), name: z.string() });
export const seriesSummarySchema = z.object({
  id: z.number().int().positive(), name: text, original_name: text,
  original_language: z.string(), origin_country: z.array(z.string()).default([]),
  overview: text, poster_path: text, backdrop_path: text, first_air_date: text,
  genre_ids: z.array(z.number().int()).default([]), adult: z.boolean().default(false),
});
export const seriesPageSchema = z.object({
  page: z.number().int(), total_pages: z.number().int(), total_results: z.number().int(),
  results: z.array(seriesSummarySchema),
});
export const externalIdsSchema = z.object({ imdb_id: text });
const logoSchema = z.object({
  file_path: text, iso_639_1: text,
  vote_average: z.number().default(0), vote_count: z.number().int().default(0),
});
export const imagesSchema = z.object({ logos: z.array(logoSchema).default([]) });
export const seriesDetailSchema = seriesSummarySchema.extend({
  genres: z.array(genreSchema), episode_run_time: z.array(z.number()).default([]),
  seasons: z.array(z.object({ season_number: z.number().int(), poster_path: text })),
  credits: z.object({ cast: z.array(z.object({ name: z.string() })) }),
  external_ids: externalIdsSchema,
  images: imagesSchema.optional(),
});
export const episodeSchema = z.object({
  episode_number: z.number().int().positive(), season_number: z.number().int(),
  name: text, overview: text, air_date: text, runtime: z.number().nullish(), still_path: text,
});
export const seasonSchema = z.object({
  season_number: z.number().int(), poster_path: text, episodes: z.array(episodeSchema),
});
export const findSchema = z.object({ tv_results: z.array(z.object({ id: z.number().int().positive() })) });
export type TmdbSeriesSummary = z.infer<typeof seriesSummarySchema>;
export type TmdbSeriesDetail = z.infer<typeof seriesDetailSchema>;
export type TmdbSeason = z.infer<typeof seasonSchema>;
export type TmdbEpisode = z.infer<typeof episodeSchema>;
export type Genre = z.infer<typeof genreSchema>;
export type TmdbImages = z.infer<typeof imagesSchema>;
