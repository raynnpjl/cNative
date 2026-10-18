import { z } from 'zod';

export const MAX_POSTER_URL_LENGTH = 2048;
const placeholders = ['imdb_id', 'tmdb_id', 'id', 'id_type', 'typed_id', 'type', 'shape'] as const;
type Placeholder = typeof placeholders[number];

function normalizeTemplate(template: string): string {
  return template.trim().replace(/%7B/gi, '{').replace(/%7D/gi, '}').replace(/%7C/gi, '|');
}

export const customPosterUrlSchema = z.string().trim().max(MAX_POSTER_URL_LENGTH, 'Poster URL must be at most 2048 characters.').superRefine((template, ctx) => {
  if (!template) return;
  let unsupported = false;
  const sample = normalizeTemplate(template).replace(/\{([^{}]+)\}/g, (_match, token: string) => {
    if (token.replace(/\?$/, '').split('|').some(key => !placeholders.includes(key as Placeholder))) unsupported = true;
    return 'value';
  });
  if (unsupported || /[{}]/.test(sample)) {
    ctx.addIssue({ code: 'custom', message: 'Use supported poster placeholders: {imdb_id}, {tmdb_id}, {id}, {id_type}, {typed_id}, {type}, {shape}.' });
    return;
  }
  try {
    const url = new URL(sample);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error();
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Enter a complete HTTP or HTTPS poster URL.' });
  }
});

export function resolveCustomPosterUrl(template: string | undefined, ids: { imdbId?: string; tmdbId: number }): string | undefined {
  if (!template?.trim()) return undefined;
  const values: Record<Placeholder, string | undefined> = {
    imdb_id: ids.imdbId,
    tmdb_id: String(ids.tmdbId),
    id: ids.imdbId ?? `tmdb:${ids.tmdbId}`,
    id_type: ids.imdbId ? 'imdb' : 'tmdb',
    typed_id: ids.imdbId ?? `series-${ids.tmdbId}`,
    type: 'series',
    shape: 'poster',
  };
  let missing = false;
  const url = normalizeTemplate(template).replace(/\{([^{}]+)\}/g, (_match, token: string) => {
    const optional = token.endsWith('?');
    const value = token.replace(/\?$/, '').split('|').map(key => values[key as Placeholder]).find(Boolean);
    if (!value && !optional) missing = true;
    return value ? encodeURIComponent(value) : '';
  });
  return missing ? undefined : url;
}
