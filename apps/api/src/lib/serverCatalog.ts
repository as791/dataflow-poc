import type { CatalogEntry } from '@dataflow/shared';
import { CATALOG } from '@dataflow/shared';
import { registry } from '@dataflow/connector-sdk';

// Canonical catalog is now in @dataflow/shared — single source of truth for web, API, and worker.
// getCatalog() merges manifest-driven connectors from the registry; coded entries win on conflict.
export const serverCatalog: CatalogEntry[] = CATALOG;

export function getCatalog(): CatalogEntry[] {
  const byType = new Map<string, CatalogEntry>();
  for (const e of registry.getCatalog()) byType.set(e.activityType, e);
  for (const e of CATALOG) byType.set(e.activityType, e);
  return [...byType.values()];
}
