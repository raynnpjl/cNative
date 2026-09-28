import 'dotenv/config';
import { z } from 'zod';
import { createApp } from './app.js';

const env = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(7000),
  HOST: z.string().default('127.0.0.1'),
}).parse(process.env);

const server = createApp().listen(env.PORT, env.HOST, () => {
  console.log(`cNative: http://${env.HOST}:${env.PORT}/configure/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); });
