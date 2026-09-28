import { z } from 'zod';
import { addonConfigSchema } from './config.js';
import { tmdbCredentialsSchema } from './credentials.js';

export const installationSchema = z.strictObject({
  version: z.literal(1),
  config: addonConfigSchema,
  credentials: tmdbCredentialsSchema,
});
export type Installation = z.infer<typeof installationSchema>;

// Leave room for the host, resource path and Stremio extras in request URLs.
export const MAX_CONFIGURATION_LENGTH = 7000;
const tooLong = 'Configuration is too large for an install link. Use fewer catalogs or shorter names.';

export function encodeInstallation(input: Installation): string {
  const bytes = new TextEncoder().encode(JSON.stringify(installationSchema.parse(input)));
  if (bytes.length > MAX_CONFIGURATION_LENGTH) throw new Error(tooLong);
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (encoded.length > MAX_CONFIGURATION_LENGTH) throw new Error(tooLong);
  return encoded;
}

export function decodeInstallation(encoded: string): Installation {
  if (encoded.length > MAX_CONFIGURATION_LENGTH) throw new Error(tooLong);
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error();
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    return installationSchema.parse(JSON.parse(json));
  } catch { throw new Error('Invalid installation link. Open /configure to create a new one.'); }
}

export function installationFromPath(path: string): Installation | undefined {
  if (path === '/' || /^\/configure\/?$/.test(path)) return undefined;
  const match = /^\/([^/]+)\/configure\/?$/.exec(path);
  if (!match?.[1]) throw new Error('Invalid configuration page URL.');
  return decodeInstallation(match[1]);
}
