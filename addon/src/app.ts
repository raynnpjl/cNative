import express, { type ErrorRequestHandler } from 'express';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createDefaultConfig } from '../../shared/config.js';
import { tmdbCredentialsSchema, type TmdbCredentials } from '../../shared/credentials.js';
import { installationRequestSchema, saveInstallationSchema } from '../../shared/installation.js';
import { configurationView, createInstallationCodec, type Installation } from './config/installation.js';
import { TmdbClient } from './providers/tmdb/tmdb.client.js';
import { IdResolver } from './ids/id-resolver.service.js';
import { CatalogService } from './catalogs/catalog.service.js';
import { MetadataService } from './metadata/metadata.service.js';
import { catalogHandler } from './handlers/catalog.handler.js';
import { metaHandler } from './handlers/meta.handler.js';
import { buildManifest } from './manifest.js';
import { AddonBuilder } from './stremio.js';
import { MemoryCache, TTL } from './cache/memory-cache.js';
import { InputError, TmdbError } from './utils/errors.js';

const extraSchema = z.strictObject({ search: z.string().max(200).optional(), genre: z.string().max(100).optional(), skip: z.string().optional() });

export function createApp(options: { fetcher?: typeof fetch; frontendPath?: string; encryptionKey?: string } = {}) {
  const { encode, decode } = createInstallationCodec(options.encryptionKey ?? process.env.CONFIG_ENCRYPTION_KEY);
  const app = express();
  const frontend = options.frontendPath ?? resolve('dist/configure');
  app.enable('strict routing');
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  function createRuntime(credentials: TmdbCredentials) {
    const tmdb = new TmdbClient({ ...credentials, fetcher: options.fetcher });
    const keyClient = credentials.token ? new TmdbClient({ apiKey: credentials.apiKey, fetcher: options.fetcher }) : tmdb;
    const ids = new IdResolver(tmdb);
    return { tmdb, keyClient, catalogs: new CatalogService(tmdb, ids), metadata: new MetadataService(tmdb, ids) };
  }
  // Bounded, disposable caches only. Settings always come from the current request.
  const runtimes = new MemoryCache<ReturnType<typeof createRuntime>>(20);
  function runtime(credentials: TmdbCredentials) {
    const key = createHash('sha256').update(JSON.stringify(credentials)).digest('hex');
    let active = runtimes.get(key);
    if (!active) { active = createRuntime(credentials); runtimes.set(key, active, TTL.metadata); }
    return active;
  }
  async function validatedRuntime(credentials: TmdbCredentials) {
    const active = runtime(credentials);
    async function validate(client: TmdbClient, label: string) {
      try { await client.validateCredentials(); }
      catch (error) {
        if (error instanceof TmdbError && (error.status === 401 || error.status === 403)) throw new InputError(`TMDB rejected the ${label}. Check it and try again.`);
        throw error;
      }
    }
    await validate(active.keyClient, 'API key');
    if (credentials.token) await validate(active.tmdb, 'read access token');
    return active;
  }
  async function addon(installation: Installation) {
    const active = await validatedRuntime(installation.credentials);
    const manifest = buildManifest(installation.config, await active.tmdb.genres(), true);
    if (Buffer.byteLength(JSON.stringify(manifest), 'utf8') > 8192) throw new InputError('Manifest exceeds Stremio’s 8 KB limit. Use fewer enabled catalogs.');
    const builder = new AddonBuilder(manifest);
    builder.defineCatalogHandler(catalogHandler(active.catalogs, installation.config));
    builder.defineMetaHandler(metaHandler(active.metadata, installation.config));
    return builder.getInterface();
  }
  app.use('/api', (req, res, next) => {
    if (req.method !== 'POST') { next(); return; }
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) throw new Error(); }
      catch { res.status(403).json({ error: 'Configuration requests must be same-origin' }); return; }
    }
    if (!req.is('application/json')) { res.status(415).json({ error: 'Expected application/json' }); return; }
    next();
  });
  app.use('/api', express.json({ limit: '128kb' }));
  app.get('/api/status', (_req, res) => { res.json({ ok: true }); });
  app.post('/api/configure', async (req, res) => {
    const request = saveInstallationSchema.parse(req.body as unknown);
    const previous = request.encodedConfig ? decode(request.encodedConfig).credentials : undefined;
    const changes = request.credentialChanges;
    const token = changes?.token === undefined ? previous?.token : changes.token;
    const credentials = tmdbCredentialsSchema.parse({ apiKey: changes?.apiKey ?? previous?.apiKey, ...(token ? { token } : {}) });
    const installation: Installation = { version: 1, config: request.config, credentials };
    const encodedConfig = encode(installation);
    await addon(installation);
    res.json({ encodedConfig, ...configurationView(installation) });
  });
  app.post('/api/configuration', (req, res) => {
    const { encodedConfig } = installationRequestSchema.parse(req.body as unknown);
    res.json(configurationView(decode(encodedConfig)));
  });
  app.post('/api/lookups', async (req, res) => {
    const { encodedConfig } = installationRequestSchema.parse(req.body as unknown);
    const { credentials } = decode(encodedConfig);
    res.json(await (await validatedRuntime(credentials)).tmdb.lookups());
  });
  app.get('/', (_req, res) => { res.redirect('/configure'); });
  app.get(/^\/(?:([^/]+)\/)?configure\/?$/, (req, res) => {
    if (req.params[0]) decode(req.params[0]);
    res.sendFile(resolve(frontend, 'index.html'));
  });
  app.use('/assets', express.static(resolve(frontend, 'assets')));

  // Stremio sends the configuration prefix on every resource request.
  const protocol = express.Router({ mergeParams: true });
  protocol.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
  protocol.options('/{*path}', (_req, res) => { res.sendStatus(204); });
  protocol.get<{ configuration?: string }>('/manifest.json', async (req, res) => {
    const encoded = req.params.configuration;
    res.json(encoded ? (await addon(decode(encoded))).manifest : buildManifest(createDefaultConfig(), [], false));
  });
  protocol.get(/^\/(catalog|meta)\/([^/]+)\/([^/]+?)(?:\/(.*))?\.json$/, async (req, res) => {
    const encoded = req.params.configuration;
    if (!encoded) throw new InputError('Configure your TMDB API key and install your personal addon URL first.');
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
    res.json(await (await addon(decode(encoded))).get(resource, type, id, extra));
  });
  app.use('/', protocol);
  app.use('/:configuration', protocol);
  app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
  const onError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof z.ZodError) { res.status(400).json({ error: 'Invalid configuration or request' }); return; }
    if (error instanceof SyntaxError || error instanceof URIError) { res.status(400).json({ error: 'Invalid request encoding' }); return; }
    if (error instanceof InputError) { res.status(400).json({ error: error.message }); return; }
    if (error instanceof TmdbError) { res.status(502).json({ error: error.message }); return; }
    // Never log URLs, request bodies or upstream error messages containing keys.
    console.error('cNative request failed');
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(onError);
  return app;
}
