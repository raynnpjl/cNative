import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { addonConfigSchema, type AddonConfig } from './config.schema.js';
import { createDefaultConfig } from './defaults.js';

export interface ConfigStore {
  get(): Promise<AddonConfig>;
  save(input: unknown): Promise<AddonConfig>;
}

export class JsonConfigStore implements ConfigStore {
  private current?: AddonConfig;
  private pending: Promise<void> = Promise.resolve();

  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<JsonConfigStore> {
    const store = new JsonConfigStore(path);
    try {
      store.current = addonConfigSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      await store.save(createDefaultConfig());
    }
    return store;
  }

  async get(): Promise<AddonConfig> {
    if (!this.current) throw new Error('Configuration store is not initialized');
    return structuredClone(this.current);
  }

  async save(input: unknown): Promise<AddonConfig> {
    const config = addonConfigSchema.parse(input);
    const operation = this.pending.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
      try {
        const file = await open(temporaryPath, 'wx', 0o600);
        try {
          await file.writeFile(`${JSON.stringify(config, null, 2)}\n`, 'utf8');
          await file.sync();
        } finally { await file.close(); }
        await rename(temporaryPath, this.path);
        this.current = config;
      } finally {
        await unlink(temporaryPath).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        });
      }
    });
    this.pending = operation.catch(() => {});
    await operation;
    return structuredClone(config);
  }
}
