import { expect, test } from '@playwright/test';
import { DeployedAPI } from './deployed-api';
import { bucket, readS3Json } from './external';

test('P1 Google Drive backfill lists the real QA file into real S3', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const [google, s3] = await Promise.all([api.connection('google'), api.connection('s3')]);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `runs/drive-${suffix}.json`;
  await api.run(`qa-drive-${suffix}`, [
    { id: 'src', type: 'source', activityType: 'gdrive.fetch', config: { connectionId: google, query: "name = 'dataflow-qa-orders.json' and trashed = false" }, ingestion: { mode: 'backfill', pageSize: 20 } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  const rows = readS3Json(key);
  expect(rows.some((row: { id: string }) => row.id === '1gwQsrvnaGMY44g1WcitarJJ-Ri2xkPYP')).toBeTruthy();
});
