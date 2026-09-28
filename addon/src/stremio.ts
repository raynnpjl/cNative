import sdk, { type Manifest } from 'stremio-addon-sdk';
import type { catalogHandler } from './handlers/catalog.handler.js';
import type { metaHandler } from './handlers/meta.handler.js';
import type { CatalogExtra } from './catalogs/catalog.service.js';

type CatalogHandler = ReturnType<typeof catalogHandler>;
type MetaHandler = ReturnType<typeof metaHandler>;
type ResourceResult = Awaited<ReturnType<CatalogHandler>> | Awaited<ReturnType<MetaHandler>>;
export interface StremioInterface {
  manifest: Manifest;
  get(resource: 'catalog' | 'meta', type: string, id: string, extra: CatalogExtra): Promise<ResourceResult>;
}

// @types/stremio-addon-sdk has outdated get(args), posterShape and nullable
// metadata signatures. This boundary describes the installed SDK's runtime API.
export const AddonBuilder = sdk.addonBuilder as unknown as {
  new(manifest: Manifest): {
    defineCatalogHandler(handler: CatalogHandler): void;
    defineMetaHandler(handler: MetaHandler): void;
    getInterface(): StremioInterface;
  };
};
