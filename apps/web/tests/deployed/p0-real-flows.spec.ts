import { expect, test } from '@playwright/test';
import { DeployedAPI, required } from './deployed-api';
import { bucket, readS3Json } from './external';

test.describe.configure({ mode: 'serial' });

test('P0 connector credentials reach real Google and AWS', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  await api.testConnection(google);
  await api.testConnection(s3);
  await api.refreshConnection(google);
});

test('P0 public REST source writes filtered records to real S3', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `runs/rest-to-s3-${suffix}.json`;
  await api.run(`qa-rest-s3-${suffix}`, [
    { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts', recordsPath: '' } },
    { id: 'filter', type: 'transform', activityType: 'transform.filter', config: { predicate: 'r.userId === 1' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
  ], [
    { id: 'e1', source: 'src', target: 'filter' },
    { id: 'e2', source: 'filter', target: 'sink' },
  ]);
  const records = readS3Json(key);
  expect(records).toHaveLength(10);
  expect(records.every((record: { userId: number }) => record.userId === 1)).toBeTruthy();
});

test('P0 real Google Sheet source writes paid orders to real S3', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `runs/sheets-to-s3-${suffix}.json`;
  await api.run(`qa-sheets-s3-${suffix}`, [
    { id: 'src', type: 'source', activityType: 'gsheets.fetch', config: { connectionId: google, spreadsheetId: required('GOOGLE_QA_SOURCE_SPREADSHEET_ID'), range: 'orders!A:E', keyColumn: 'id' } },
    { id: 'filter', type: 'transform', activityType: 'transform.filter', config: { predicate: "r.status === 'paid'" } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
  ], [
    { id: 'e1', source: 'src', target: 'filter' },
    { id: 'e2', source: 'filter', target: 'sink' },
  ]);
  expect(readS3Json(key).map((r: { id: string }) => String(r.id))).toEqual(['2', '4']);
});

test('P0 real S3 source replaces a real Google Sheet', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await api.run(`qa-s3-sheets-${suffix}`, [
    { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/orders.jsonl', format: 'jsonl' } },
    { id: 'sink', type: 'sink', activityType: 'sink.gsheets', config: { connectionId: google, spreadsheetId: required('GOOGLE_QA_DEST_SPREADSHEET_ID'), sheetName: 'replace_test', writeMode: 'replace', includeHeader: true } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  const preview = await api.googlePreview(google, required('GOOGLE_QA_DEST_SPREADSHEET_ID'), 'replace_test');
  expect(preview.headers).toEqual(['id', 'customer', 'amount', 'status', 'updated_at']);
  expect(preview.rows).toHaveLength(4);
});
