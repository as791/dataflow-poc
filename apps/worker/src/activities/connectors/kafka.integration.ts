import assert from 'node:assert/strict';
import { Kafka, logLevel } from 'kafkajs';
import type { CredentialInstance } from './credentials';
import { fetchKafkaBatch, publishKafkaRecords } from './kafka';

async function main() {
  const brokers = process.env.KAFKA_TEST_BROKERS?.split(',').filter(Boolean);
  if (!brokers?.length) throw new Error('KAFKA_TEST_BROKERS is required');
  const topic = `dataflow-smoke-${Date.now()}`;
  const instance: CredentialInstance = {
    provider: 'kafka', kind: 'credential', secret: {},
    extra: { brokers: brokers.join(','), clientId: 'dataflow-smoke', tls: false, saslMechanism: 'none' },
  };
  const admin = new Kafka({ clientId: 'dataflow-smoke-admin', brokers, logLevel: logLevel.NOTHING }).admin();
  await admin.connect();
  try {
    await admin.createTopics({ topics: [{ topic, numPartitions: 1, replicationFactor: 1 }], waitForLeaders: true, timeout: 5000 });
    await publishKafkaRecords([{ id: 1 }, { id: 2 }, { id: 3 }], { topic, keyField: 'id' }, {
      tenantId: 'smoke', executionId: 'exec-smoke', nodeId: 'sink',
    }, instance);
    const first = await fetchKafkaBatch({
      config: { topic, startPosition: 'earliest', valueFormat: 'json', includeMetadata: true },
      cursor: {}, ingestion: { mode: 'incremental', pageSize: 2 }, tenantId: 'smoke',
    }, instance);
    assert.deepEqual(first.records.map(record => record.id), [1, 2]);
    assert.equal(first.hasMore, true);
    const second = await fetchKafkaBatch({
      config: { topic, startPosition: 'earliest', valueFormat: 'json', includeMetadata: true },
      cursor: first.nextCursor, ingestion: { mode: 'incremental', pageSize: 2 }, tenantId: 'smoke',
    }, instance);
    assert.deepEqual(second.records.map(record => record.id), [3]);
    assert.equal(second.hasMore, false);
    assert.equal((second.records[0]._kafka as any).offset, '2');
    console.log('Kafka integration smoke passed');
  } finally {
    await admin.deleteTopics({ topics: [topic] }).catch(() => {});
    await admin.disconnect();
  }
}

main().catch(error => { console.error(error); process.exit(1); });
