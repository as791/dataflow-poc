// UI-side mirror of the worker's activity catalog: drives the palette
// and the config form rendered for each node type.

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'oauth-picker';
  options?: string[];
  placeholder?: string;
  help?: string;
  // Picker-only metadata. The PipelineCanvasPage config renderer dispatches
  // on `picker` to mount the right component.
  picker?: 'gsheets' | 'gdrive' | 'excel' | 'zendesk';
  provider?: 'google' | 'microsoft' | 'zendesk';
  // Keys that this picker writes into config (e.g. picker 'gsheets' writes
  // connectionId + spreadsheetId + range + sheetName). Documented for clarity;
  // the picker components do the writes themselves.
  writes?: string[];
}

export interface CatalogEntry {
  activityType: string;
  nodeType: 'source' | 'transform' | 'sink' | 'fork' | 'merge';
  label: string;
  color: string;
  fields: FieldSpec[];
  supportsIngestion?: boolean; // shows incremental/backfill controls
}

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
    fields: [{ key: 'expression', label: 'Expression (r => …)', type: 'textarea',
      placeholder: '({ id: r.id, subject: r.subject, priority: r.priority })' }],
  },
  {
    activityType: 'transform.filter', nodeType: 'transform', label: 'Filter',
    color: '#D85A30',
    fields: [{ key: 'predicate', label: 'Predicate', type: 'textarea',
      placeholder: "r.status === 'open'" }],
  },
  {
    activityType: 'transform.dedupe', nodeType: 'transform', label: 'Dedupe',
    color: '#D85A30',
    fields: [{ key: 'key', label: 'Dedup key field', type: 'text', placeholder: 'id' }],
  },
  // ── Flow ──
  { activityType: 'flow.fork', nodeType: 'fork', label: 'Fork', color: '#7F77DD', fields: [] },
  {
    activityType: 'flow.merge', nodeType: 'merge', label: 'Merge', color: '#7F77DD',
    fields: [
      { key: 'mergeStrategy', label: 'Strategy', type: 'select', options: ['concat', 'innerJoin'] },
      { key: 'joinKey', label: 'Join key (for innerJoin)', type: 'text' },
    ],
  },
  // ── Sinks ──
  {
    activityType: 'sink.postgres', nodeType: 'sink', label: 'Postgres sink',
    color: '#639922',
    fields: [
      { key: 'collection', label: 'Collection name', type: 'text' },
      { key: 'dedupField', label: 'Dedup field', type: 'text', placeholder: 'id' },
    ],
  },
  {
    activityType: 'sink.webhook', nodeType: 'sink', label: 'Webhook sink',
    color: '#639922',
    fields: [
      { key: 'url', label: 'URL', type: 'text' },
      { key: 'secret', label: 'HMAC secret', type: 'text' },
    ],
  },
];

export const byType = Object.fromEntries(CATALOG.map(c => [c.activityType, c]));
