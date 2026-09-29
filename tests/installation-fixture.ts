import { createInstallationCodec } from '../addon/src/config/installation.js';

// Public test-only key; never used by application entry points.
export const testEncryptionKey = Buffer.alloc(32, 7).toString('base64url');
export const { encode: encodeInstallation, decode: decodeInstallation } = createInstallationCodec(testEncryptionKey);
