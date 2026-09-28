import type { Manifest, ManifestCatalog } from 'stremio-addon-sdk';
import type { AddonConfig } from './config/config.schema.js';
import type { Genre } from './providers/tmdb/tmdb.types.js';
import { ALL_GENRES, SEARCH_CATALOG_ID } from './catalogs/catalog.service.js';
import { CNATIVE_ID_PREFIX } from './ids/id-resolver.service.js';

interface CNativeManifest extends Manifest {
  stremioAddonsConfig: { issuer: string; signature: string };
}

export function buildManifest(config: AddonConfig, genres: Genre[], configured: boolean): CNativeManifest {
  return {
    id: 'org.cnative.tv', version: '1.1.0', name: 'cNative',
    stremioAddonsConfig: {
      issuer: 'https://stremio-addons.net',
      signature: 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2In0..f1tKdVu9r9pulRewImYz4w.KfyclNTDbdfiBdT-YOHq8-38Xm5fR9SxwaTPVz1Refc2tBVWYp3i-C58KPbZp9OaZjMJfr6WVnWkAt88yTaxggd_Hkg0OCyFYeFELlUNb20UzhSvJPDxYwWSf5h0iPZc.KTgsZgyYJswNzdaN1ejaHA',
    },
    description: 'Chinese dramas with native titles and existing Chinese TMDB metadata. No translation.',
    types: ['series'],
    resources: ['catalog', { name: 'meta', types: ['series'], idPrefixes: [CNATIVE_ID_PREFIX] }],
    behaviorHints: { configurable: true, configurationRequired: !configured, adult: config.includeAdult, p2p: false },
    catalogs: [
      ...config.catalogs.filter(catalog => catalog.enabled).map((catalog): ManifestCatalog => ({
        id: catalog.id, name: catalog.name, type: 'series',
        extra: [
          { name: 'genre', isRequired: !catalog.showInHome, options: [ALL_GENRES, ...genres
            .filter(genre => !catalog.excludeGenres.includes(genre.id))
            .filter(genre => catalog.includeGenres.length < 2 || catalog.includeGenres.includes(genre.id))
            .map(genre => genre.name)] },
          { name: 'skip', isRequired: false },
        ],
      })),
      { id: SEARCH_CATALOG_ID, name: 'cNative', type: 'series', extra: [{ name: 'search', isRequired: true }] },
    ],
  };
}
