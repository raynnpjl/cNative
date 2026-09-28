import { z } from 'zod';

export const tmdbCredentialsSchema = z.strictObject({
  apiKey: z.string().trim().min(1, 'TMDB API key is required').max(512),
  token: z.string().trim().min(1).max(8192).optional(),
});
export type TmdbCredentials = z.infer<typeof tmdbCredentialsSchema>;

export const tmdbStatusSchema = z.object({
  tmdbConfigured: z.boolean(),
  tokenConfigured: z.boolean(),
});
export type TmdbStatus = z.infer<typeof tmdbStatusSchema>;
