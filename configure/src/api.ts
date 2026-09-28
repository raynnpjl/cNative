import { z } from 'zod';
import { addonConfigSchema, lookupSchema, type AddonConfig } from '../../shared/config';
import { tmdbStatusSchema, type TmdbCredentials } from '../../shared/credentials';

async function request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string(), issues: z.array(z.object({ message: z.string(), path: z.array(z.union([z.string(), z.number()])) })).optional() }).safeParse(body);
    if (parsed.success) throw new Error([parsed.data.error, ...(parsed.data.issues?.map(issue => `${issue.path.join('.')}: ${issue.message}`) ?? [])].join(' · '));
    throw new Error(`Request failed (${response.status})`);
  }
  return schema.parse(body);
}

export const getConfig = () => request('/api/config', addonConfigSchema);
export const getLookups = () => request('/api/lookups', lookupSchema);
export const getStatus = () => request('/api/status', tmdbStatusSchema);
export const saveCredentials = (credentials: TmdbCredentials) => request('/api/credentials', tmdbStatusSchema, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials),
});
export const saveConfig = (config: AddonConfig) => request('/api/config', addonConfigSchema, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
});
