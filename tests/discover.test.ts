import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCatalog, sortOptions } from '../shared/config.js';
import { buildDiscoverQuery } from '../addon/src/catalogs/discover-query.builder.js';
import { skipToTmdbPage } from '../addon/src/utils/pagination.js';

afterEach(() => vi.useRealTimers());
const base = () => createCatalog('catalog_test');

describe('TMDB Discover builder', () => {
  it('maps the requested mainland catalog and every numeric/date filter', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T12:00:00Z'));
    expect(buildDiscoverQuery({ ...base(), originCountry: 'CN', includeGenres: [18], voteAverageMin: 6, voteAverageMax: 9, voteCountMin: 20, runtimeMin: 30, runtimeMax: 60, firstAirDateFrom: '2020-01-01' }, 2)).toEqual({
      language: 'zh-CN', page: 2, sort_by: 'popularity.desc', with_origin_country: 'CN', with_original_language: 'zh', with_genres: '18',
      'vote_average.gte': 6, 'vote_average.lte': 9, 'vote_count.gte': 20, 'with_runtime.gte': 30, 'with_runtime.lte': 60,
      'first_air_date.gte': '2020-01-01', 'first_air_date.lte': '2026-09-28', include_null_first_air_dates: false,
    });
  });
  it.each(sortOptions)('passes through %s', sortBy => { expect(buildDiscoverQuery({ ...base(), sortBy }, 1).sort_by).toBe(sortBy); });
  it('omits unconfigured filters and retains zeros', () => {
    const query = buildDiscoverQuery({ ...base(), releasedOnly: false, originalLanguage: undefined, voteAverageMax: undefined }, 1);
    expect(query).not.toHaveProperty('with_origin_country');
    expect(query).not.toHaveProperty('with_genres');
    expect(query).not.toHaveProperty('first_air_date.lte');
    expect(query).not.toHaveProperty('with_original_language');
    expect(query['vote_average.gte']).toBe(0);
    expect(Object.values(query)).not.toContain('');
  });
  it('includes any selected genre and preserves exclusions and Stremio narrowing', () => {
    expect(buildDiscoverQuery({ ...base(), includeGenres: [18, 35], excludeGenres: [80, 99] }, 1)).toMatchObject({ with_genres: '18|35', without_genres: '80,99' });
    expect(buildDiscoverQuery({ ...base(), includeGenres: [18, 35, 37, 10765] }, 1).with_genres).toBe('18|35|37|10765');
    expect(buildDiscoverQuery({ ...base(), includeGenres: [18] }, 1, 9648).with_genres).toBe('18,9648');
    expect(buildDiscoverQuery({ ...base(), includeGenres: [18] }, 1, 18).with_genres).toBe('18');
    expect(buildDiscoverQuery({ ...base(), includeGenres: [18, 35] }, 1, 35).with_genres).toBe('35');
    expect(() => buildDiscoverQuery({ ...base(), includeGenres: [18, 35] }, 1, 9648)).toThrow('included genres');
  });
  it('caps future end dates at today while preserving an earlier end date', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2030-04-05T00:00:00Z'));
    expect(buildDiscoverQuery({ ...base(), firstAirDateTo: '2035-01-01' }, 1)['first_air_date.lte']).toBe('2030-04-05');
    expect(buildDiscoverQuery({ ...base(), firstAirDateTo: '2020-01-01' }, 1)['first_air_date.lte']).toBe('2020-01-01');
  });
});

it.each([[0, 1], [19, 1], [20, 2], [40, 3], [9980, 500], [10000, 501]])('skip %i → page %i', (skip, page) => { expect(skipToTmdbPage(skip)).toBe(page); });
it.each(['-1', 'abc', '1.5', '', 'Infinity', '9007199254740992'])('rejects invalid skip %s', skip => { expect(() => skipToTmdbPage(skip)).toThrow(); });
