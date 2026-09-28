import 'dotenv/config';
import { z } from 'zod';
import { JsonConfigStore } from './config/config.store.js';
import { TmdbCredentialsStore } from './config/tmdb-credentials.store.js';
import { createApp } from './app.js';

const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(7000),
  HOST: z.string().default('127.0.0.1'),
  CONFIG_PATH: z.string().default('/data/config.json'),
}).parse(process.env);

const store = await JsonConfigStore.open(env.CONFIG_PATH);
const credentials = await TmdbCredentialsStore.open(`${env.CONFIG_PATH}.tmdb.json`);
const server = createApp(store, credentials).listen(env.PORT, env.HOST, () => {
  console.log(`cNative: http://${env.HOST}:${env.PORT}/configure/`);
  if (!credentials.get()) console.log('Save your TMDB API key in General Settings to enable installation.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); });
