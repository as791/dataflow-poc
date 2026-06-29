import { randomUUID } from 'node:crypto';
import { Kafka, logLevel, type KafkaConfig } from 'kafkajs';
import type { Handler, HandlerCtx, SourceFetchParams, SourceFn, SourceFetchResult } from '@dataflow/connector-sdk';
import { loadCredentialInstance, type CredentialInstance } from './credentials';

type OffsetMap = Record<string, string>;

export function validKafkaTopic(topic: string): string {
  if (!/^[A-Za-z0-9._-]{1,249}$/.test(topic) || topic === '.' || topic === '..') {
    throw new Error('Kafka topic must be 1-249 letters, numbers, dots, underscores, or hyphens');
  }
  return topic;
}

function clientConfig(instance: CredentialInstance, fallbackClientId: string): KafkaConfig {
  const brokers = String(instance.extra.brokers ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!brokers.length) throw new Error('Kafka credential has no brokers');
  const mechanism = String(instance.extra.saslMechanism ?? 'none');
  const sasl = mechanism === 'none' ? undefined : {
    mechanism,
    username: String(instance.secret.username ?? ''),
    password: String(instance.secret.password ?? ''),
  } as KafkaConfig['sasl'];
  return {
    clientId: String(instance.extra.clientId ?? fallbackClientId), brokers,
    ssl: instance.extra.tls === true, sasl,
    logLevel: process.env.KAFKA_DEBUG === 'full' ? logLevel.DEBUG : logLevel.NOTHING,
    connectionTimeout: 10_000, requestTimeout: 30_000,
  };
}

export function decodeKafkaRecord(input: {
  topic: string; partition: number; offset: string; key: Buffer | null; value: Buffer | null;
  timestamp: string; headers?: Record<string, Buffer | string | (Buffer | string)[] | undefined>;
}, format = 'json', includeMetadata = true): Record<string, unknown> {
  const text = input.value?.toString('utf8') ?? '';
  let parsed: unknown = text;
  if (format === 'json') {
    try { parsed = text ? JSON.parse(text) : null; }
    catch { throw new Error(`kafka.fetch: invalid JSON at ${input.topic}[${input.partition}] offset ${input.offset}`); }
  }
  const record: Record<string, unknown> = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? { ...(parsed as Record<string, unknown>) } : { value: parsed };
  if (includeMetadata) record._kafka = {
    topic: input.topic, partition: input.partition, offset: input.offset,
    key: input.key?.toString('utf8') ?? null, timestamp: input.timestamp,
    headers: Object.fromEntries(Object.entries(input.headers ?? {}).map(([key, value]) => [key,
      Array.isArray(value) ? value.map(item => item.toString()) : value?.toString() ?? null])),
  };
  return record;
}

export async function fetchKafkaBatch(
  { config, cursor, ingestion }: SourceFetchParams, instance: CredentialInstance,
): Promise<SourceFetchResult> {
  const topic = validKafkaTopic(String(config.topic ?? ''));
  if (instance.provider !== 'kafka') throw new Error('Kafka credential required');
  const kafka = new Kafka(clientConfig(instance, 'dataflow-source'));
  const admin = kafka.admin();
  await admin.connect();
  let bounds;
  try { bounds = await admin.fetchTopicOffsets(topic); }
  finally { await admin.disconnect(); }

  const prior: OffsetMap = cursor.topic === topic ? (cursor.offsets ?? {}) : {};
  const targets = Object.fromEntries(bounds.map(item => [String(item.partition), item.offset]));
  const next: OffsetMap = Object.fromEntries(bounds.map(item => {
    const initial = config.startPosition === 'latest' ? item.offset : item.low;
    const saved = BigInt(prior[String(item.partition)] ?? initial);
    const low = BigInt(item.low), high = BigInt(item.offset);
    return [String(item.partition), (saved < low ? low : saved > high ? high : saved).toString()];
  }));
  const caughtUp = () => bounds.every(item => BigInt(next[String(item.partition)] ?? item.low) >= BigInt(item.offset));
  if (caughtUp()) return { records: [], nextCursor: { topic, offsets: next }, hasMore: false };

  const pageSize = Math.min(Math.max(Number(ingestion?.pageSize ?? config.pageSize ?? 1000) || 1000, 1), 10_000);
  const records: Record<string, unknown>[] = [];
  const consumer = kafka.consumer({ groupId: `dataflow-${randomUUID()}` });
  const sought = new Set<number>();
  let processed = 0, stopped = false;
  let finish!: () => void, crash: Error | undefined;
  const done = new Promise<void>(resolve => { finish = resolve; });
  const stop = async (reason: string) => {
    if (stopped) return;
    stopped = true;
    if (process.env.KAFKA_DEBUG) console.error(`kafka.fetch stopping: ${reason}`);
    try { await consumer.stop(); } finally { finish(); }
  };
  consumer.on(consumer.events.CRASH, event => { crash = event.payload.error; finish(); });
  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: true });
  const idleMs = Math.min(Math.max(Number(config.pollMs) || 15_000, 1000), 60_000);
  let idle: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    clearTimeout(idle);
    idle = setTimeout(() => { void stop('idle').catch(() => {}); }, idleMs);
  };
  resetIdle();
  try {
    await consumer.run({
      autoCommit: false, eachBatchAutoResolve: false,
      eachBatch: async ({ batch }) => {
        resetIdle();
        const partition = String(batch.partition);
        if (!sought.has(batch.partition) && next[partition] !== batch.firstOffset()) {
          sought.add(batch.partition);
          consumer.seek({ topic, partition: batch.partition, offset: next[partition] });
          return;
        }
        sought.add(batch.partition);
        for (const message of batch.messages) {
          if (BigInt(message.offset) >= BigInt(targets[partition])) break;
          records.push(decodeKafkaRecord({
            topic, partition: batch.partition, offset: message.offset,
            key: message.key, value: message.value, timestamp: message.timestamp, headers: message.headers,
          }, String(config.valueFormat ?? 'json'), config.includeMetadata !== false));
          processed++;
          next[partition] = (BigInt(message.offset) + 1n).toString();
          if (processed >= pageSize) break;
        }
        if (processed >= pageSize || caughtUp()) void stop(processed >= pageSize ? 'page-full' : 'caught-up').catch(() => {});
      },
    });
    await done;
    if (crash) throw crash;
  } finally {
    clearTimeout(idle);
    await consumer.disconnect();
  }
  if (!processed && !caughtUp()) throw new Error('kafka.fetch: timed out before available messages were read');
  return { records, nextCursor: { topic, offsets: next }, hasMore: !caughtUp() };
}

export const kafkaFetch: SourceFn = async params => {
  const connectionId = String(params.config.connectionId ?? '');
  if (!connectionId) throw new Error('kafka.fetch: connectionId required');
  const instance = await loadCredentialInstance(connectionId, params.tenantId);
  return fetchKafkaBatch(params, instance);
};

export async function publishKafkaRecords(
  input: unknown, config: Record<string, unknown>, ctx: HandlerCtx, instance: CredentialInstance,
) {
  const records = input as unknown[];
  if (!Array.isArray(records)) throw new Error('sink.kafka: input must be an array');
  if (!records.length) return null;
  const topic = validKafkaTopic(String(config.topic ?? ''));
  if (instance.provider !== 'kafka') throw new Error('Kafka credential required');
  const producer = new Kafka(clientConfig(instance, 'dataflow-sink')).producer({ idempotent: true, maxInFlightRequests: 1 });
  const keyField = String(config.keyField ?? '');
  await producer.connect();
  try {
    for (let start = 0; start < records.length; start += 1000) {
      await producer.send({
        topic, acks: -1,
        messages: records.slice(start, start + 1000).map(record => ({
          key: keyField && record && typeof record === 'object'
            ? String((record as Record<string, unknown>)[keyField] ?? '') || null : null,
          value: JSON.stringify(record), headers: { 'dataflow-execution-id': ctx.executionId },
        })),
      });
    }
  } finally { await producer.disconnect(); }
  return null;
}

export const kafkaSink: Handler = async (input, config, ctx) => {
  const connectionId = String(config.connectionId ?? '');
  if (!connectionId) throw new Error('sink.kafka: connectionId required');
  const instance = await loadCredentialInstance(connectionId, ctx.tenantId);
  return publishKafkaRecords(input, config, ctx, instance);
};
