import { expect, test } from '@playwright/test';
import { DeployedAPI } from './deployed-api';
import { bucket } from './external';

test('P1 missing real S3 object fails visibly', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  await api.runExpectingFailure(`qa-s3-missing-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: `fixtures/missing-${Date.now()}.json`, format: 'json' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/missing-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
});

test('P1 real S3 rejects objects over the 25 MiB connector limit', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  const status = await api.runExpectingFailure(`qa-s3-large-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/oversized.json', format: 'json' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/large-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  expect(JSON.stringify(status)).toContain('25MB');
});

test('P1 empty real S3 JSONL completes without fabricated records', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  await api.run(`qa-s3-empty-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/empty.jsonl', format: 'jsonl' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/empty-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
});

test('P1 real S3 access-denied connector fails without leaking its secret', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const denied = await api.connection('s3', process.env.QA_S3_DENIED_CONNECTION ?? 'qa-aws-s3-denied');
  const status = await api.runExpectingFailure(`qa-s3-denied-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: denied, bucket, key: 'fixtures/orders.json', format: 'json' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: denied, bucket, key: `runs/denied-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  expect(JSON.stringify(status)).not.toContain(process.env.QA_S3_DENIED_SECRET ?? '__never-present__');
});
