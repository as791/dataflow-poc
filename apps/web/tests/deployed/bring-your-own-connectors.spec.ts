import { test } from '@playwright/test';
import { DeployedAPI, required, type Node } from './deployed-api';

const publicSource: Node = { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts' } };

const sinks = [
  ['postgres', 'sink.postgres', () => ({ table: required('QA_POSTGRES_TABLE'), conflictKey: 'id' })],
  ['mysql', 'sink.mysql', () => ({ table: required('QA_MYSQL_TABLE'), primaryKey: 'id' })],
  ['mongodb', 'sink.mongodb', () => ({ collection: required('QA_MONGODB_COLLECTION'), keyField: 'id' })],
  ['clickhouse', 'sink.clickhouse', () => ({ table: required('QA_CLICKHOUSE_TABLE') })],
  ['kafka', 'sink.kafka', () => ({ topic: required('QA_KAFKA_TOPIC'), keyField: 'id' })],
] as const;

for (const [provider, activityType, config] of sinks) {
  test(`P1 public API writes the real ${provider} sink`, async ({ request }) => {
    const api = new DeployedAPI(request);
    await api.login();
    const connectionId = await api.connection(provider);
    await api.testConnection(connectionId);
    await api.run(`qa-${provider}-sink-${Date.now()}`, [
      publicSource,
      { id: 'sink', type: 'sink', activityType, config: { connectionId, ...config() } },
    ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  });
}

const databaseSources = [
  ['postgres', 'postgres.fetch', () => ({ table: required('QA_POSTGRES_TABLE'), columns: '*', cursorColumn: 'id', cursorType: 'number', syncMode: 'cursor' })],
  ['mysql', 'mysql.fetch', () => ({ table: required('QA_MYSQL_TABLE'), columns: '*', cursorColumn: 'id', cursorType: 'number', syncMode: 'cursor' })],
  ['mongodb', 'mongodb.fetch', () => ({ collection: required('QA_MONGODB_COLLECTION'), cursorField: '_id', cursorType: 'objectId', syncMode: 'cursor' })],
] as const;

for (const [provider, activityType, config] of databaseSources) {
  test(`P1 real ${provider} cursor source writes S3`, async ({ request }) => {
    const api = new DeployedAPI(request);
    await api.login();
    const [sourceConnection, s3] = await Promise.all([api.connection(provider), api.connection('s3')]);
    await api.run(`qa-${provider}-source-${Date.now()}`, [
      { id: 'src', type: 'source', activityType, config: { connectionId: sourceConnection, ...config() } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket: required('AWS_QA_BUCKET'), key: `runs/${provider}-source-${Date.now()}.json`, format: 'json' } },
    ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  });
}

test('P1 webhook sink posts to a real receiver', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  await api.run(`qa-webhook-${Date.now()}`, [
    publicSource,
    { id: 'sink', type: 'sink', activityType: 'sink.webhook', config: { url: required('QA_WEBHOOK_URL') } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
});
