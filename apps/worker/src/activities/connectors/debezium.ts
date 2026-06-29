import { randomUUID } from 'node:crypto';
import type { CdcEvent } from '@dataflow/shared';
import type { SourceFetchResult } from '@dataflow/connector-sdk';
import { Kafka, logLevel } from 'kafkajs';
import { loadCredentialInstance } from './credentials';

type OffsetMap = Record<string, string>;

const parseJson = (value: Buffer | null): any => {
  if (!value) return null;
  const parsed = JSON.parse(value.toString('utf8'));
  return parsed?.payload ?? parsed;
};

const parseDocument = (value: unknown): Record<string, unknown> | null => {
  if (value == null) return null;
  return typeof value === 'string' ? JSON.parse(value) : value as Record<string, unknown>;
};

const parseValue = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
};

export function normalizeDebeziumMessage(input: {
  topic: string; partition: number; offset: string;
  key: Buffer | null; value: Buffer | null;
}): CdcEvent | null {
  const payload = parseJson(input.value);
  if (!payload) return null; // Debezium tombstone
  const source = payload.source ?? {};
  const provider = source.connector === 'postgresql' ? 'postgres' : source.connector;
  if (!['postgres', 'mysql', 'mongodb'].includes(provider)) {
    throw new Error(`unsupported Debezium connector "${source.connector ?? ''}"`);
  }
  const op = ({ c: 'create', u: 'update', d: 'delete', r: 'snapshot' } as const)[payload.op as 'c' | 'u' | 'd' | 'r'];
  if (!op) throw new Error(`unsupported Debezium operation "${payload.op ?? ''}"`);
  const timestamp = Number(payload.ts_ms ?? source.ts_ms ?? 0);
  const rawKey = parseJson(input.key) ?? {};
  const key = provider === 'mongodb' && rawKey.id !== undefined
    ? { _id: parseValue(rawKey.id) }
    : rawKey;
  return {
    op,
    key,
    before: parseDocument(payload.before),
    after: parseDocument(payload.after),
    occurredAt: new Date(timestamp).toISOString(),
    source: {
      provider: provider as CdcEvent['source']['provider'],
      database: String(source.db ?? source.database ?? ''),
      ...(source.schema ? { schema: String(source.schema) } : {}),
      table: String(source.table ?? source.collection ?? ''),
      topic: input.topic,
      partition: input.partition,
      offset: input.offset,
    },
  };
}

export function collapseCdcEvents(events: CdcEvent[], keys: string[]) {
  if (!keys.length) throw new Error('apply-cdc requires a primary key');
  const latest = new Map<string, CdcEvent>();
  for (const event of events) {
    const row = event.after ?? event.before ?? event.key;
    const values = keys.map(key => row?.[key] ?? event.key?.[key]);
    if (values.some(value => value == null)) throw new Error(`CDC event is missing primary key: ${keys.join(', ')}`);
    latest.set(JSON.stringify(values), event);
  }
  const upserts: Record<string, unknown>[] = [];
  const deletes: Record<string, unknown>[] = [];
  for (const event of latest.values()) {
    if (event.op === 'delete') deletes.push(Object.fromEntries(keys.map(key => [key, event.key[key] ?? event.before?.[key]])));
    else if (event.after) upserts.push(event.after);
  }
  return { upserts, deletes };
}

export function deriveCdcTopic(cdc: Record<string, any> | undefined, resource: string): string {
  if (!cdc?.enabled || !cdc.topicPrefix) throw new Error('CDC is not enabled for this connector');
  const matches = (Array.isArray(cdc.resources) ? cdc.resources : [])
    .map(String).filter(item => item === resource || item.endsWith(`.${resource}`));
  if (matches.length !== 1) throw new Error(`CDC resource "${resource}" is not uniquely allowlisted`);
  return `${cdc.topicPrefix}.${matches[0]}`;
}

export async function fetchDebeziumBatch(
  config: Record<string, unknown>, cursor: Record<string, any>, pageSize: number,
  tenantId: string, resource: string, provider: CdcEvent['source']['provider'],
): Promise<SourceFetchResult> {
  const instance = await loadCredentialInstance(String(config.connectionId ?? ''), tenantId);
  if (instance.provider !== provider) throw new Error(`connector ${config.connectionId} is not ${provider}`);
  const topic = deriveCdcTopic(instance.extra.cdc, resource);
  const brokers = String(process.env.KAFKA_BROKERS ?? 'redpanda:9092').split(',').map(s => s.trim()).filter(Boolean);
  const kafka = new Kafka({ clientId: 'dataflow-cdc', brokers, logLevel: logLevel.NOTHING });
  const admin = kafka.admin();
  await admin.connect();
  const bounds = await admin.fetchTopicOffsets(topic);
  await admin.disconnect();

  const prior: OffsetMap = cursor.topic === topic ? (cursor.offsets ?? {}) : {};
  const targets = Object.fromEntries(bounds.map(p => [String(p.partition), p.offset]));
  const next: OffsetMap = Object.fromEntries(bounds.map(p => {
    const saved = BigInt(prior[String(p.partition)] ?? p.low);
    const low = BigInt(p.low), high = BigInt(p.offset);
    return [String(p.partition), (saved < low ? low : saved > high ? high : saved).toString()];
  }));
  if (bounds.every(p => BigInt(next[String(p.partition)] ?? p.low) >= BigInt(p.offset))) {
    return { records: [], nextCursor: { mode: 'cdc', topic, offsets: next }, hasMore: false };
  }

  const consumer = kafka.consumer({ groupId: `dataflow-cdc-${randomUUID()}` });
  const records: CdcEvent[] = [];
  let processed = 0;
  const sought = new Set<number>();
  let stopped = false;
  let finish!: () => void, crash: Error | undefined;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try { await consumer.stop(); } finally { finish(); }
  };
  consumer.on(consumer.events.CRASH, event => { crash = event.payload.error; finish(); });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  const idleMs = Math.min(Math.max(Number(config.cdcPollMs) || 15_000, 1000), 60_000);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => { void stop().catch(() => {}); }, idleMs);
  };
  resetIdle();
  try {
    await consumer.run({
      autoCommit: false,
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch }) => {
        resetIdle();
        const key = String(batch.partition);
        if (!sought.has(batch.partition) && next[key] !== batch.firstOffset()) {
          sought.add(batch.partition);
          consumer.seek({ topic, partition: batch.partition, offset: next[key] });
          return;
        }
        sought.add(batch.partition);
        for (const message of batch.messages) {
          if (BigInt(message.offset) >= BigInt(targets[key])) break;
          const event = normalizeDebeziumMessage({
            topic, partition: batch.partition, offset: message.offset,
            key: message.key, value: message.value,
          });
          processed++;
          next[key] = (BigInt(message.offset) + 1n).toString();
          if (event) records.push(event);
          if (processed >= pageSize) break;
        }
        const caughtUp = bounds.every(p => BigInt(next[String(p.partition)] ?? p.low) >= BigInt(p.offset));
        if (processed >= pageSize || caughtUp) void stop().catch(() => {});
      },
    });
    await done;
    if (crash) throw crash;
  } finally {
    clearTimeout(idle);
    await consumer.disconnect();
  }
  // One bounded micro-batch per pipeline execution; the next run resumes here.
  return { records, nextCursor: { mode: 'cdc', topic, offsets: next }, hasMore: false };
}
