import { registry, type SourceFn, type Handler } from '@dataflow/connector-sdk';
import { evaluateFormulaExpression, evaluateMapExpression, evaluatePredicate, type CdcEvent } from '@dataflow/shared';
import jmespath from 'jmespath';
import { zendeskFetch } from './connectors/zendesk';
import { gsheetsFetch } from './connectors/gsheets';
import { gdriveFetch } from './connectors/gdrive';
import { excelFetch } from './connectors/excel';
import { httpFetch } from './connectors/http';
import { mysqlFetch, mysqlSink } from './connectors/mysql';
import { mongodbFetch, mongodbSink } from './connectors/mongodb';
import { s3Fetch, s3Sink } from './connectors/s3';
import { sftpFetch, sftpSink } from './connectors/sftp';
import { snowflakeFetch, snowflakeSink } from './connectors/snowflake';
import { icebergFetch } from './connectors/iceberg';
import { kafkaFetch, kafkaSink } from './connectors/kafka';
import { collapseCdcEvents, fetchDebeziumBatch } from './connectors/debezium';
import { pool } from './db';
import { writeRecords } from './clickhouse';
import { connectClickHouse, connectPostgres, loadCredentialInstance } from './connectors/credentials';
import axios from 'axios';
import crypto from 'crypto';

// Connector runtime contracts now live in the SDK; re-exported so the coded
// connectors (which import from '../catalog') keep working unchanged.
export type { SourceFetchParams, SourceFetchResult, Handler, HandlerCtx } from '@dataflow/connector-sdk';

// Coded source connectors (bespoke logic). Manifest-driven sources come from
// the registry and are merged in below — adding a REST source is then a single
// JSON file, no code here.
const codedSources: Record<string, SourceFn> = {
  'zendesk.fetch':  zendeskFetch,
  'gsheets.fetch':  gsheetsFetch,
  'gdrive.fetch':   gdriveFetch,
  'excel.fetch':    excelFetch,
  'http.fetch':     httpFetch,
  'postgres.fetch': postgresFetch,
  'mysql.fetch':    mysqlFetch,
  'mongodb.fetch':  mongodbFetch,
  's3.fetch':       s3Fetch,
  'sftp.fetch':     sftpFetch,
  'snowflake.fetch': snowflakeFetch,
  'iceberg.fetch':  icebergFetch,
  'kafka.fetch':    kafkaFetch,
};
export const sources: Record<string, SourceFn> = { ...codedSources, ...registry.getSources() };

export function resolveWebhookSettings(config: Record<string, any>, instance?: Awaited<ReturnType<typeof loadCredentialInstance>>) {
  if (instance) {
    if (instance.provider !== 'http') throw new Error(`connector ${config.connectionId} is not HTTP`);
    return { url: String(instance.extra.baseUrl ?? ''), secret: String(instance.secret.hmacSecret ?? '') };
  }
  return { url: String(config.url ?? ''), secret: String(config.secret ?? '') };
}

// ── transform.flatten / transform.parse helpers (pure; exported for the unit check) ──
type ArrayPolicy = 'index' | 'stringify' | 'keep';
export function flattenRecord(
  obj: Record<string, any>,
  delimiter = '.',
  maxDepth = 10,
  arrayPolicy: ArrayPolicy = 'index',
  prefix = '',
  depth = 0,
  out: Record<string, any> = {},
): Record<string, any> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}${delimiter}${k}` : k;
    if (Array.isArray(v)) {
      if (arrayPolicy === 'stringify') out[key] = JSON.stringify(v);
      else if (arrayPolicy === 'keep' || depth >= maxDepth) out[key] = v;
      else v.forEach((el, i) => {
        const ikey = `${key}${delimiter}${i}`;
        if (el && typeof el === 'object') flattenRecord(el, delimiter, maxDepth, arrayPolicy, ikey, depth + 1, out);
        else out[ikey] = el;
      });
    } else if (v && typeof v === 'object') {
      if (depth >= maxDepth) out[key] = v; // depth ceiling: keep the subtree as-is
      else flattenRecord(v, delimiter, maxDepth, arrayPolicy, key, depth + 1, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

export function parseRecordFields(
  record: Record<string, any>,
  fields: string[],
  onError: 'skip' | 'fail' | 'null' = 'skip',
): Record<string, any> {
  const out = { ...record };
  for (const f of fields) {
    const val = out[f];
    if (typeof val !== 'string') continue; // absent or already parsed
    try { out[f] = JSON.parse(val); }
    catch {
      if (onError === 'fail') throw new Error(`transform.parse: field "${f}" is not valid JSON`);
      if (onError === 'null') out[f] = null;
      // skip: leave the original string untouched
    }
  }
  return out;
}

type ContractType = 'any' | 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date';
const CONTRACT_TYPES = new Set<ContractType>(['any', 'string', 'number', 'boolean', 'object', 'array', 'date']);

export function parseContractSchema(value: unknown): Record<string, string> {
  const schema = typeof value === 'string' ? JSON.parse(value) : value;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('transform.contract: schemaJson must be a JSON object');
  for (const [field, raw] of Object.entries(schema)) {
    const type = String(raw), base = type.endsWith('?') ? type.slice(0, -1) : type;
    if (!field || !CONTRACT_TYPES.has(base as ContractType)) throw new Error(`transform.contract: invalid type for "${field}"`);
  }
  return schema as Record<string, string>;
}

export function applyDataContract(
  rows: Record<string, any>[], schemaValue: unknown,
  onViolation: 'fail' | 'drop' | 'quarantine' = 'fail', allowExtra = true,
): Record<string, any>[] {
  const result = evaluateDataContract(rows, schemaValue, allowExtra);
  if (result.rejected.length && onViolation === 'fail') {
    const first = result.rejected[0];
    throw new Error(`transform.contract: row ${first.rowIndex + 1}: ${first.errors.join('; ')}`);
  }
  return result.valid;
}

export interface ContractEvaluation {
  valid: Record<string, any>[];
  rejected: Array<{ rowIndex: number; record: Record<string, any>; errors: string[] }>;
}

export function evaluateDataContract(
  rows: Record<string, any>[], schemaValue: unknown, allowExtra = true,
): ContractEvaluation {
  const schema = parseContractSchema(schemaValue);
  const valid: Record<string, any>[] = [];
  const rejected: ContractEvaluation['rejected'] = [];
  rows.forEach((row, index) => {
    const errors: string[] = [];
    for (const [field, spec] of Object.entries(schema)) {
      const optional = spec.endsWith('?'), type = (optional ? spec.slice(0, -1) : spec) as ContractType;
      const value = row[field];
      if (value == null) { if (!optional) errors.push(`${field} is required`); continue; }
      const matches = type === 'any'
        || (type === 'array' ? Array.isArray(value)
          : type === 'object' ? typeof value === 'object' && !Array.isArray(value)
          : type === 'date' ? !Number.isNaN(Date.parse(String(value)))
          : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
          : typeof value === type);
      if (!matches) errors.push(`${field} must be ${type}`);
    }
    if (!allowExtra) {
      const extras = Object.keys(row).filter(field => !(field in schema));
      if (extras.length) errors.push(`extra fields: ${extras.join(', ')}`);
    }
    if (!errors.length) valid.push(row);
    else rejected.push({ rowIndex: index, record: row, errors });
  });
  return { valid, rejected };
}

// Compound-key dedupe: keys may be an array or comma-separated string. keep=first
// is the old behavior; keep=last retains the latest record per key (order stays
// first-seen). ponytail: in-memory per run only — cross-run dedupe needs a durable
// content-hash store, deferred per roadmap A5.
export function dedupeRecords(
  rows: any[], key: string | string[], keep: 'first' | 'last' = 'first',
): any[] {
  const keys = (Array.isArray(key) ? key : String(key ?? '').split(','))
    .map(k => k.trim()).filter(Boolean);
  if (!keys.length) return rows;
  const hash = (r: any) => keys.map(k => JSON.stringify(r[k])).join('\0');
  const byKey = new Map<string, any>();
  for (const r of rows) {
    const k = hash(r);
    if (keep === 'last' || !byKey.has(k)) byKey.set(k, r);
  }
  return [...byKey.values()];
}

export function dedupeKeyHash(record: any, key: string | string[]): string {
  const keys = (Array.isArray(key) ? key : String(key ?? '').split(',')).map(k => k.trim()).filter(Boolean);
  return crypto.createHash('sha256').update(JSON.stringify(keys.map(k => record[k]))).digest('hex');
}

// Build a multi-row INSERT … ON CONFLICT upsert. Pure + exported for the unit
// check. Identifiers are double-quoted (quotes stripped); values are bound as
// $1..$N in row-major order, so the caller passes records.flatMap(cols).
export function buildPgUpsert(table: string, cols: string[], conflict: string[], rowCount: number): string {
  const tableSql = table.split('.').map(pgIdent).join('.');
  const quoted = cols.map(pgIdent);
  const tuples = Array.from({ length: rowCount }, (_, r) =>
    `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(',')})`).join(',');
  let sql = `INSERT INTO ${tableSql} (${quoted.join(',')}) VALUES ${tuples}`;
  if (conflict.length) {
    const cq = conflict.map(pgIdent);
    const upd = quoted.filter(c => !cq.includes(c)).map(c => `${c}=EXCLUDED.${c}`);
    sql += ` ON CONFLICT (${cq.join(',')}) DO ${upd.length ? `UPDATE SET ${upd.join(',')}` : 'NOTHING'}`;
  }
  return sql;
}

export function buildPgDelete(table: string, keys: string[], rowCount: number): string {
  const tableSql = table.split('.').map(pgIdent).join('.');
  const predicates = Array.from({ length: rowCount }, (_, row) =>
    `(${keys.map((key, col) => `${pgIdent(key)}=$${row * keys.length + col + 1}`).join(' AND ')})`);
  return `DELETE FROM ${tableSql} WHERE ${predicates.join(' OR ')}`;
}

const pgIdent = (value: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error(`invalid PostgreSQL identifier "${value}"`);
  return `"${value}"`;
};

export function buildPgSourceQuery(
  table: string, columns: string, cursorColumn: string, cursorValue: unknown, pageSize: number,
  rangeStart?: unknown, rangeEnd?: unknown,
): { sql: string; params: unknown[] } {
  const tableSql = table.split('.').map(pgIdent).join('.');
  const requested = columns.trim() === '*' ? ['*'] : columns.split(',').map(s => s.trim()).filter(Boolean);
  if (!requested.length) throw new Error('postgres.fetch: at least one column is required');
  if (requested[0] !== '*' && !requested.includes(cursorColumn)) requested.push(cursorColumn);
  const columnSql = requested[0] === '*' ? '*' : requested.map(pgIdent).join(',');
  const cursorSql = pgIdent(cursorColumn);
  const limit = Math.min(Math.max(Math.trunc(pageSize) || 1000, 1), 10_000) + 1;
  const params: unknown[] = [];
  const predicates: string[] = [];
  if (cursorValue != null) predicates.push(`${cursorSql} > $${params.push(cursorValue)}`);
  else if (rangeStart != null) predicates.push(`${cursorSql} >= $${params.push(rangeStart)}`);
  if (rangeEnd != null) predicates.push(`${cursorSql} < $${params.push(rangeEnd)}`);
  const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
  params.push(limit);
  return { sql: `SELECT ${columnSql} FROM ${tableSql}${where} ORDER BY ${cursorSql} ASC LIMIT $${params.length}`, params };
}

export function safeClickHouseTable(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(value)) {
    throw new Error('sink.clickhouse: table must be table or database.table');
  }
  return value;
}

async function postgresFetch({ config, cursor, ingestion, tenantId }: Parameters<SourceFn>[0]) {
  const connectionId = String(config.connectionId ?? '');
  const table = String(config.table ?? '');
  const cursorColumn = String(config.cursorColumn ?? '');
  if (!connectionId) throw new Error('postgres.fetch: connectionId required');
  if (!table) throw new Error('postgres.fetch: table required');
  if (config.syncMode === 'cdc') {
    return fetchDebeziumBatch(config, cursor, Math.min(Math.max(Number(ingestion?.pageSize ?? config.pageSize ?? 1000) || 1000, 1), 10_000), tenantId, table, 'postgres');
  }
  if (!cursorColumn) throw new Error('postgres.fetch: cursorColumn required for incremental ingestion');
  const pageSize = Number(ingestion?.pageSize ?? config.pageSize ?? 1000);
  const backfill = ingestion?.mode === 'backfill';
  const query = buildPgSourceQuery(table, String(config.columns ?? '*'), cursorColumn, cursor.value, pageSize,
    backfill ? ingestion.backfillStart : undefined, backfill ? ingestion.backfillEnd : undefined);
  const client = await connectPostgres(connectionId, tenantId);
  try {
    const { rows } = await client.query(query.sql, query.params);
    const records = rows.slice(0, Math.min(Math.max(Math.trunc(pageSize) || 1000, 1), 10_000));
    const last = records.at(-1)?.[cursorColumn];
    return {
      records,
      nextCursor: last == null ? cursor : { value: last },
      hasMore: rows.length > records.length,
    };
  } finally { await client.end(); }
}

const codedHandlers: Record<string, Handler> = {
  // ─── transforms ───
  'transform.map': async (input, config) =>
    (input as any[]).map(r => evaluateMapExpression(config.expression as string, r)),

  'transform.filter': async (input, config) =>
    (input as any[]).filter(r => evaluatePredicate(config.predicate as string, { r })),

  'transform.formula': async (input, config) =>
    (input as any[]).map(r => ({ ...r, [String(config.outputField)]: evaluateFormulaExpression(String(config.expression), r) })),

  'transform.select': async (input, config) =>
    (input as any[]).map(r => jmespath.search(r, String(config.expression))),

  'transform.rename': async (input, config) => {
    const mapping = (typeof config.mapping === 'string' ? JSON.parse(config.mapping) : config.mapping) as Record<string, string>;
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('transform.rename: mapping must be a JSON object');
    return (input as any[]).map(r => {
      const out: any = {};
      for (const [from, to] of Object.entries(mapping)) out[to] = r[from];
      return { ...r, ...out };
    });
  },

  'transform.dedupe': async (input, config) => dedupeRecords(
    input as any[], config.key as any, config.keep === 'last' ? 'last' : 'first'),

  'transform.flatten': async (input, config) =>
    (input as any[]).map(r => flattenRecord(
      r ?? {},
      (config.delimiter as string) || '.',
      Number(config.maxDepth) || 10,
      (config.arrayPolicy as ArrayPolicy) || 'index',
    )),

  'transform.parse': async (input, config) => {
    const fields = Array.isArray(config.fields)
      ? (config.fields as string[])
      : String(config.fields ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const onError = (config.onError as 'skip' | 'fail' | 'null') || 'skip';
    return (input as any[]).map(r => parseRecordFields(r, fields, onError));
  },

  'transform.contract': async (input, config) => applyDataContract(
    input as Record<string, any>[], config.schemaJson,
    config.onViolation === 'drop' || config.onViolation === 'quarantine' ? config.onViolation : 'fail',
    config.allowExtra !== false,
  ),

  // ─── sinks (A6: destinations are connectors — bring-your-own) ───
  // DataFlow managed store (ClickHouse) — optional built-in destination that
  // powers Analytics. BYO destinations below are the default IPaaS path.
  'sink.records': async (input, config, ctx) => {
    const collection = config.collection as string;
    const dedupField = config.dedupField as string | undefined;
    await writeRecords(ctx.tenantId, collection, input as any[], dedupField);
    return null;
  },

  'sink.sftp': sftpSink,
  'sink.snowflake': snowflakeSink,

  // BYO Postgres destination — upsert into the user's table via a credential
  // instance (config.connectionId). config.table + optional config.conflictKey
  // (comma-separated) drive an ON CONFLICT upsert.
  'sink.postgres': async (input, config, ctx) => {
    let records = input as any[];
    if (!config.connectionId) throw new Error('sink.postgres: destination instance (connectionId) required');
    const table = String(config.table ?? '');
    if (!table) throw new Error('sink.postgres: a valid table name is required');
    table.split('.').forEach(pgIdent);
    if (!records.length) return null;
    const conflict = String(config.conflictKey ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const applyCdc = config.writeMode === 'apply-cdc';
    const cdc = applyCdc ? collapseCdcEvents(records as CdcEvent[], conflict) : undefined;
    if (cdc) records = cdc.upserts;
    if (!records.length && !cdc?.deletes.length) return null;
    const cols = [...new Set(records.flatMap(r => Object.keys(r)))];
    const missing = records.length ? conflict.filter(k => !cols.includes(k)) : [];
    if (missing.length) throw new Error(`sink.postgres: conflictKey column(s) not present in records: ${missing.join(', ')}`);
    const client = await connectPostgres(config.connectionId as string, ctx.tenantId);
    try {
      if (applyCdc) await client.query('BEGIN');
      if (cdc?.deletes.length) {
        const chunk = Math.max(1, Math.floor(60000 / conflict.length));
        for (let i = 0; i < cdc.deletes.length; i += chunk) {
          const batch = cdc.deletes.slice(i, i + chunk);
          await client.query(buildPgDelete(table, conflict, batch.length), batch.flatMap(r => conflict.map(key => r[key])));
        }
      }
      // Batch into multi-row inserts; cap rows/batch so params stay under
      // Postgres' 65535 bind-parameter limit.
      const chunk = Math.max(1, Math.floor(60000 / cols.length));
      for (let i = 0; i < records.length; i += chunk) {
        const batch = records.slice(i, i + chunk);
        const sql = buildPgUpsert(table, cols, conflict, batch.length);
        const vals = batch.flatMap(r => cols.map(c => r[c] ?? null));
        await client.query(sql, vals);
      }
      if (applyCdc) await client.query('COMMIT');
    } catch (error) {
      if (applyCdc) await client.query('ROLLBACK');
      throw error;
    } finally { await client.end(); }
    return null;
  },

  'sink.clickhouse': async (input, config, ctx) => {
    const records = input as any[];
    if (!config.connectionId) throw new Error('sink.clickhouse: connectionId required');
    const table = safeClickHouseTable(String(config.table ?? ''));
    if (!records.length) return null;
    const client = await connectClickHouse(config.connectionId as string, ctx.tenantId);
    try {
      await client.insert({ table, values: records, format: 'JSONEachRow' });
    } finally { await client.close(); }
    return null;
  },

  'sink.mysql': mysqlSink,
  'sink.mongodb': mongodbSink,
  'sink.s3': s3Sink,
  'sink.kafka': kafkaSink,

  // BYO Google Sheets destination — append record rows via an OAuth instance.
  'sink.gsheets': async (input, config, ctx) => {
    const records = input as any[];
    if (!config.connectionId) throw new Error('sink.gsheets: destination instance (connectionId) required');
    if (!config.spreadsheetId) throw new Error('sink.gsheets: spreadsheetId required');
    if (!records.length) return null;
    const { getOAuthConnection } = await import('./connectors/oauth-client');
    const { google } = await import('googleapis');
    const conn = await getOAuthConnection(config.connectionId as string, ctx.tenantId);
    const oauth = new google.auth.OAuth2();
    oauth.setCredentials({ access_token: conn.accessToken });
    const sheets = google.sheets({ version: 'v4', auth: oauth });
    const cols = [...new Set(records.flatMap(r => Object.keys(r)))];
    const values = records.map(r => cols.map(c => {
      const v = r[c]; return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v;
    }));
    const spreadsheetId = config.spreadsheetId as string;
    const range = (config.sheetName as string) || 'Sheet1';
    // 'replace' (default): clear the sheet then write once — idempotent across
    // re-runs. 'append': add rows without a header (header on append would
    // duplicate the row every run).
    if ((config.writeMode ?? 'replace') === 'replace') {
      await sheets.spreadsheets.values.clear({ spreadsheetId, range });
      await sheets.spreadsheets.values.update({
        spreadsheetId, range, valueInputOption: 'RAW',
        requestBody: { values: config.includeHeader ? [cols, ...values] : values },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId, range, valueInputOption: 'RAW',
        requestBody: { values },
      });
    }
    return null;
  },

  'sink.webhook': async (input, config, ctx) => {
    const instance = config.connectionId
      ? await loadCredentialInstance(String(config.connectionId), ctx.tenantId)
      : undefined;
    const { url, secret } = resolveWebhookSettings(config, instance);
    if (!url) throw new Error('sink.webhook: URL or HTTP connector instance required');
    const body = JSON.stringify({ records: input });
    const sig = secret
      ? crypto.createHmac('sha256', secret).update(body).digest('hex')
      : undefined;
    await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json',
                 ...(sig ? { 'X-Signature-SHA256': sig } : {}) },
      timeout: 15_000,
    });
    return null;
  },
};
export const handlers: Record<string, Handler> = { ...codedHandlers, ...registry.getHandlers() };
