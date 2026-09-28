import express, { type ErrorRequestHandler } from 'express';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { ConfigStore } from './config/config.store.js';
import type { TmdbCredentialsStore } from './config/tmdb-credentials.store.js';
import { addonConfigSchema } from './config/config.schema.js';
import { tmdbCredentialsSchema } from '../../shared/credentials.js';
import { TmdbClient } from './providers/tmdb/tmdb.client.js';
import { IdResolver } from './ids/id-resolver.service.js';
import { CatalogService } from './catalogs/catalog.service.js';
import { MetadataService } from './metadata/metadata.service.js';
import { catalogHandler } from './handlers/catalog.handler.js';
import { metaHandler } from './handlers/meta.handler.js';
import { buildManifest } from './manifest.js';
import { AddonBuilder, type StremioInterface } from './stremio.js';
import { InputError, TmdbError } from './utils/errors.js';

const extraSchema = z.strictObject({ search: z.string().max(200).optional(), genre: z.string().max(100).optional(), skip: z.string().optional() });

export function createApp(store: ConfigStore, credentials: TmdbCredentialsStore, options: { fetcher?: typeof fetch; frontendPath?: string } = {}) {
  const app = express();
  app.enable('strict routing');
  app.disable('x-powered-by');
  function createRuntime() {
    const saved = credentials.get();
    const tmdb = new TmdbClient({ ...saved, fetcher: options.fetcher });
    const ids = new IdResolver(tmdb);
    return {
      credentialsKey: JSON.stringify(saved), tmdb,
      onCatalog: catalogHandler(new CatalogService(tmdb, ids), store),
      onMeta: metaHandler(new MetadataService(tmdb, ids), store),
      cached: undefined as { key: string; addon: StremioInterface } | undefined,
    };
  }
  let current = createRuntime();
  function runtime() {
    if (current.credentialsKey !== JSON.stringify(credentials.get())) current = createRuntime();
    return current;
  }
  function status() {
    const saved = credentials.get();
    return { tmdbConfigured: Boolean(saved?.apiKey), tokenConfigured: Boolean(saved?.token) };
  }

  async function addon() {
    const active = runtime();
    const config = await store.get();
    const genres = active.tmdb.configured ? await active.tmdb.genres() : [];
    const manifest = buildManifest(config, genres, active.tmdb.configured);
    const key = JSON.stringify(manifest);
    if (active.cached?.key === key) return active.cached.addon;
    const builder = new AddonBuilder(manifest);
    builder.defineCatalogHandler(active.onCatalog);
    builder.defineMetaHandler(active.onMeta);
    const result = builder.getInterface();
    active.cached = { key, addon: result };
    return result;
  }

  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (req.method !== 'PUT') { next(); return; }
    // JSON + same-origin writes protect both configuration and credentials.
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) throw new Error(); }
      catch { res.status(403).json({ error: 'Configuration writes must be same-origin' }); return; }
    }
    if (!req.is('application/json')) { res.status(415).json({ error: 'Expected application/json' }); return; }
    next();
  });
  app.use('/api', express.json({ limit: '128kb' }));
  app.get('/api/config', async (_req, res) => { res.json(await store.get()); });
  app.put('/api/config', async (req, res) => {
    const config = addonConfigSchema.parse(req.body as unknown);
    const { tmdb } = runtime();
    const genres = tmdb.configured ? await tmdb.genres() : [];
    if (JSON.stringify(buildManifest(config, genres, tmdb.configured)).length > 8192) throw new InputError('Manifest exceeds Stremio’s 8 KB limit. Use fewer enabled catalogs.');
    res.json(await store.save(config));
  });
  app.put('/api/credentials', async (req, res) => {
    const input = tmdbCredentialsSchema.parse(req.body as unknown);
    async function validate(auth: { apiKey?: string; token?: string }, label: string) {
      try { await new TmdbClient({ ...auth, fetcher: options.fetcher }).validateCredentials(); }
      catch (error) {
        if (error instanceof TmdbError && (error.status === 401 || error.status === 403)) throw new InputError(`TMDB rejected the ${label}. Check it and try again.`);
        throw error;
      }
    }
    await validate({ apiKey: input.apiKey }, 'API key');
    if (input.token) await validate({ token: input.token }, 'read access token');
    await credentials.save(input);
    res.json(status());
  });
  app.get('/api/lookups', async (_req, res) => { res.json(await runtime().tmdb.lookups()); });
  app.get('/api/status', (_req, res) => { res.json(status()); });
  app.get('/', (_req, res) => { res.redirect('/configure/'); });
  app.get('/configure', (_req, res) => { res.redirect('/configure/'); });
  app.use('/configure', express.static(options.frontendPath ?? resolve('dist/configure')));

  // Express owns transport; the SDK owns resource dispatch and manifest validation.
  // CORS is enabled only for the read-only Stremio protocol, never configuration.
  app.use((req, res, next) => {
    if (req.path === '/manifest.json' || /^\/(catalog|meta)\//.test(req.path)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    }
    next();
  });
  app.get('/manifest.json', async (_req, res) => { res.json((await addon()).manifest); });
  app.get(/^\/(catalog|meta)\/([^/]+)\/([^/]+?)(?:\/(.*))?\.json$/, async (req, res) => {
    if (!credentials.get()) throw new TmdbError(503);
    const resource = req.params[0];
    if (resource !== 'catalog' && resource !== 'meta') { res.sendStatus(404); return; }
    const type = req.params[1] ?? '';
    const id = req.params[2] ?? '';
    // Parse raw path to retain encoded ampersands in search terms.
    const segments = req.path.split('/');
    const extraRaw = segments.length > 4 ? segments.slice(4).join('/').slice(0, -5) : '';
    const params = new URLSearchParams(extraRaw);
    for (const key of params.keys()) if (params.getAll(key).length > 1) throw new InputError('Duplicate catalog extra');
    const extra = extraSchema.parse(Object.fromEntries(params));
    res.json(await (await addon()).get(resource, type, id, extra));
  });
  app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid configuration or request', issues: error.issues }); return; }
    if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid JSON request' }); return; }
    if (error instanceof InputError || error instanceof URIError) { res.status(400).json({ error: error.message }); return; }
    if (error instanceof TmdbError) {
      res.status(error.status === 503 ? 503 : 502).json({ error: error.status === 503 ? 'Save your TMDB API key in General Settings before using this addon.' : error.message });
      return;
    }
    console.error('cNative request failed:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(onError);
  return app;
}
