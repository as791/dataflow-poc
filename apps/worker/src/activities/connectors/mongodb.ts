import type { Handler, SourceFn } from '@dataflow/connector-sdk';
import { loadCredentialInstance } from './credentials';
import { fetchDebeziumBatch } from './debezium';
import type { CdcEvent } from '@dataflow/shared';

async function connect(connectionId: string, tenantId: string) {
  const inst = await loadCredentialInstance(connectionId, tenantId);
  if (inst.provider !== 'mongodb') throw new Error(`connector ${connectionId} is not MongoDB`);
  const { MongoClient } = await import('mongodb');
  const scheme = inst.extra.tls ? 'mongodb+srv' : 'mongodb';
  const host = String(inst.extra.host ?? 'localhost');
  const port = inst.extra.tls ? '' : `:${inst.extra.port ?? 27017}`;
  const client = new MongoClient(`${scheme}://${host}${port}`, {
    auth: inst.extra.user ? { username: inst.extra.user, password: inst.secret.password ?? '' } : undefined,
    authSource: inst.extra.authSource ?? 'admin',
    tls: !!inst.extra.tls,
    serverSelectionTimeoutMS: 10_000,
  });
  await client.connect();
  return { client, db: client.db(inst.extra.database) };
}

async function cursorValue(value: unknown, type: string) {
  if (value == null) return undefined;
  if (type === 'number') return Number(value);
  if (type === 'date') return new Date(String(value));
  if (type === 'objectId') {
    const { ObjectId } = await import('mongodb');
    return new ObjectId(String(value));
  }
  return String(value);
}

export function buildMongoCursorFilter(field: string, current: unknown, rangeStart?: unknown, rangeEnd?: unknown) {
  const bounds: Record<string, unknown> = {};
  if (current != null) bounds.$gt = current;
  else if (rangeStart != null) bounds.$gte = rangeStart;
  if (rangeEnd != null) bounds.$lt = rangeEnd;
  return Object.keys(bounds).length ? { [field]: bounds } : {};
}

export const mongodbFetch: SourceFn = async ({ config, cursor, ingestion, tenantId }) => {
  const connectionId = String(config.connectionId ?? '');
  const collectionName = String(config.collection ?? '');
  const cursorField = String(config.cursorField ?? '_id');
  const cursorType = String(config.cursorType ?? 'objectId');
  if (!connectionId) throw new Error('mongodb.fetch: connectionId required');
  if (!collectionName) throw new Error('mongodb.fetch: collection is required');
  const pageSize = Math.min(Math.max(Number(ingestion?.pageSize ?? config.pageSize ?? 1000) || 1000, 1), 10_000);
  if (config.syncMode === 'cdc') return fetchDebeziumBatch(config, cursor, pageSize, tenantId, collectionName, 'mongodb');
  const backfill = ingestion?.mode === 'backfill';
  const current = await cursorValue(cursor.value, cursorType);
  const rangeStart = await cursorValue(backfill ? ingestion.backfillStart : undefined, cursorType);
  const rangeEnd = await cursorValue(backfill ? ingestion.backfillEnd : undefined, cursorType);
  const { client, db } = await connect(connectionId, tenantId);
  try {
    const rows = await db.collection(collectionName)
      .find(buildMongoCursorFilter(cursorField, current, rangeStart, rangeEnd))
      .sort({ [cursorField]: 1 }).limit(pageSize + 1).toArray();
    const records = rows.slice(0, pageSize);
    const last = records.at(-1)?.[cursorField];
    const next = last == null ? cursor : { value: last instanceof Date ? last.toISOString() : String(last) };
    return { records, nextCursor: next, hasMore: rows.length > records.length };
  } finally { await client.close(); }
};

export const mongodbSink: Handler = async (input, config, ctx) => {
  const records = input as any[];
  const connectionId = String(config.connectionId ?? '');
  const collectionName = String(config.collection ?? '');
  const keyField = String(config.keyField ?? '_id');
  if (!connectionId || !collectionName) throw new Error('sink.mongodb: connectionId and collection are required');
  if (!records.length) return null;
  const { client, db } = await connect(connectionId, ctx.tenantId);
  try {
    const collection = db.collection(collectionName);
    if (config.writeMode === 'apply-cdc') {
      const { BSON } = await import('mongodb');
      const bson = (value: Record<string, unknown>) => BSON.EJSON.deserialize(value);
      const operations = (records as CdcEvent[]).map(event => {
        const keyDoc = bson(event.key);
        const before = event.before ? bson(event.before) : null;
        const after = event.after ? bson(event.after) : null;
        const key = keyDoc[keyField] ?? after?.[keyField] ?? before?.[keyField];
        if (key == null) throw new Error(`CDC event is missing primary key: ${keyField}`);
        if (event.op === 'delete') return { deleteOne: { filter: { [keyField]: key } } };
        if (!after) throw new Error(`CDC ${event.op} event is missing after payload`);
        return { replaceOne: { filter: { [keyField]: key }, replacement: after, upsert: true } };
      });
      if (operations.length) await collection.bulkWrite(operations, { ordered: true });
      return null;
    }
    const keyed = records.filter(r => r[keyField] != null);
    const unkeyed = records.filter(r => r[keyField] == null);
    if (keyed.length) await collection.bulkWrite(keyed.map(record => {
      const update = { ...record }; delete update[keyField];
      return { updateOne: { filter: { [keyField]: record[keyField] }, update: { $set: update }, upsert: true } };
    }), { ordered: false });
    if (unkeyed.length) await collection.insertMany(unkeyed, { ordered: false });
  } finally { await client.close(); }
  return null;
};
