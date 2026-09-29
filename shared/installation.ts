import { z } from 'zod';
import { addonConfigSchema } from './config.js';
import { tmdbCredentialsSchema } from './credentials.js';

// Leave room for the host, resource path and Stremio extras in request URLs.
export const MAX_CONFIGURATION_LENGTH = 7000;
export const INVALID_INSTALLATION = 'Invalid installation link. Open /configure to create a new one.';
export const CONFIGURATION_TOO_LARGE = 'Configuration is too large for an install link. Use fewer catalogs or shorter names.';
export const installationTokenSchema = z.string().max(MAX_CONFIGURATION_LENGTH, CONFIGURATION_TOO_LARGE).regex(/^e1\.[A-Za-z0-9_-]+$/, INVALID_INSTALLATION);
export const installationRequestSchema = z.strictObject({ encodedConfig: installationTokenSchema });
export const credentialChangesSchema = z.strictObject({
  apiKey: tmdbCredentialsSchema.shape.apiKey.optional(),
  token: tmdbCredentialsSchema.shape.token.unwrap().nullable().optional(),
});
export type CredentialChanges = z.infer<typeof credentialChangesSchema>;
export const saveInstallationSchema = z.strictObject({
  config: addonConfigSchema,
  encodedConfig: installationTokenSchema.optional(),
  credentialChanges: credentialChangesSchema.optional(),
}).refine(value => Boolean(value.encodedConfig || value.credentialChanges?.apiKey), { message: 'TMDB API key is required' });
export type SaveInstallation = z.infer<typeof saveInstallationSchema>;
export const credentialStatusSchema = z.strictObject({ hasApiKey: z.boolean(), hasReadAccessToken: z.boolean() });
export type CredentialStatus = z.infer<typeof credentialStatusSchema>;
export const configurationResponseSchema = z.strictObject({ config: addonConfigSchema, credentialStatus: credentialStatusSchema });
export const saveInstallationResponseSchema = configurationResponseSchema.extend({ encodedConfig: installationTokenSchema });

export function installationTokenFromPath(path: string): string | undefined {
  if (path === '/' || /^\/configure\/?$/.test(path)) return undefined;
  const match = /^\/([^/]+)\/configure\/?$/.exec(path);
  if (!match?.[1]) throw new Error('Invalid configuration page URL.');
  if (!installationTokenSchema.safeParse(match[1]).success) throw new Error(INVALID_INSTALLATION);
  return match[1];
}
