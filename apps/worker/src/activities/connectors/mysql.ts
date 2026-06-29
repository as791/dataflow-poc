import type { Handler, SourceFn } from '@dataflow/connector-sdk';
import { loadCredentialInstance } from './credentials';
import { fetchDebeziumBatch } from './debezium';
import { collapseCdcEvents } from './debezium';
import type { CdcEvent } from '@dataflow/shared';

const ident = (value: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error(`invalid MySQL identifier "${value}"`);
  return `\`${value}\``;
};

const tableName = (value: string) => value.split('.').map(ident).join('.');

async function connect(connectionId: string, tenantId: string) {
  const inst = await loadCredentialInstance(connectionId, tenantId);
  if (inst.provider !== 'mysql') throw new Error(`connector ${connectionId} is not MySQL`);
  const mysql = await import('mysql2/promise');
  const sslMode = String(inst.extra.sslMode ?? 'disable');
  return mysql.createConnection({
    host: inst.extra.host, port: inst.extra.port ?? 3306,
    database: inst.extra.database, user: inst.extra.user,
    password: inst.secret.password,
    ssl: sslMode === 'disable' ? undefined : { rejectUnauthorized: sslMode === 'verify-full' },
    connectTimeout: 10_000,
  });
}

export function buildMysqlSourceQuery(
  table: string, columns: string, cursorColumn: string, cursorValue: unknown, pageSize: number,
  rangeStart?: unknown, rangeEnd?: unknown,
) {
  const requested = columns.trim() === '*' ? ['*'] : columns.split(',').map(s => s.trim()).filter(Boolean);
  if (!requested.length) throw new Error('mysql.fetch: at least one column is required');
  if (requested[0] !== '*' && !requested.includes(cursorColumn)) requested.push(cursorColumn);
  const cols = requested[0] === '*' ? '*' : requested.map(ident).join(',');
  const cursor = ident(cursorColumn);
  const limit = Math.min(Math.max(Math.trunc(pageSize) || 1000, 1), 10_000) + 1;
  const params: unknown[] = [];
  const predicates: string[] = [];
  if (cursorValue != null) { predicates.push(`${cursor} > ?`); params.push(cursorValue); }
  else if (rangeStart != null) { predicates.push(`${cursor} >= ?`); params.push(rangeStart); }
  if (rangeEnd != null) { predicates.push(`${cursor} < ?`); params.push(rangeEnd); }
  const where = predicates.length ? ` WHERE ${predicates.join(' AND ')}` : '';
  return { sql: `SELECT ${cols} FROM ${tableName(table)}${where} ORDER BY ${cursor} ASC LIMIT ?`, params: [...params, limit] };
}

export const mysqlFetch: SourceFn = async ({ config, cursor, ingestion, tenantId }) => {
  const connectionId = String(config.connectionId ?? '');
  const table = String(config.table ?? '');
  const cursorColumn = String(config.cursorColumn ?? '');
  const pageSize = Math.min(Math.max(Number(ingestion?.pageSize ?? config.pageSize ?? 1000) || 1000, 1), 10_000);
  if (!connectionId) throw new Error('mysql.fetch: connectionId required');
  if (!table) throw new Error('mysql.fetch: table required');
  if (config.syncMode === 'cdc') return fetchDebeziumBatch(config, cursor, pageSize, tenantId, table, 'mysql');
  if (!cursorColumn) throw new Error('mysql.fetch: cursorColumn is required');
  const backfill = ingestion?.mode === 'backfill';
  const query = buildMysqlSourceQuery(table, String(config.columns ?? '*'), cursorColumn, cursor.value, pageSize,
    backfill ? ingestion.backfillStart : undefined, backfill ? ingestion.backfillEnd : undefined);
  const client = await connect(connectionId, tenantId);
  try {
    const [result] = await client.query(query.sql, query.params);
    const rows = result as any[];
    const records = rows.slice(0, pageSize);
    const last = records.at(-1)?.[cursorColumn];
    return { records, nextCursor: last == null ? cursor : { value: last }, hasMore: rows.length > records.length };
  } finally { await client.end(); }
};

export function buildMysqlUpsert(table: string, columns: string[], rowCount: number) {
  const cols = columns.map(ident);
  const rows = Array.from({ length: rowCount }, () => `(${columns.map(() => '?').join(',')})`).join(',');
  const updates = cols.map(c => `${c}=VALUES(${c})`).join(',');
  return `INSERT INTO ${tableName(table)} (${cols.join(',')}) VALUES ${rows} ON DUPLICATE KEY UPDATE ${updates}`;
}

export function buildMysqlDelete(table: string, keys: string[], rowCount: number) {
  const predicates = Array.from({ length: rowCount }, () => `(${keys.map(key => `${ident(key)}=?`).join(' AND ')})`);
  return `DELETE FROM ${tableName(table)} WHERE ${predicates.join(' OR ')}`;
}

export const mysqlSink: Handler = async (input, config, ctx) => {
  let records = input as any[];
  const connectionId = String(config.connectionId ?? '');
  const table = String(config.table ?? '');
  if (!connectionId || !table) throw new Error('sink.mysql: connectionId and table are required');
  if (!records.length) return null;
  const applyCdc = config.writeMode === 'apply-cdc';
  const primaryKey = String(config.primaryKey ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const cdc = applyCdc ? collapseCdcEvents(records as CdcEvent[], primaryKey) : undefined;
  if (cdc) records = cdc.upserts;
  if (!records.length && !cdc?.deletes.length) return null;
  const columns = [...new Set(records.flatMap(r => Object.keys(r)))];
  const client = await connect(connectionId, ctx.tenantId);
  try {
    if (applyCdc) await client.beginTransaction();
    if (cdc?.deletes.length) {
      for (let i = 0; i < cdc.deletes.length; i += 500) {
        const batch = cdc.deletes.slice(i, i + 500);
        await client.query(buildMysqlDelete(table, primaryKey, batch.length), batch.flatMap(r => primaryKey.map(key => r[key])));
      }
    }
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500);
      await client.query(buildMysqlUpsert(table, columns, batch.length), batch.flatMap(r => columns.map(c => r[c] ?? null)));
    }
    if (applyCdc) await client.commit();
  } catch (error) {
    if (applyCdc) await client.rollback();
    throw error;
  } finally { await client.end(); }
  return null;
};
