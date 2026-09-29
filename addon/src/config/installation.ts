import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { addonConfigSchema } from '../../../shared/config.js';
import { tmdbCredentialsSchema } from '../../../shared/credentials.js';
import { CONFIGURATION_TOO_LARGE, INVALID_INSTALLATION, installationTokenSchema, MAX_CONFIGURATION_LENGTH } from '../../../shared/installation.js';
import { InputError } from '../utils/errors.js';

const installationSchema = z.strictObject({ version: z.literal(1), config: addonConfigSchema, credentials: tmdbCredentialsSchema });
export type Installation = z.infer<typeof installationSchema>;
const aad = Buffer.from('cNative installation e1');

export function createInstallationCodec(secret: string | undefined) {
  if (!secret || !/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('CONFIG_ENCRYPTION_KEY must be a base64url-encoded random 32-byte key.');
  const key = Buffer.from(secret, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== secret) throw new Error('CONFIG_ENCRYPTION_KEY must be a base64url-encoded random 32-byte key.');

  function encode(input: Installation): string {
    const plaintext = Buffer.from(JSON.stringify(installationSchema.parse(input)));
    if (3 + Math.ceil((plaintext.length + 28) * 4 / 3) > MAX_CONFIGURATION_LENGTH) throw new InputError(CONFIGURATION_TOO_LARGE);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return `e1.${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString('base64url')}`;
  }

  function decode(encoded: string): Installation {
    if (encoded.length > MAX_CONFIGURATION_LENGTH) throw new InputError(CONFIGURATION_TOO_LARGE);
    try {
      installationTokenSchema.parse(encoded);
      const payload = Buffer.from(encoded.slice(3), 'base64url');
      if (payload.length <= 28 || payload.toString('base64url') !== encoded.slice(3)) throw new Error();
      const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12), { authTagLength: 16 });
      decipher.setAAD(aad);
      decipher.setAuthTag(payload.subarray(12, 28));
      // Authenticate the entire message before parsing or using plaintext.
      const plaintext = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
      return installationSchema.parse(JSON.parse(plaintext.toString('utf8')));
    } catch { throw new InputError(INVALID_INSTALLATION); }
  }
  return { encode, decode };
}

export function configurationView(installation: Installation) {
  return { config: installation.config, credentialStatus: { hasApiKey: true, hasReadAccessToken: Boolean(installation.credentials.token) } };
}
