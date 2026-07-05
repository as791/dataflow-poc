import { expect, request as requestFactory, test } from '@playwright/test';
import { DeployedAPI, required } from './deployed-api';
import { bucket } from './external';

test('P1 failed execution can be retried', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  const status = await api.runExpectingFailure(`qa-retry-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/malformed.jsonl', format: 'jsonl' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/retry-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  const original = status.executionId ?? status.execution_id;
  expect((await api.retry(original)).executionId).not.toBe(original);
});

test('P1 tenant cannot read another tenant pipeline', async ({ request, baseURL }) => {
  const primary = new DeployedAPI(request);
  await primary.login();
  const created = await primary.create({
    name: `qa-isolation-${Date.now()}`, trigger: { type: 'manual' },
    nodes: [{ id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts' } }, { id: 'sink', type: 'sink', activityType: 'sink.webhook', config: { url: 'https://httpbin.org/post' } }],
    edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
  const secondaryContext = await requestFactory.newContext({ baseURL });
  const login = await secondaryContext.post('/api/auth/login', { data: { email: required('QA_SECONDARY_EMAIL'), password: required('QA_SECONDARY_PASSWORD') } });
  expect(login.ok()).toBeTruthy();
  const refresh = await secondaryContext.post('/api/auth/refresh');
  const token = (await refresh.json()).accessToken;
  expect((await secondaryContext.get(`/api/pipelines/${created.rowId}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(404);
  await secondaryContext.dispose();
});

test('P1 stream-direct execution accepts pause, resume and cancel', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const [kafka, clickhouse] = await Promise.all([api.connection('kafka'), api.connection('clickhouse')]);
  const created = await api.create({
    name: `qa-stream-signals-${Date.now()}`, trigger: { type: 'manual' }, execution: { engine: 'stream-direct' },
    nodes: [
      { id: 'src', type: 'source', activityType: 'kafka.fetch', config: { connectionId: kafka, topic: required('QA_KAFKA_TOPIC'), startPosition: 'latest', valueFormat: 'json' } },
      { id: 'sink', type: 'sink', activityType: 'sink.clickhouse', config: { connectionId: clickhouse, table: required('QA_CLICKHOUSE_TABLE') } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
  const { executionId } = await api.start(created.rowId);
  await api.signal(executionId, 'pause');
  await api.signal(executionId, 'resume');
  await api.signal(executionId, 'cancel');
});
