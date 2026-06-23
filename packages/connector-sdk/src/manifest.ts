import type { CatalogEntry, FieldSpec, NodeKind } from '@dataflow/shared';

// A connector manifest describes a REST source (or sink) declaratively — no
// code. The generic executor (executor.ts) runs it. Complex connectors that
// can't be expressed this way use the coded-plugin escape hatch (plugin.ts).

export interface ManifestPagination {
  style: 'cursor' | 'page' | 'offset';
  cursorPath?: string;   // style=cursor: JSON path to the next cursor in the body
  param?: string;        // query param carrying the cursor/page/offset
  limitParam?: string;   // query param carrying the page size
  limit?: number;        // default page size
}

export interface ManifestIncremental {
  sinceParam: string;            // query param for the watermark
  recordTimestampPath: string;   // JSON path to a record's timestamp
}

export interface ManifestAuth {
  type: 'none' | 'bearer' | 'header' | 'basic';
  // For declarative auth, values usually come from node config (e.g. an API
  // key the user pastes). The field keys are declared in `fields`.
  tokenField?: string;   // config key holding the bearer token / header value
  headerName?: string;   // type=header: the header to set
}

export interface ConnectorManifest {
  activityType: string;          // catalog key, e.g. "rest.jsonplaceholder.fetch"
  label: string;
  kind: 'source' | 'sink';
  color?: string;
  supportsIngestion?: boolean;
  // Request shape (source). Node config overrides these at run time.
  url: string;                   // may contain {placeholders} filled from config
  method?: string;
  recordsPath?: string;
  headers?: Record<string, string>;
  auth?: ManifestAuth;
  pagination?: ManifestPagination;
  incremental?: ManifestIncremental;
  // UI metadata: extra config fields the node form should render.
  fields?: FieldSpec[];
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// Throws on a malformed manifest. Cheap structural checks — enough to fail fast
// with a clear message when someone drops a bad JSON file.
export function validateManifest(m: any): asserts m is ConnectorManifest {
  if (!m || typeof m !== 'object') throw new Error('manifest is not an object');
  if (!isStr(m.activityType)) throw new Error('manifest.activityType is required');
  if (!isStr(m.label)) throw new Error(`manifest ${m.activityType}: label is required`);
  if (m.kind !== 'source' && m.kind !== 'sink') throw new Error(`manifest ${m.activityType}: kind must be 'source' or 'sink'`);
  if (!isStr(m.url)) throw new Error(`manifest ${m.activityType}: url is required`);
  if (m.pagination && !['cursor', 'page', 'offset'].includes(m.pagination.style)) {
    throw new Error(`manifest ${m.activityType}: invalid pagination.style`);
  }
}

// Manifest → the UI/AI catalog entry shape used everywhere else.
export function manifestToCatalogEntry(m: ConnectorManifest): CatalogEntry {
  const nodeType: NodeKind = m.kind === 'sink' ? 'sink' : 'source';
  return {
    activityType: m.activityType,
    nodeType,
    label: m.label,
    color: m.color ?? (m.kind === 'sink' ? '#639922' : '#1D9E75'),
    supportsIngestion: m.supportsIngestion ?? m.kind === 'source',
    fields: m.fields ?? [],
  };
}
