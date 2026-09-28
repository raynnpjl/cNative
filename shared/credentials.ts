import { z } from 'zod';

export const tmdbCredentialsSchema = z.strictObject({
  apiKey: z.string().trim().min(1, 'TMDB API key is required').max(512),
  token: z.string().trim().min(1).max(8192).optional(),
});
export type TmdbCredentials = z.infer<typeof tmdbCredentialsSchema>;

export interface TmdbStatus {
  tmdbConfigured: boolean;
}
