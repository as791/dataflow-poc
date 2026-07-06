import { expect, test } from '@playwright/test';
import { DeployedAPI, required } from './deployed-api';
import { bucket } from './external';

test('P2 Spark SQL moves a real Parquet S3 source into Iceberg', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const [s3, iceberg] = await Promise.all([api.connection('s3'), api.connection('iceberg')]);
  await api.runDefinition({
    name: `p2-spark-${Date.now()}`, trigger: { type: 'manual' },
    execution: { engine: 'spark-sql', transformSql: 'SELECT * FROM source WHERE amount > 0' },
    nodes: [
      { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: required('QA_SPARK_PARQUET_KEY') } },
      { id: 'sink', type: 'sink', activityType: 'sink.iceberg', config: { connectionId: iceberg, namespace: required('QA_ICEBERG_NAMESPACE'), table: required('QA_ICEBERG_TABLE') } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
});

test('P2 Flink SQL deploys Kafka to ClickHouse and accepts cancellation', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const [kafka, clickhouse] = await Promise.all([api.connection('kafka'), api.connection('clickhouse')]);
  const columns = [{ name: 'id', type: 'BIGINT' }, { name: 'amount', type: 'DOUBLE' }];
  const { rowId } = await api.create({
    name: `p2-flink-${Date.now()}`, trigger: { type: 'manual' },
    execution: { engine: 'flink-sql', transformSql: 'SELECT id, amount FROM source WHERE amount > 0' },
    nodes: [
      { id: 'src', type: 'source', activityType: 'kafka.fetch', config: { connectionId: kafka, topic: required('QA_KAFKA_TOPIC'), valueFormat: 'json', columns } },
      { id: 'sink', type: 'sink', activityType: 'sink.clickhouse', config: { connectionId: clickhouse, collection: required('QA_FLINK_COLLECTION'), columns } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
  const { executionId } = await api.start(rowId);
  for (let i = 0; i < 30; i++) {
    const phase = (await api.status(executionId)).phase;
    if (phase === 'running' || phase === 'paused') break;
    if (phase === 'failed') throw new Error(`Flink execution ${executionId} failed`);
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  await api.signal(executionId, 'cancel');
});

for (const [engine, sql] of [
  ['spark-sql', 'DROP TABLE source'],
  ['flink-sql', 'SELECT * FROM source; DELETE FROM source'],
] as const) {
  test(`P2 ${engine} rejects unsafe SQL before execution`, async ({ request }) => {
    const api = new DeployedAPI(request); await api.login();
    await api.createExpecting(400, {
      name: `p2-unsafe-${engine}-${Date.now()}`, trigger: { type: 'manual' }, execution: { engine, transformSql: sql },
      nodes: [
        { id: 'src', type: 'source', activityType: engine === 'flink-sql' ? 'kafka.fetch' : 's3.fetch', config: {} },
        { id: 'sink', type: 'sink', activityType: 'sink.clickhouse', config: {} },
      ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
    });
  });
}

test('P2 stream-direct rejects a branched graph', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  await api.createExpecting(400, {
    name: `p2-invalid-stream-${Date.now()}`, trigger: { type: 'manual' }, execution: { engine: 'stream-direct' },
    nodes: [
      { id: 'src', type: 'source', activityType: 'kafka.fetch', config: {} },
      { id: 'fork', type: 'fork', activityType: 'flow.fork', config: {} },
      { id: 'a', type: 'sink', activityType: 'sink.postgres', config: {} },
      { id: 'b', type: 'sink', activityType: 'sink.mysql', config: {} },
    ], edges: [{ id: 'e1', source: 'src', target: 'fork' }, { id: 'e2', source: 'fork', target: 'a' }, { id: 'e3', source: 'fork', target: 'b' }],
  });
});
