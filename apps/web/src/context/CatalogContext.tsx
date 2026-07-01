import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CATALOG, type CatalogEntry } from '../catalog';
import { api } from '../api';
import { catalogForFeatures } from '@dataflow/shared';
import { useFeatures } from './FeatureContext';

// The connector catalog drives the palette, the per-node config form, and node
// labels/colors. The static CATALOG covers the coded connectors and is the
// instant-render seed/fallback; the server catalog adds manifest-driven
// connectors. Coded entries keep their richer field metadata (OAuth pickers),
// so static wins on conflict.
interface CatalogValue {
  catalog: CatalogEntry[];
  byType: Record<string, CatalogEntry>;
}

const CatalogContext = createContext<CatalogValue>({
  catalog: CATALOG,
  byType: Object.fromEntries(CATALOG.map(c => [c.activityType, c])),
});

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { features } = useFeatures();
  const fallback = useMemo(() => catalogForFeatures(CATALOG, features), [features]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>(fallback);

  useEffect(() => {
    setCatalog(fallback);
    api.getConnectorCatalog()
      .then((res: { catalog: CatalogEntry[] }) => {
        const byType = new Map(fallback.map(c => [c.activityType, c]));
        for (const e of res.catalog ?? []) if (!byType.has(e.activityType)) byType.set(e.activityType, e);
        setCatalog([...byType.values()]);
      })
      .catch(() => setCatalog(fallback));
  }, [fallback]);

  const value = useMemo<CatalogValue>(() => ({
    catalog,
    byType: Object.fromEntries(catalog.map(c => [c.activityType, c])),
  }), [catalog]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogValue {
  return useContext(CatalogContext);
}
