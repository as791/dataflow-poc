import type { CatalogEntry } from '@dataflow/shared';
import { registry } from '@dataflow/connector-sdk';

// Server-side mirror of apps/web/src/catalog.ts. Drives AI prompt construction
// and mermaidToDefinition resolution. Kept minimal (no React/colour concerns).
//
// M2 NOTE: this is the single thing the connector registry replaces. When the
// SDK lands, swap `serverCatalog` for `registry.getCatalog()` — nothing else in
// ai.ts changes.
export const serverCatalog: CatalogEntry[] = [
  // ── Sources ──
  { activityType: 'zendesk.fetch', nodeType: 'source', label: 'Zendesk', color: '', supportsIngestion: true,
    fields: [{ key: 'resource', label: 'Resource', type: 'text' }] },
  { activityType: 'gsheets.fetch', nodeType: 'source', label: 'Google Sheets', color: '', supportsIngestion: true,
    fields: [{ key: 'spreadsheetId', label: 'Spreadsheet', type: 'text' }, { key: 'keyColumn', label: 'Key column', type: 'text' }] },
  { activityType: 'gdrive.fetch', nodeType: 'source', label: 'Google Drive', color: '', supportsIngestion: true,
    fields: [{ key: 'folderId', label: 'Drive folder', type: 'text' }] },
  { activityType: 'excel.fetch', nodeType: 'source', label: 'Microsoft Excel', color: '', supportsIngestion: true,
    fields: [{ key: 'itemId', label: 'Workbook', type: 'text' }, { key: 'keyColumn', label: 'Key column', type: 'text' }] },
  { activityType: 'http.fetch', nodeType: 'source', label: 'Custom API', color: '', supportsIngestion: true,
    fields: [{ key: 'url', label: 'URL', type: 'text' }, { key: 'recordsPath', label: 'Records path', type: 'text' }] },
  // ── Transforms ──
  { activityType: 'transform.map', nodeType: 'transform', label: 'Map', color: '',
    fields: [{ key: 'expression', label: 'Safe projection expression', type: 'textarea' }] },
  { activityType: 'transform.filter', nodeType: 'transform', label: 'Filter', color: '',
    fields: [{ key: 'predicate', label: 'Safe predicate', type: 'textarea' }] },
  { activityType: 'transform.rename', nodeType: 'transform', label: 'Rename', color: '',
    fields: [{ key: 'mapping', label: 'Field mapping (JSON)', type: 'textarea' }] },
  { activityType: 'transform.dedupe', nodeType: 'transform', label: 'Dedupe', color: '',
    fields: [{ key: 'key', label: 'Dedup key field', type: 'text' }] },
  // ── Flow ──
  { activityType: 'flow.fork', nodeType: 'fork', label: 'Fork', color: '', fields: [] },
  { activityType: 'flow.merge', nodeType: 'merge', label: 'Merge', color: '',
    fields: [{ key: 'mergeStrategy', label: 'Strategy', type: 'select', options: ['concat', 'innerJoin'] }, { key: 'joinKey', label: 'Join key', type: 'text' }] },
  // ── Sinks ──
  { activityType: 'sink.postgres', nodeType: 'sink', label: 'Postgres sink', color: '',
    fields: [{ key: 'collection', label: 'Collection name', type: 'text' }, { key: 'dedupField', label: 'Dedup field', type: 'text' }] },
  { activityType: 'sink.webhook', nodeType: 'sink', label: 'Webhook sink', color: '',
    fields: [{ key: 'url', label: 'URL', type: 'text' }, { key: 'secret', label: 'HMAC secret', type: 'text' }] },
];

// Coded connectors (rich field/oauth metadata) + manifest-driven connectors
// from the registry. Deduped by activityType; the coded entry wins because it
// carries the OAuth picker config the registry can't express. This is the
// single catalog the AI builder and the /api/connectors/catalog endpoint use.
export function getCatalog(): CatalogEntry[] {
  const byType = new Map<string, CatalogEntry>();
  for (const e of registry.getCatalog()) byType.set(e.activityType, e);
  for (const e of serverCatalog) byType.set(e.activityType, e);
  return [...byType.values()];
}
