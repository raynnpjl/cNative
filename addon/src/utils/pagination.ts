import { InputError } from './errors.js';

export const TMDB_PAGE_SIZE = 20;
export const TMDB_MAX_PAGE = 500;

export function parseSkip(skip: string | number | undefined): number {
  if (skip === undefined) return 0;
  if (typeof skip === 'string' && !/^\d+$/.test(skip)) throw new InputError('skip must be a non-negative integer');
  const value = Number(skip);
  if (!Number.isSafeInteger(value) || value < 0) throw new InputError('skip must be a non-negative integer');
  return value;
}

export function skipToTmdbPage(skip: string | number | undefined = 0): number {
  return Math.floor(parseSkip(skip) / TMDB_PAGE_SIZE) + 1;
}
