import { z } from 'zod';
import { lookupSchema } from '../../shared/config';
import { configurationResponseSchema, saveInstallationResponseSchema, type SaveInstallation } from '../../shared/installation';

async function request<T>(path: string, schema: z.ZodType<T>, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), referrerPolicy: 'no-referrer',
  });
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error(`The addon server returned an invalid response (HTTP ${response.status}).`); }
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(result);
    throw new Error(parsed.success ? parsed.data.error : `Request failed (${response.status})`);
  }
  return schema.parse(result);
}

export const getLookups = (encodedConfig: string) => request('/api/lookups', lookupSchema, { encodedConfig });
export const getConfiguration = (encodedConfig: string) => request('/api/configuration', configurationResponseSchema, { encodedConfig });
export const saveInstallation = (installation: SaveInstallation) => request('/api/configure', saveInstallationResponseSchema, installation);
