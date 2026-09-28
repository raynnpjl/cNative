import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createApp } from '../addon/src/app.js';
import { JsonConfigStore } from '../addon/src/config/config.store.js';
import { TmdbCredentialsStore } from '../addon/src/config/tmdb-credentials.store.js';
import { tmdbFixture } from './fixtures.js';

let directory: string;
let server: Server;
let base: string;
let config: JsonConfigStore;
let credentials: TmdbCredentialsStore;
let fixture: ReturnType<typeof tmdbFixture>;
async function start() {
  await new Promise<void>((resolve, reject) => {
    server = createApp(config, credentials, { fetcher: fixture.fetcher }).listen(0, '127.0.0.1', error => error ? reject(error) : resolve());
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
  directory = await mkdtemp(join(tmpdir(), 'cnative-credentials-http-'));
  config = await JsonConfigStore.open(join(directory, 'config.json'));
  credentials = await TmdbCredentialsStore.open(join(directory, 'tmdb.json'));
  fixture = tmdbFixture();
  await start();
});
afterEach(async () => { await stop(); if (directory) await rm(directory, { recursive: true, force: true }); });
const get = (path: string) => fetch(`${base}${path}`);
const save = (body: unknown, headers: Record<string, string> = {}) => fetch(`${base}/api/credentials`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

it('requires configuration and blocks metadata even when environment credentials exist', async () => {
  vi.stubEnv('TMDB_API_KEY', 'environment-key');
  vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'environment-token');
  try {
    expect(await (await get('/api/status')).json()).toEqual({ tmdbConfigured: false, tokenConfigured: false });
    expect(await (await get('/manifest.json')).json()).toMatchObject({ name: 'cNative', behaviorHints: { configurable: true, configurationRequired: true } });
    for (const path of ['/api/lookups', '/catalog/series/catalog_default.json', '/meta/series/tt1234567.json']) {
      const response = await get(path);
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: expect.stringContaining('Save your TMDB API key') });
    }
    expect(fixture.fetcher).not.toHaveBeenCalled();
  } finally { vi.unstubAllEnvs(); }
});

it('validates and saves an API key, unlocks installation immediately and survives restart', async () => {
  const response = await save({ apiKey: ' valid-key ' });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ tmdbConfigured: true, tokenConfigured: false });
  expect(fixture.urls[0]?.pathname).toBe('/3/authentication');
  expect(fixture.urls[0]?.searchParams.get('api_key')).toBe('valid-key');
  expect(await (await get('/manifest.json')).json()).toMatchObject({ name: 'cNative', behaviorHints: { configurationRequired: false } });
  expect((await get('/catalog/series/catalog_default.json')).status).toBe(200);
  await stop();
  credentials = await TmdbCredentialsStore.open(join(directory, 'tmdb.json'));
  await start();
  expect((await get('/api/lookups')).status).toBe(200);
  expect(await (await get('/api/status')).json()).toEqual({ tmdbConfigured: true, tokenConfigured: false });
});

it.each([{}, { apiKey: '  ' }, { token: 'token-only' }])('rejects missing API keys: %j', async body => {
  expect((await save(body)).status).toBe(400);
  expect(credentials.get()).toBeUndefined();
  expect(fixture.fetcher).not.toHaveBeenCalled();
});

it('validates the required key separately from the optional token and never returns secrets', async () => {
  const response = await save({ apiKey: 'private-key', token: 'private-token' });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ tmdbConfigured: true, tokenConfigured: true });
  expect(fixture.fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Authorization');
  expect(fixture.urls[0]?.searchParams.get('api_key')).toBe('private-key');
  expect(fixture.fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer private-token' });
  expect(fixture.urls[1]?.searchParams.has('api_key')).toBe(false);
  for (const path of ['/api/config', '/api/status', '/manifest.json']) {
    const read = await get(path);
    expect(read.headers.get('Cache-Control')).toBe('no-store');
    expect(await read.text()).not.toMatch(/private-key|private-token/);
  }
});

it.each(['key', 'token'])('rejects an invalid %s without overwriting saved credentials', async kind => {
  await save({ apiKey: 'original' });
  const fetcher = fixture.fetcher.getMockImplementation()!;
  fixture.fetcher.mockImplementation(async (input, init) => {
    const isToken = Boolean(new Headers(init?.headers).get('Authorization'));
    if (new URL(String(input)).pathname === '/3/authentication' && isToken === (kind === 'token')) return new Response('{}', { status: 401 });
    return fetcher(input, init);
  });
  const response = await save({ apiKey: 'rejected-key', token: 'rejected-token' });
  expect(response.status).toBe(400);
  expect(await response.text()).not.toMatch(/rejected-key|rejected-token/);
  expect(credentials.get()).toEqual({ apiKey: 'original' });
});

it('retains working credentials when persistence or TMDB validation fails', async () => {
  await save({ apiKey: 'original' });
  const disk = vi.spyOn(credentials, 'save').mockRejectedValueOnce(new Error('Disk full'));
  expect((await save({ apiKey: 'replacement' })).status).toBe(500);
  disk.mockRestore();
  fixture.fetcher.mockRejectedValueOnce(new Error('https://example?api_key=secret-value'));
  const response = await save({ apiKey: 'secret-value' });
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('secret-value');
  expect(credentials.get()).toEqual({ apiKey: 'original' });
});

it('replaces credentials without reusing the previous client cache and can remove the token', async () => {
  await save({ apiKey: 'first', token: 'first-token' });
  await get('/api/lookups');
  const before = fixture.fetcher.mock.calls.length;
  expect((await save({ apiKey: 'second' })).status).toBe(200);
  await get('/api/lookups');
  const calls = fixture.fetcher.mock.calls.slice(before);
  expect(calls).toHaveLength(5);
  for (const [input, init] of calls) {
    expect(new URL(String(input)).searchParams.get('api_key')).toBe('second');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  }
  expect(await (await get('/api/status')).json()).toEqual({ tmdbConfigured: true, tokenConfigured: false });
});

it('rejects cross-origin, malformed-origin and non-JSON writes without CORS exposure', async () => {
  for (const origin of ['https://other.example', 'null']) expect((await save({ apiKey: 'key' }, { Origin: origin })).status).toBe(403);
  expect((await save({ apiKey: 'key' }, { 'Content-Type': 'text/plain' })).status).toBe(415);
  const response = await save({ apiKey: 'key' }, { Origin: base });
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
});
