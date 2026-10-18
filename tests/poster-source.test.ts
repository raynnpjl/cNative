import { describe, expect, it } from 'vitest';
import { addonConfigSchema, createDefaultConfig } from '../shared/config.js';
import { customPosterUrlSchema, resolveCustomPosterUrl } from '../shared/poster-source.js';

const ids = { imdbId: 'tt1234567', tmdbId: 101 };

describe('custom poster sources', () => {
  it('accepts an optional source in the encrypted configuration contract', () => {
    const config = createDefaultConfig();
    expect(addonConfigSchema.parse(config)).toEqual(config);
    expect(addonConfigSchema.parse({ ...config, customPosterUrl: ' https://posters.example/{imdb_id}.jpg ' }).customPosterUrl)
      .toBe('https://posters.example/{imdb_id}.jpg');
    expect(customPosterUrlSchema.parse('')).toBe('');
  });

  it.each([
    ['https://posters.example/{imdb_id}/{tmdb_id}?type={type}&shape={shape}', 'https://posters.example/tt1234567/101?type=series&shape=poster'],
    ['https://posters.example/{id_type}/{typed_id}.jpg', 'https://posters.example/imdb/tt1234567.jpg'],
    ['https://posters.example/{imdb_id|tmdb_id}.jpg', 'https://posters.example/tt1234567.jpg'],
    ['https://posters.example/%7Bimdb_id%7D.jpg?key=test%2Bkey', 'https://posters.example/tt1234567.jpg?key=test%2Bkey'],
    ['https://btttr.cc/poster/imdb/poster-default/{imdb_id}.jpg', 'https://btttr.cc/poster/imdb/poster-default/tt1234567.jpg'],
    ['https://postersplus.elfhosted.com/p/clean_notch/{type}/{imdb_id|tmdb_id}.jpg?shape={shape}', 'https://postersplus.elfhosted.com/p/clean_notch/series/tt1234567.jpg?shape=poster'],
  ])('resolves provider identifiers in %s', (template, expected) => {
    expect(customPosterUrlSchema.safeParse(template).success).toBe(true);
    expect(resolveCustomPosterUrl(template, ids)).toBe(expected);
  });

  it('supports TMDB-only shows without inventing an IMDb ID', () => {
    const unmapped = { tmdbId: 102 };
    expect(resolveCustomPosterUrl('https://posters.example/{imdb_id}.jpg', unmapped)).toBeUndefined();
    expect(resolveCustomPosterUrl('https://posters.example/{type}/{tmdb_id}?imdb={imdb_id?}', unmapped))
      .toBe('https://posters.example/series/102?imdb=');
    expect(resolveCustomPosterUrl('https://posters.example/{id_type}/{typed_id}.jpg', unmapped))
      .toBe('https://posters.example/tmdb/series-102.jpg');
    expect(resolveCustomPosterUrl('https://posters.example/{imdb_id|tmdb_id}.jpg', unmapped))
      .toBe('https://posters.example/102.jpg');
    expect(resolveCustomPosterUrl('https://btttr.cc/poster/imdb/poster-default/{imdb_id}.jpg', unmapped)).toBeUndefined();
    expect(resolveCustomPosterUrl('https://postersplus.elfhosted.com/p/clean_notch/{type}/{imdb_id|tmdb_id}.jpg?shape={shape}', unmapped))
      .toBe('https://postersplus.elfhosted.com/p/clean_notch/series/102.jpg?shape=poster');
    expect(resolveCustomPosterUrl('https://posters.example/?id={id}', unmapped))
      .toBe('https://posters.example/?id=tmdb%3A102');
    expect(resolveCustomPosterUrl(undefined, ids)).toBeUndefined();
    expect(resolveCustomPosterUrl('  ', ids)).toBeUndefined();
  });

  it.each([
    'not a URL', '/posters/{imdb_id}', 'javascript:alert(1)', 'file:///poster.png',
    'https://posters.example/{unknown}.jpg', 'https://posters.example/{imdb_id',
    'https://posters.example/{imdb_id|}.jpg', 'https://posters.example/{}.jpg',
    `https://posters.example/${'a'.repeat(2048)}`,
  ])('rejects malformed or unsupported poster sources: %s', template => {
    expect(customPosterUrlSchema.safeParse(template).success).toBe(false);
    expect(addonConfigSchema.safeParse({ ...createDefaultConfig(), customPosterUrl: template }).success).toBe(false);
  });
});
