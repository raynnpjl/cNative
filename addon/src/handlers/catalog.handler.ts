import type { ConfigStore } from '../config/config.store.js';
import type { CatalogExtra, CatalogService } from '../catalogs/catalog.service.js';

export function catalogHandler(service: CatalogService, store: ConfigStore) {
  return async ({ type, id, extra }: { type: string; id: string; extra: CatalogExtra }) => ({
    metas: type === 'series' ? await service.get(id, extra, await store.get()) : [],
  });
}
