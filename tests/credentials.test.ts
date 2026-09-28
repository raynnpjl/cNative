import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../shared/config.js';
import { decodeInstallation, encodeInstallation, installationFromPath, MAX_CONFIGURATION_LENGTH } from '../shared/installation.js';

const installation = () => ({ version: 1 as const, config: createDefaultConfig(), credentials: { apiKey: 'test-key', token: 'optional-token' } });
describe('personal installation links', () => {
  it('round trips Unicode, punctuation, every catalog field and credentials', () => {
    const input = installation();
    Object.assign(input.config.catalogs[0]!, { name: '剧集 & / + 😃', originCountry: 'CN', firstAirDateFrom: '2020-01-01', firstAirDateTo: '2026-01-01', runtimeMin: 10, runtimeMax: 90, excludeGenres: [35], showInHome: false });
    const encoded = encodeInstallation(input);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeInstallation(encoded)).toEqual(input);
    expect(installationFromPath(`/${encoded}/configure/`)).toEqual(input);
  });
  it('supports API key only, with no configuration on the public configure page', () => {
    expect(decodeInstallation(encodeInstallation({ ...installation(), credentials: { apiKey: 'key' } })).credentials).toEqual({ apiKey: 'key' });
    expect(installationFromPath('/configure')).toBeUndefined();
    expect(installationFromPath('/')).toBeUndefined();
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
});
