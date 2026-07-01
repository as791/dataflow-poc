import snowflake from 'snowflake-sdk';
import type { Handler, SourceFn } from '@dataflow/connector-sdk';
import { loadCredentialInstance } from './credentials';

const ident = (value: string) => {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) throw new Error(`invalid Snowflake identifier "${value}"`);
  return `"${value}"`;
};
const objectName = (value: string) => value.split('.').map(ident).join('.');

async function connect(connectionId: string, tenantId: string) {
  const instance = await loadCredentialInstance(connectionId, tenantId);
  if (instance.provider !== 'snowflake') throw new Error(`connector ${connectionId} is not Snowflake`);
  const connection = snowflake.createConnection({
    account: instance.extra.account, username: instance.extra.user, password: instance.secret.password,
    warehouse: instance.extra.warehouse, database: instance.extra.database, schema: instance.extra.schema,
  });
  await new Promise<void>((resolve, reject) => connection.connect(error => error ? reject(error) : resolve()));
  return connection;
}

export function execute(connection: snowflake.Connection, sqlText: string, binds: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => connection.execute({
    sqlText, binds, complete: (error, _statement, rows) => error ? reject(error) : resolve(rows ?? []),
  }));
}

export const snowflakeFetch: SourceFn = async ({ config, cursor, ingestion, tenantId }) => {
  const connectionId = String(config.connectionId ?? ''), table = objectName(String(config.table ?? ''));
  const pageSize = Math.min(Math.max(Number(ingestion?.pageSize ?? config.pageSize ?? 1000) || 1000, 1), 10_000);
  const mode = String(config.syncMode ?? 'cursor');
  const connection = await connect(connectionId, tenantId);
  try {
    if (mode === 'changes') {
      const since = String(cursor.value ?? new Date(Date.now() - 5 * 60_000).toISOString());
      const until = String(cursor.until ?? new Date().toISOString()), offset = Number(cursor.offset ?? 0);
      const rows = await execute(connection,
        `SELECT * FROM ${table} CHANGES (INFORMATION => DEFAULT) AT (TIMESTAMP => TO_TIMESTAMP_TZ(?)) END (TIMESTAMP => TO_TIMESTAMP_TZ(?)) LIMIT ? OFFSET ?`,
        [since, until, pageSize + 1, offset]);
      const records = rows.slice(0, pageSize), hasMore = rows.length > pageSize;
      return { records, hasMore, nextCursor: hasMore ? { value: since, until, offset: offset + records.length } : { value: until } };
    }
    const cursorColumn = ident(String(config.cursorColumn ?? ''));
    const rows = await execute(connection,
      `SELECT * FROM ${table}${cursor.value == null ? '' : ` WHERE ${cursorColumn} > ?`} ORDER BY ${cursorColumn} LIMIT ?`,
      cursor.value == null ? [pageSize + 1] : [cursor.value, pageSize + 1]);
    const records = rows.slice(0, pageSize);
    const last = records.at(-1)?.[String(config.cursorColumn).toUpperCase()] ?? records.at(-1)?.[String(config.cursorColumn)];
    return { records, hasMore: rows.length > pageSize, nextCursor: last == null ? cursor : { value: last } };
  } finally { connection.destroy(() => {}); }
};

export const snowflakeSink: Handler = async (input, config, ctx) => {
  const records = input as Record<string, any>[];
  if (!records.length) return null;
  const connection = await connect(String(config.connectionId ?? ''), ctx.tenantId);
  try {
    const table = objectName(String(config.table ?? ''));
    const columns = [...new Set(records.flatMap(record => Object.keys(record)))];
    const batchSize = 500;
    for (let start = 0; start < records.length; start += batchSize) {
      const batch = records.slice(start, start + batchSize);
      const values = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      await execute(connection, `INSERT INTO ${table} (${columns.map(ident).join(',')}) VALUES ${values}`,
        batch.flatMap(record => columns.map(column => record[column] ?? null)));
    }
  } finally { connection.destroy(() => {}); }
  return null;
};
