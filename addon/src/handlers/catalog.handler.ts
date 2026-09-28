import type { AddonConfig } from '../config/config.schema.js';
import type { CatalogExtra, CatalogService } from '../catalogs/catalog.service.js';

export function catalogHandler(service: CatalogService, config: AddonConfig) {
  return async ({ type, id, extra }: { type: string; id: string; extra: CatalogExtra }) => ({
    metas: type === 'series' ? await service.get(id, extra, config) : [],
  });
}
