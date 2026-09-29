import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../shared/config.js';
import { decodeInstallation, encodeInstallation, testEncryptionKey } from './installation-fixture.js';
import { installationTokenFromPath, MAX_CONFIGURATION_LENGTH } from '../shared/installation.js';
import { createInstallationCodec } from '../addon/src/config/installation.js';

const installation = () => ({ version: 1 as const, config: createDefaultConfig(), credentials: { apiKey: 'test-key', token: 'optional-token' } });
describe('personal installation links', () => {
  it('round trips Unicode, punctuation, every catalog field and credentials', () => {
    const input = installation();
    Object.assign(input.config.catalogs[0]!, { name: '剧集 & / + 😃', firstAirDateFrom: '2020-01-01', firstAirDateTo: '2026-01-01', runtimeMin: 10, runtimeMax: 90, excludeGenres: [35], showInHome: false });
    const encoded = encodeInstallation(input);
    expect(encoded).toMatch(/^e1\.[A-Za-z0-9_-]+$/);
    expect(decodeInstallation(encoded)).toEqual(input);
    expect(installationTokenFromPath(`/${encoded}/configure/`)).toBe(encoded);
  });
  it('supports API key only, with no configuration on the public configure page', () => {
    expect(decodeInstallation(encodeInstallation({ ...installation(), credentials: { apiKey: 'key' } })).credentials).toEqual({ apiKey: 'key' });
    expect(installationTokenFromPath('/configure')).toBeUndefined();
    expect(installationTokenFromPath('/')).toBeUndefined();
  });
  it.each(['', '%2F', 'abc=', 'not-json', btoa('{"version":2}'), btoa('{"credentials":{"token":"only"}}')])('rejects malformed or incomplete links without echoing them', encoded => {
    expect(() => decodeInstallation(encoded)).toThrow('Invalid installation link');
  });
  it('rejects oversized configurations before generating unusable URLs', () => {
    const input = installation();
    input.config.catalogs = Array.from({ length: 50 }, (_, i) => ({ ...input.config.catalogs[0]!, id: `catalog_${i}` }));
    expect(() => encodeInstallation(input)).toThrow('too large');
    expect(() => decodeInstallation('a'.repeat(MAX_CONFIGURATION_LENGTH + 1))).toThrow('too large');
  });
  it('rejects missing keys and unknown config versions', () => {
    expect(() => encodeInstallation({ ...installation(), credentials: { apiKey: ' ' } })).toThrow();
    expect(() => decodeInstallation(btoa(JSON.stringify({ ...installation(), version: 2 })))).toThrow();
  });
  it('encrypts rather than exposes JSON and uses a fresh nonce for every save', () => {
    const first = encodeInstallation(installation());
    const second = encodeInstallation(installation());
    expect(first).not.toBe(second);
    expect(Buffer.from(first.slice(3), 'base64url').equals(Buffer.from(second.slice(3), 'base64url'))).toBe(false);
    expect(Buffer.from(first.slice(3), 'base64url').includes(Buffer.from('test-key'))).toBe(false);
    expect(() => JSON.parse(Buffer.from(first.slice(3), 'base64url').toString('utf8'))).toThrow();
    expect(decodeInstallation(second)).toEqual(installation());
  });
  it.each([0, 12, 28])('rejects changes to nonce, tag or ciphertext at byte %i', offset => {
    const encoded = encodeInstallation(installation());
    const bytes = Buffer.from(encoded.slice(3), 'base64url');
    bytes[offset] = bytes[offset]! ^ 1;
    expect(() => decodeInstallation(`e1.${bytes.toString('base64url')}`)).toThrow('Invalid installation link');
  });
  it('rejects truncation, future formats, old plaintext links and another server key', () => {
    const encoded = encodeInstallation(installation());
    for (const invalid of [encoded.slice(0, -10), encoded.replace('e1.', 'e2.'), Buffer.from(JSON.stringify(installation())).toString('base64url')]) {
      expect(() => decodeInstallation(invalid)).toThrow('Invalid installation link');
    }
    expect(() => createInstallationCodec(Buffer.alloc(32, 8).toString('base64url')).decode(encoded)).toThrow('Invalid installation link');
    expect(createInstallationCodec(testEncryptionKey).decode(encoded)).toEqual(installation());
  });
  it.each([undefined, '', 'insecure-default', 'a'.repeat(42), 'a'.repeat(43), 'a'.repeat(44)])('fails closed on a missing or invalid encryption secret', secret => {
    expect(() => createInstallationCodec(secret)).toThrow('CONFIG_ENCRYPTION_KEY');
  });
  it.each([undefined, ''])('identifies an absent deployment secret without claiming its format is wrong', secret => {
    expect(() => createInstallationCodec(secret)).toThrow('CONFIG_ENCRYPTION_KEY is missing or empty in this deployment');
  });
  it.each([' ', '\n'])('identifies surrounding whitespace without revealing the secret', whitespace => {
    for (const secret of [whitespace + testEncryptionKey, testEncryptionKey + whitespace]) {
      let message = '';
      try { createInstallationCodec(secret); } catch (error) { message = (error as Error).message; }
      expect(message).toContain('CONFIG_ENCRYPTION_KEY contains surrounding whitespace');
      expect(message).not.toContain(testEncryptionKey);
    }
  });
  it.each(['"', "'"])('identifies pasted quotes without revealing the secret', quote => {
    const secret = quote + testEncryptionKey + quote;
    let message = '';
    try { createInstallationCodec(secret); } catch (error) { message = (error as Error).message; }
    expect(message).toContain('CONFIG_ENCRYPTION_KEY contains surrounding quotes');
    expect(message).not.toContain(testEncryptionKey);
  });
  it('reports format requirements and received length without echoing invalid values', () => {
    const secret = 'not-a-valid-key';
    let message = '';
    try { createInstallationCodec(secret); } catch (error) { message = (error as Error).message; }
    expect(message).toContain('received 15 characters');
    expect(message).toContain('43 base64url characters');
    expect(message).not.toContain(secret);
  });
  it('counts authentication overhead in the URL size limit', () => {
    const input = installation();
    input.credentials.token = '';
    const budget = Math.floor((MAX_CONFIGURATION_LENGTH - 3) * 3 / 4) - 28 - Buffer.byteLength(JSON.stringify(input));
    input.credentials.token = 'a'.repeat(budget);
    const encoded = encodeInstallation(input);
    expect(encoded.length).toBeLessThanOrEqual(MAX_CONFIGURATION_LENGTH);
    expect(decodeInstallation(encoded)).toEqual(input);
    input.credentials.token += 'a';
    expect(() => encodeInstallation(input)).toThrow('too large');
  });
});
