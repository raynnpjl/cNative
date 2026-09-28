import { createCatalog, type CatalogConfig } from '../../shared/config';

export const newCatalog = () => createCatalog(`catalog_${crypto.randomUUID()}`);
export function duplicateCatalog(catalog: CatalogConfig): CatalogConfig {
  return { ...structuredClone(catalog), id: `catalog_${crypto.randomUUID()}`, name: `${catalog.name.slice(0, 90)} · 副本` };
}
export function reorderCatalogs(catalogs: CatalogConfig[], id: string, target: number): CatalogConfig[] {
  const index = catalogs.findIndex(catalog => catalog.id === id);
  if (index < 0 || target < 0 || target >= catalogs.length || index === target) return catalogs;
  const reordered = [...catalogs];
  const moved = reordered.splice(index, 1)[0];
  if (moved) reordered.splice(target, 0, moved);
  return reordered;
}
