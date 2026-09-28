import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { TmdbCredentialsStore } from '../addon/src/config/tmdb-credentials.store.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function path() {
  const dir = await mkdtemp(join(tmpdir(), 'cnative-credentials-'));
  directories.push(dir);
  return join(dir, 'tmdb-credentials.json');
}

it('starts unconfigured and privately persists credentials across restarts', async () => {
  const file = await path();
  const store = await TmdbCredentialsStore.open(file);
  expect(store.get()).toBeUndefined();
  await store.save({ apiKey: 'test-key', token: 'test-token' });
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  expect((await TmdbCredentialsStore.open(file)).get()).toEqual({ apiKey: 'test-key', token: 'test-token' });
  store.get()!.apiKey = 'unsaved';
  expect(store.get()?.apiKey).toBe('test-key');
});

it('requires an API key, permits no token, and serializes replacement saves', async () => {
  const file = await path();
  const store = await TmdbCredentialsStore.open(file);
  await expect(store.save({ token: 'token-only' })).rejects.toThrow();
  await expect(store.save({ apiKey: '  ' })).rejects.toThrow();
  await Promise.all([store.save({ apiKey: 'first', token: 'token' }), store.save({ apiKey: ' second ' })]);
  expect(store.get()).toEqual({ apiKey: 'second' });
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(store.get());
  expect(await readdir(join(file, '..'))).toEqual(['tmdb-credentials.json']);
});

it('never overwrites an invalid saved credentials file', async () => {
  const file = await path();
  await writeFile(file, '{bad');
  await expect(TmdbCredentialsStore.open(file)).rejects.toThrow();
  expect(await readFile(file, 'utf8')).toBe('{bad');
});
