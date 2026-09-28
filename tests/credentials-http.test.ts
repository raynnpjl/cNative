import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../addon/src/app.js';
import { createDefaultConfig } from '../shared/config.js';
import { decodeInstallation, encodeInstallation } from '../shared/installation.js';
import { tmdbFixture } from './fixtures.js';

let directory: string;
let server: Server;
let base: string;
let fixture: ReturnType<typeof tmdbFixture>;
async function start() {
  await new Promise<void>((resolve, reject) => {
    server = createApp({ fetcher: fixture.fetcher, frontendPath: directory }).listen(0, '127.0.0.1', error => error ? reject(error) : resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  base = `http://127.0.0.1:${address.port}`;
}
async function stop() {
  server?.closeAllConnections();
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cnative-http-'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><div id="root"></div>');
  fixture = tmdbFixture(); await start();
});
afterEach(async () => { await stop(); await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); });
const get = (path: string) => fetch(`${base}${path}`);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const installation = (credentials: unknown) => ({ version: 1, config: createDefaultConfig(), credentials });
const save = (credentials: unknown, headers: Record<string, string> = {}) => post('/api/configure', installation(credentials), headers);

it('starts unconfigured regardless of environment and removes shared configuration APIs', async () => {
  vi.stubEnv('TMDB_API_KEY', 'environment-key'); vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'environment-token');
  expect(await (await get('/api/status')).json()).toEqual({ ok: true });
  expect(await (await get('/manifest.json')).json()).toMatchObject({ name: 'cNative', behaviorHints: { configurationRequired: true } });
  expect((await get('/catalog/series/catalog_default.json')).status).toBe(400);
  for (const path of ['/api/config', '/api/credentials', '/.env', '/data/config.json']) expect((await get(path)).status).toBe(404);
  expect(fixture.fetcher).not.toHaveBeenCalled();
});

it('validates a key and creates a personal URL that works after a cold restart', async () => {
  const response = await save({ apiKey: ' valid-key ' });
  expect(response.status).toBe(200);
  const { encodedConfig } = await response.json();
  expect(decodeInstallation(encodedConfig).credentials).toEqual({ apiKey: 'valid-key' });
  expect(fixture.urls[0]?.pathname).toBe('/3/authentication');
  expect(fixture.urls[0]?.searchParams.get('api_key')).toBe('valid-key');
  expect(await (await get(`/${encodedConfig}/manifest.json`)).json()).toMatchObject({ behaviorHints: { configurationRequired: false } });
  await stop(); await start();
  expect((await get(`/${encodedConfig}/catalog/series/catalog_default.json`)).status).toBe(200);
  // Creating a URL never configures the public/default installation.
  expect(await (await get('/manifest.json')).json()).toMatchObject({ behaviorHints: { configurationRequired: true } });
});

it.each([{}, { apiKey: '  ' }, { token: 'token-only' }])('requires the API key: %j', async credentials => {
  expect((await save(credentials)).status).toBe(400);
  expect(fixture.fetcher).not.toHaveBeenCalled();
});

it('validates key separately from optional token and omits secrets from manifest/status', async () => {
  const response = await save({ apiKey: 'private-key', token: 'private-token' });
  expect(response.status).toBe(200);
  const { encodedConfig } = await response.json();
  const auth = fixture.fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname.endsWith('/authentication'));
  expect(new URL(String(auth[0]?.[0])).searchParams.get('api_key')).toBe('private-key');
  expect(new Headers(auth[0]?.[1]?.headers).has('Authorization')).toBe(false);
  expect(new Headers(auth[1]?.[1]?.headers).get('Authorization')).toBe('Bearer private-token');
  for (const path of ['/api/status', `/${encodedConfig}/manifest.json`]) {
    const read = await get(path);
    expect(read.headers.get('Cache-Control')).toBe('no-store');
    expect(read.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await read.text()).not.toMatch(/private-key|private-token/);
  }
});

it.each(['key', 'token'])('rejects an invalid %s through both Save and direct manifest URLs', async kind => {
  const fetcher = fixture.fetcher.getMockImplementation()!;
  fixture.fetcher.mockImplementation(async (input, init) => {
    const isToken = new Headers(init?.headers).has('Authorization');
    if (new URL(String(input)).pathname === '/3/authentication' && isToken === (kind === 'token')) return new Response('{}', { status: 401 });
    return fetcher(input, init);
  });
  const credentials = { apiKey: 'rejected-key', token: 'rejected-token' };
  const response = await save(credentials);
  expect(response.status).toBe(400);
  expect(await response.text()).not.toMatch(/rejected-key|rejected-token/);
  const encoded = encodeInstallation({ version: 1, config: createDefaultConfig(), credentials });
  expect((await get(`/${encoded}/manifest.json`)).status).toBe(400);
});

it('keeps concurrent users and configurations isolated, including caches', async () => {
  const first = { version: 1 as const, credentials: { apiKey: 'first' }, config: createDefaultConfig() };
  const second = { version: 1 as const, credentials: { apiKey: 'second', token: 'second-token' }, config: createDefaultConfig() };
  first.config.catalogs[0]!.name = 'First'; first.config.catalogs[0]!.originCountry = 'CN';
  second.config.catalogs[0]!.name = 'Second'; second.config.catalogs[0]!.originCountry = 'TW';
  const a = encodeInstallation(first); const b = encodeInstallation(second);
  const results = await Promise.all([get(`/${a}/manifest.json`), get(`/${b}/manifest.json`)]);
  expect((await results[0]!.json()).catalogs[0].name).toBe('First');
  expect((await results[1]!.json()).catalogs[0].name).toBe('Second');
  for (let i = 0; i < 2; i++) {
    const responses = await Promise.all([get(`/${a}/catalog/series/catalog_default.json`), get(`/${b}/catalog/series/catalog_default.json`)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
  }
  const calls = fixture.fetcher.mock.calls.filter(([input]) => new URL(String(input)).pathname.endsWith('/discover/tv'));
  expect(calls).toHaveLength(2);
  for (const [input, init] of calls) {
    const url = new URL(String(input));
    if (url.searchParams.get('with_origin_country') === 'CN') {
      expect(url.searchParams.get('api_key')).toBe('first');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    } else expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer second-token');
  }
  // Same credentials, different settings must also remain independent.
  const c = encodeInstallation({ ...second, credentials: first.credentials });
  expect((await get(`/${c}/catalog/series/catalog_default.json`)).status).toBe(200);
  expect(fixture.urls.filter(url => url.pathname.endsWith('/discover/tv')).at(-1)?.searchParams.get('with_origin_country')).toBe('TW');
  expect((await (await get(`/${a}/manifest.json`)).json()).catalogs[0].name).toBe('First');
});

it('serves the same configure UI at personal paths and rejects malformed configuration', async () => {
  const { encodedConfig } = await (await save({ apiKey: 'key' })).json();
  for (const path of ['/configure', '/configure/', `/${encodedConfig}/configure`, `/${encodedConfig}/configure/`]) {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(await response.text()).toContain('id="root"');
  }
  for (const path of ['/broken/manifest.json', '/broken/configure', '/broken/meta/series/tt1234567.json']) expect((await get(path)).status).toBe(400);
  expect((await fetch(`${base}/${encodedConfig}/manifest.json`, { method: 'OPTIONS' })).status).toBe(204);
});

it('handles upstream failures without disclosing secrets', async () => {
  fixture.fetcher.mockRejectedValueOnce(new Error('https://example?api_key=secret-value'));
  const response = await save({ apiKey: 'secret-value' });
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('secret-value');
});

it('rejects cross-origin and non-JSON validation requests', async () => {
  for (const origin of ['https://other.example', 'null']) expect((await save({ apiKey: 'key' }, { Origin: origin })).status).toBe(403);
  expect((await save({ apiKey: 'key' }, { 'Content-Type': 'text/plain' })).status).toBe(415);
  const response = await save({ apiKey: 'key' }, { Origin: base });
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
});
