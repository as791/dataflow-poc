// UI-side mirror of the worker's activity catalog: drives the palette
// and the config form rendered for each node type.
//
// FieldSpec / CatalogEntry are now defined once in @dataflow/shared so that
// the API (AI builder) and worker agree on the same shape. Re-exported here so
// existing imports from '../catalog' keep working.

import type { FieldSpec, CatalogEntry } from '@dataflow/shared';
export type { FieldSpec, CatalogEntry } from '@dataflow/shared';

export const CATALOG: CatalogEntry[] = [
  // ── Sources ──
  {
    activityType: 'zendesk.fetch', nodeType: 'source', label: 'Zendesk',
    color: '#1D9E75', supportsIngestion: true,
    fields: [
      { key: 'connection', label: 'Zendesk account', type: 'oauth-picker',
        picker: 'zendesk', provider: 'zendesk',
        writes: ['connectionId', 'subdomain', 'resource'] },
    ],
  },
  {
    activityType: 'gsheets.fetch', nodeType: 'source', label: 'Google Sheets',
    color: '#1D9E75', supportsIngestion: true,
    fields: [
      { key: 'connection', label: 'Spreadsheet', type: 'oauth-picker',
        picker: 'gsheets', provider: 'google',
        writes: ['connectionId', 'spreadsheetId', 'range', 'sheetName'] },
      { key: 'keyColumn', label: 'Key column', type: 'text',
        help: 'Column used to detect changed rows' },
    ],
  },
  {
    activityType: 'gdrive.fetch', nodeType: 'source', label: 'Google Drive',
    color: '#1D9E75', supportsIngestion: true,
    fields: [
      { key: 'connection', label: 'Drive folder', type: 'oauth-picker',
        picker: 'gdrive', provider: 'google',
        writes: ['connectionId', 'folderId', 'query'] },
    ],
  },
  {
    activityType: 'excel.fetch', nodeType: 'source', label: 'Microsoft Excel',
    color: '#1D9E75', supportsIngestion: true,
    fields: [
      { key: 'connection', label: 'Workbook', type: 'oauth-picker',
        picker: 'excel', provider: 'microsoft',
        writes: ['connectionId', 'driveId', 'itemId', 'sheetName'] },
      { key: 'keyColumn', label: 'Key column', type: 'text',
        help: 'Column used to detect changed rows' },
    ],
  },
  {
    activityType: 'http.fetch', nodeType: 'source', label: 'Custom API',
    color: '#1D9E75', supportsIngestion: true,
    fields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/items' },
      { key: 'recordsPath', label: 'Records path', type: 'text', placeholder: 'data.items' },
      { key: 'paginationJson', label: 'Pagination (JSON)', type: 'textarea',
        placeholder: '{"style":"cursor","cursorPath":"meta.next","param":"cursor","limitParam":"limit","limit":100}' },
      { key: 'authJson', label: 'Auth (JSON)', type: 'textarea',
        placeholder: '{"type":"bearer","token":"..."}' },
      { key: 'incrementalJson', label: 'Incremental (JSON)', type: 'textarea',
        placeholder: '{"sinceParam":"updated_after","recordTimestampPath":"updated_at"}' },
    ],
  },
  // ── Transforms ──
  {
    activityType: 'transform.map', nodeType: 'transform', label: 'Map',
    color: '#D85A30',
    fields: [{ key: 'expression', label: 'Safe projection expression', type: 'textarea',
      placeholder: '({ id: r.id, subject: r.subject, priority: r.priority })' }],
  },
  {
    activityType: 'transform.filter', nodeType: 'transform', label: 'Filter',
    color: '#D85A30',
    fields: [{ key: 'predicate', label: 'Safe predicate', type: 'textarea',
      placeholder: "r.status === 'open'" }],
  },
  {
    activityType: 'transform.rename', nodeType: 'transform', label: 'Rename',
    color: '#D85A30',
    fields: [{ key: 'mapping', label: 'Field mapping (JSON)', type: 'textarea',
      placeholder: '{"old_name":"new_name","ticket_id":"id"}' }],
  },
  {
    activityType: 'transform.dedupe', nodeType: 'transform', label: 'Dedupe',
    color: '#D85A30',
    fields: [
      { key: 'key', label: 'Dedup key(s)', type: 'text', placeholder: 'id, country',
        help: 'One field, or comma-separated for a compound key' },
      { key: 'keep', label: 'Keep', type: 'select', options: ['first', 'last'] },
    ],
  },
  {
    activityType: 'transform.flatten', nodeType: 'transform', label: 'Flatten',
    color: '#D85A30',
    fields: [
      { key: 'delimiter', label: 'Key delimiter', type: 'text', placeholder: '.' },
      { key: 'maxDepth', label: 'Max depth', type: 'number', placeholder: '10' },
      { key: 'arrayPolicy', label: 'Array policy', type: 'select', options: ['index', 'stringify', 'keep'] },
    ],
  },
  {
    activityType: 'transform.parse', nodeType: 'transform', label: 'Parse JSON',
    color: '#D85A30',
    fields: [
      { key: 'fields', label: 'Fields (comma-separated)', type: 'text', placeholder: 'payload,metadata' },
      { key: 'onError', label: 'On error', type: 'select', options: ['skip', 'fail', 'null'] },
    ],
  },
  // ── Flow ──
  { activityType: 'flow.fork', nodeType: 'fork', label: 'Fork', color: '#7F77DD', fields: [] },
  {
    activityType: 'flow.merge', nodeType: 'merge', label: 'Merge', color: '#7F77DD',
    fields: [
      { key: 'mergeStrategy', label: 'Strategy', type: 'select',
        options: ['concat', 'union', 'innerJoin', 'leftJoin', 'outerJoin', 'appendWithSourceTag'] },
      { key: 'joinKey', label: 'Join key (joins only)', type: 'text' },
    ],
  },
  // ── Sinks (destinations — bring-your-own via a connector instance) ──
  {
    activityType: 'sink.postgres', nodeType: 'sink', label: 'Postgres (destination)',
    color: '#639922',
    fields: [
      { key: 'connection', label: 'Destination', type: 'instance-picker', provider: 'postgres', writes: ['connectionId'] },
      { key: 'table', label: 'Target table', type: 'text', placeholder: 'public.orders' },
      { key: 'conflictKey', label: 'Upsert key(s)', type: 'text', placeholder: 'id',
        help: 'Comma-separated for a composite key; blank = insert only' },
    ],
  },
  {
    activityType: 'sink.gsheets', nodeType: 'sink', label: 'Google Sheets (destination)',
    color: '#639922',
    fields: [
      { key: 'connection', label: 'Destination', type: 'instance-picker', provider: 'google', writes: ['connectionId'] },
      { key: 'spreadsheetId', label: 'Spreadsheet ID', type: 'text' },
      { key: 'sheetName', label: 'Sheet name', type: 'text', placeholder: 'Sheet1' },
      { key: 'writeMode', label: 'Write mode', type: 'select', options: ['replace', 'append'],
        help: 'replace = clear & rewrite each run (idempotent); append = add rows' },
      { key: 'includeHeader', label: 'Include header row', type: 'checkbox' },
    ],
  },
  {
    activityType: 'sink.webhook', nodeType: 'sink', label: 'Webhook (destination)',
    color: '#639922',
    fields: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'secret', label: 'HMAC secret', type: 'text' },
    ],
  },
  {
    activityType: 'sink.records', nodeType: 'sink', label: 'DataFlow store (managed)',
    color: '#639922',
    fields: [
      { key: 'collection', label: 'Collection name', type: 'text' },
      { key: 'dedupField', label: 'Dedup field', type: 'text', placeholder: 'id' },
    ],
  },
];

export const byType = Object.fromEntries(CATALOG.map(c => [c.activityType, c]));
