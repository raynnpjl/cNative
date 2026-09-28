import { readFileSync } from 'node:fs';
import { convertRewrites, type Rewrite } from '@vercel/routing-utils';
import { expect, it } from 'vitest';
import { createDefaultConfig } from '../shared/config.js';
import { encodeInstallation } from '../shared/installation.js';

const config: { rewrites: Rewrite[] } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const routes = convertRewrites(config.rewrites);
const encoded = encodeInstallation({ version: 1, config: createDefaultConfig(), credentials: { apiKey: 'test-key', token: 'test-token' } });

it.each([
  ['/api/configure', '/api/index'],
  ['/api/lookups', '/api/index'],
  ['/api/status', '/api/index'],
  ['/configure', '/index.html'],
  [`/${encoded}/configure`, '/index.html'],
  ['/manifest.json', '/api/index'],
  [`/${encoded}/manifest.json`, '/api/index'],
  [`/${encoded}/catalog/series/catalog_default.json`, '/api/index'],
  [`/${encoded}/meta/series/tt1234567.json`, '/api/index'],
])('routes %s to %s on Vercel', (path, destination) => {
  const route = routes.find(route => 'src' in route && typeof route.src === 'string' && new RegExp(route.src).test(path));
  expect(route && 'dest' in route ? route.dest?.split('?')[0] : undefined).toBe(destination);
});
