import type { Manifest, ManifestCatalog } from 'stremio-addon-sdk';
import type { AddonConfig } from './config/config.schema.js';
import type { Genre } from './providers/tmdb/tmdb.types.js';
import { ALL_GENRES, SEARCH_CATALOG_ID } from './catalogs/catalog.service.js';
import { CNATIVE_ID_PREFIX } from './ids/id-resolver.service.js';

export function buildManifest(config: AddonConfig, genres: Genre[], configured: boolean): Manifest {
  return {
    id: 'org.cnative.tv', version: '1.1.0', name: 'cNative',
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
      { id: SEARCH_CATALOG_ID, name: 'cNative · 华语搜索', type: 'series', extra: [{ name: 'search', isRequired: true }] },
    ],
  };
}
