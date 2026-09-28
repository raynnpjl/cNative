import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmdbCredentialsSchema, type TmdbCredentials } from '../../../shared/credentials.js';

export class TmdbCredentialsStore {
  private current?: TmdbCredentials;
  private pending: Promise<void> = Promise.resolve();

  private constructor(private readonly path: string) {}

  static async open(path: string): Promise<TmdbCredentialsStore> {
    const store = new TmdbCredentialsStore(path);
    try { store.current = tmdbCredentialsSchema.parse(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    return store;
  }

  get(): TmdbCredentials | undefined { return this.current && structuredClone(this.current); }

  async save(input: unknown): Promise<void> {
    const credentials = tmdbCredentialsSchema.parse(input);
    const operation = this.pending.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporaryPath = `${this.path}.${randomUUID()}.tmp`;
      try {
        const file = await open(temporaryPath, 'wx', 0o600);
        try {
          await file.writeFile(`${JSON.stringify(credentials, null, 2)}\n`, 'utf8');
          await file.sync();
        } finally { await file.close(); }
        await rename(temporaryPath, this.path);
        this.current = credentials;
      } finally {
        await unlink(temporaryPath).catch((error: unknown) => {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        });
      }
    });
    this.pending = operation.catch(() => {});
    await operation;
  }
}
