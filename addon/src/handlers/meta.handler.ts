import type { AddonConfig } from '../config/config.schema.js';
import type { MetadataService } from '../metadata/metadata.service.js';

export function metaHandler(service: MetadataService, config: AddonConfig) {
  return async ({ type, id }: { type: string; id: string }) => ({
    meta: type === 'series' ? await service.get(id, config) : null,
  });
}
