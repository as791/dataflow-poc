import { expect, test } from '@playwright/test';
import { DeployedAPI } from './deployed-api';
import { bucket, readS3Json } from './external';

const cases = [
  {
    name: 'PokéAPI offset pagination',
    config: { url: 'https://pokeapi.co/api/v2/pokemon', recordsPath: 'results', pagination: { style: 'offset', param: 'offset', limitParam: 'limit', limit: 20 } },
  },
  {
    name: 'GitHub page pagination',
    config: { url: 'https://api.github.com/repos/kubernetes/kubernetes/issues', recordsPath: '', headers: { Accept: 'application/vnd.github+json' }, pagination: { style: 'page', param: 'page', limitParam: 'per_page', limit: 100 } },
  },
  {
    name: 'USGS nested GeoJSON',
    config: { url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', recordsPath: 'features' },
  },
] as const;

for (const item of cases) {
  test(`P1 ${item.name} writes real S3 output`, async ({ request }) => {
    const api = new DeployedAPI(request);
    await api.login();
    const s3 = await api.connection('s3');
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const key = `runs/http-${suffix}.json`;
    await api.run(`qa-${item.name}-${suffix}`, [
      { id: 'src', type: 'source', activityType: 'http.fetch', config: item.config },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
    ], [{ id: 'e1', source: 'src', target: 'sink' }]);
    expect(readS3Json(key).length).toBeGreaterThan(0);
  });
}

test('P1 unreachable HTTP source fails visibly', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  await api.runExpectingFailure(`qa-http-failure-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://httpstat.us/500' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/http-failure-${Date.now()}.json`, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
});

test('P1 GitHub incremental watermark writes real S3 output', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const s3 = await api.connection('s3');
  const key = `runs/http-incremental-${Date.now()}.json`;
  await api.run(`qa-http-incremental-${Date.now()}`, [
    { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://api.github.com/repos/kubernetes/kubernetes/issues', recordsPath: '', incremental: { sinceParam: 'since', recordTimestampPath: 'updated_at' } }, ingestion: { mode: 'incremental' } },
    { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json' } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);
});
