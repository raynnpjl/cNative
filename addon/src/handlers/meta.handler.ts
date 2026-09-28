import type { ConfigStore } from '../config/config.store.js';
import type { MetadataService } from '../metadata/metadata.service.js';

export function metaHandler(service: MetadataService, store: ConfigStore) {
  return async ({ type, id }: { type: string; id: string }) => ({
    meta: type === 'series' ? await service.get(id, await store.get()) : null,
  });
}
