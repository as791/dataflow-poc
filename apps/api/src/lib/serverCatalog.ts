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
    fields: [{ key: 'key', label: 'Dedup key(s)', type: 'text' }, { key: 'keep', label: 'Keep', type: 'select', options: ['first', 'last'] }] },
  { activityType: 'transform.flatten', nodeType: 'transform', label: 'Flatten', color: '',
    fields: [{ key: 'delimiter', label: 'Key delimiter', type: 'text' }, { key: 'maxDepth', label: 'Max depth', type: 'number' }, { key: 'arrayPolicy', label: 'Array policy', type: 'select', options: ['index', 'stringify', 'keep'] }] },
  { activityType: 'transform.parse', nodeType: 'transform', label: 'Parse JSON', color: '',
    fields: [{ key: 'fields', label: 'Fields (comma-separated)', type: 'text' }, { key: 'onError', label: 'On error', type: 'select', options: ['skip', 'fail', 'null'] }] },
  // ── Flow ──
  { activityType: 'flow.fork', nodeType: 'fork', label: 'Fork', color: '', fields: [] },
  { activityType: 'flow.merge', nodeType: 'merge', label: 'Merge', color: '',
    fields: [{ key: 'mergeStrategy', label: 'Strategy', type: 'select', options: ['concat', 'union', 'innerJoin', 'leftJoin', 'outerJoin', 'appendWithSourceTag'] }, { key: 'joinKey', label: 'Join key', type: 'text' }] },
  // ── Sinks (destinations — bring-your-own via connector instance) ──
  { activityType: 'sink.postgres', nodeType: 'sink', label: 'Postgres (destination)', color: '',
    fields: [{ key: 'connection', label: 'Destination', type: 'instance-picker', provider: 'postgres', writes: ['connectionId'] }, { key: 'table', label: 'Target table', type: 'text' }, { key: 'conflictKey', label: 'Upsert key(s)', type: 'text' }] },
  { activityType: 'sink.gsheets', nodeType: 'sink', label: 'Google Sheets (destination)', color: '',
    fields: [{ key: 'connection', label: 'Destination', type: 'instance-picker', provider: 'google', writes: ['connectionId'] }, { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text' }, { key: 'sheetName', label: 'Sheet name', type: 'text' }] },
  { activityType: 'sink.webhook', nodeType: 'sink', label: 'Webhook (destination)', color: '',
    fields: [{ key: 'url', label: 'URL', type: 'text' }, { key: 'secret', label: 'HMAC secret', type: 'text' }] },
  { activityType: 'sink.records', nodeType: 'sink', label: 'DataFlow store (managed)', color: '',
    fields: [{ key: 'collection', label: 'Collection name', type: 'text' }, { key: 'dedupField', label: 'Dedup field', type: 'text' }] },
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
