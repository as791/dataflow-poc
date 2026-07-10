import { expect, test } from '@playwright/test';
import { DeployedAPI, required } from './deployed-api';
import { bucket, readS3Json } from './external';

test.describe.configure({ mode: 'serial' });

test('P1 S3 JSON source round-trips through the real bucket', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `runs/s3-roundtrip-${suffix}.json`;
  await api.run(`qa-s3-roundtrip-${suffix}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/orders.json', format: 'json' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  expect(readS3Json(key)).toHaveLength(4);
});

test('P1 malformed real S3 JSONL fails visibly', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  const status = await api.runExpectingFailure(`qa-s3-malformed-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/malformed.jsonl', format: 'jsonl' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/should-not-exist-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  expect(JSON.stringify(status)).not.toContain(process.env.AWS_SECRET_ACCESS_KEY ?? '__unset__');
});

test('P1 Google schema-drift sheet preserves irregular values in real S3', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `runs/schema-drift-${suffix}.json`;
  await api.run(`qa-schema-drift-${suffix}`, [
    { id: 'src', type: 'source', activityType: 'gsheets.fetch', config: { connectionId: google, spreadsheetId: required('GOOGLE_QA_SOURCE_SPREADSHEET_ID'), range: 'schema_drift!A:F', keyColumn: 'id' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  const records = readS3Json(key);
  expect(records).toHaveLength(2);
  expect(records[1].amount).toBe('not-a-number');
  expect(records[1].extra_field).toBe('βeta');
});

test('P1 Google append sink adds rows to the real destination sheet', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  await api.run(`qa-google-append-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/orders.json', format: 'json' } },
    { id: 'sink', type: 'sink', activityType: 'sink.gsheets', config: { connectionId: google, spreadsheetId: required('GOOGLE_QA_DEST_SPREADSHEET_ID'), sheetName: 'append_test', writeMode: 'append', includeHeader: true } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  const preview = await api.googlePreview(google, required('GOOGLE_QA_DEST_SPREADSHEET_ID'), 'append_test');
  expect(preview.rows.length).toBeGreaterThanOrEqual(4);
});
