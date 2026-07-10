import { expect, test } from '@playwright/test';
import { DeployedAPI, required } from './deployed-api';
import { bucket, readS3Json } from './external';

test('P3 concurrent executions complete independently', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const { rowId } = await api.create({
    name: `p3-concurrent-${Date.now()}`, trigger: { type: 'manual' }, concurrency: { maxParallelNodes: 4 },
    nodes: [
      { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/orders.json', format: 'json' } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: 'runs/p3-concurrent-{executionId}.json', format: 'json' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
  const executions = await Promise.all([api.start(rowId), api.start(rowId)]);
  expect(executions[0].executionId).not.toBe(executions[1].executionId);
  const statuses = await Promise.all(executions.map(e => api.wait(e.executionId)));
  expect(statuses.map(s => s.phase)).toEqual(['completed', 'completed']);
});

test('P3 source timeout reaches a terminal failure without hanging', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  await api.runExpectingFailure(`p3-timeout-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 'http.fetch', timeoutSec: 2, retry: { maximumAttempts: 1 }, config: { url: 'https://httpstat.us/200?sleep=10000' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/p3-timeout-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
});

test('P3 permanently failing webhook sink terminates without infinite retry', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  await api.runExpectingFailure(`p3-webhook-failure-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: await api.connection('s3'), bucket, key: 'fixtures/orders.json', format: 'json' } },
    { id: 'sink', type: 'sink', activityType: 'sink.webhook', retry: { maximumAttempts: 2 }, config: { url: 'https://httpstat.us/503' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
});

test('P3 Google token refresh leaves the real Sheets source usable', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  await api.refreshConnection(google);
  const key = `runs/p3-google-refresh-${Date.now()}.json`;
  await api.run(`p3-google-refresh-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 'gsheets.fetch', config: { connectionId: google, spreadsheetId: required('GOOGLE_QA_SOURCE_SPREADSHEET_ID'), range: 'orders!A:E', keyColumn: 'id' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  expect(readS3Json(key)).toHaveLength(4);
});

test('P3 Google replace sink remains idempotent across reruns', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  const nodes = [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/orders.json', format: 'json' } },
    { id: 'sink', type: 'sink', activityType: 'sink.gsheets', config: { connectionId: google, spreadsheetId: required('GOOGLE_QA_DEST_SPREADSHEET_ID'), sheetName: 'replace_test', writeMode: 'replace', includeHeader: true } },
  ];
  const edges = [{ id: 'e1', source: 'src', target: 'sink' }];
  await api.run(`p3-idempotent-a-${Date.now()}`, nodes, edges);
  await api.run(`p3-idempotent-b-${Date.now()}`, nodes, edges);
  const preview = await api.googlePreview(google, required('GOOGLE_QA_DEST_SPREADSHEET_ID'), 'replace_test');
  expect(preview.rows).toHaveLength(4);
});

test('P3 contract fail reports schema drift as an execution failure', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const status = await api.runExpectingFailure(`p3-schema-fail-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/edge-cases.json', format: 'json' } },
    { id: 'contract', type: 'transform', activityType: 'transform.contract', config: { schemaJson: { id: 'number', nullable: 'number' }, onViolation: 'fail', allowExtra: true } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/p3-schema-fail-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'contract' }, { id: 'e2', source: 'contract', target: 'sink' }]);
  expect(JSON.stringify(status)).toContain('contract');
});

test('P3 cancellation reaches a terminal state', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const [kafka, clickhouse] = await Promise.all([api.connection('kafka'), api.connection('clickhouse')]);
  const { rowId } = await api.create({
    name: `p3-cancel-${Date.now()}`, trigger: { type: 'manual' }, execution: { engine: 'stream-direct' },
    nodes: [
      { id: 'src', type: 'source', activityType: 'kafka.fetch', config: { connectionId: kafka, topic: required('QA_KAFKA_TOPIC'), startPosition: 'latest', valueFormat: 'json' } },
      { id: 'sink', type: 'sink', activityType: 'sink.clickhouse', config: { connectionId: clickhouse, table: required('QA_CLICKHOUSE_TABLE') } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
  const { executionId } = await api.start(rowId);
  await api.signal(executionId, 'cancel');
  expect((await api.wait(executionId)).phase).toBe('cancelled');
});
