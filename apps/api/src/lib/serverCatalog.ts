import type { CatalogEntry } from '@dataflow/shared';
import { CATALOG, catalogForFeatures, DEFAULT_PAID_FEATURES } from '@dataflow/shared';
import { registry } from '@dataflow/connector-sdk';

// Canonical catalog is now in @dataflow/shared — single source of truth for web, API, and worker.
// getCatalog() merges manifest-driven connectors from the registry; coded entries win on conflict.
export const serverCatalog: CatalogEntry[] = CATALOG;

export function getCatalog(features = Object.fromEntries(Object.keys(DEFAULT_PAID_FEATURES).map(key => [key, true])) as typeof DEFAULT_PAID_FEATURES): CatalogEntry[] {
  const byType = new Map<string, CatalogEntry>();
  for (const e of registry.getCatalog()) byType.set(e.activityType, e);
  for (const e of CATALOG) byType.set(e.activityType, e);
  return catalogForFeatures([...byType.values()], features);
}
