// Catalog types shared by the worker activity catalog, the web palette, and the
// AI builder's server-side mirror. Moved here (from apps/web/src/catalog.ts) so
// api + web + shared agree on one definition. M2 will make these the contract
// for the connector registry.

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox' | 'oauth-picker' | 'instance-picker';
  options?: string[];
  placeholder?: string;
  help?: string;
  visibleWhen?: { key: string; equals: string };
  // Picker-only metadata. The PipelineCanvasPage config renderer dispatches
  // on `picker` to mount the right component.
  picker?: 'gsheets' | 'gdrive' | 'excel' | 'zendesk';
  // 'instance-picker' lists connector instances of this provider (A3/A6) and
  // writes the chosen instance id into config.connectionId.
  provider?: 'google' | 'microsoft' | 'zendesk' | 'postgres' | 'mysql' | 'mongodb' | 'clickhouse' | 's3' | 'sftp' | 'snowflake' | 'iceberg' | 'kafka' | 'http';
  // Keys that this picker writes into config (e.g. picker 'gsheets' writes
  // connectionId + spreadsheetId + range + sheetName). Documented for clarity;
  // the picker components do the writes themselves.
  writes?: string[];
}

export type NodeKind = 'source' | 'transform' | 'sink' | 'fork' | 'merge';

export interface CatalogEntry {
  activityType: string;
  nodeType: NodeKind;
  label: string;
  color: string;
  fields: FieldSpec[];
  supportsIngestion?: boolean; // shows incremental/backfill controls
  requiredFeature?: import('./features').PaidFeatureKey;
}
