import { expect, test } from '@playwright/test';
import { DeployedAPI } from './deployed-api';

test('P1 pipeline output is queryable as an analytics dataset', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const collection = `qa_analytics_${Date.now()}`;
  await api.run(`analytics-${collection}`, [
    { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts', recordsPath: '' } },
    { id: 'sink', type: 'sink', activityType: 'sink.records', config: { collection } },
  ], [{ id: 'e1', source: 'src', target: 'sink' }]);

  const datasets = await api.get('/api/analytics/datasets');
  expect(datasets.ok(), await datasets.text()).toBeTruthy();
  expect(await datasets.json()).toContainEqual(expect.objectContaining({ collection, row_count: 100 }));

  const schema = await api.get(`/api/analytics/datasets/${collection}/schema`);
  expect(schema.ok(), await schema.text()).toBeTruthy();
  expect((await schema.json()).schema).toEqual(expect.arrayContaining([
    { name: 'id', type: 'number' }, { name: 'title', type: 'string' }, { name: 'userId', type: 'number' },
  ]));

  const query = await api.post('/api/analytics/query', {
    dataset: collection, select: ['id', 'title'], where: [{ field: 'userId', op: '=', value: 1 }],
    orderBy: { field: 'id', dir: 'ASC' }, limit: 10,
  });
  expect(query.ok(), await query.text()).toBeTruthy();
  const result = await query.json();
  expect(result.count).toBe(10);
  expect(result.rows.map((row: { id: number }) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // Typed numeric comparisons (ClickHouse rejects Float64 vs string comparisons)
  const gt = await api.post('/api/analytics/query', {
    dataset: collection, select: ['id'], where: [{ field: 'id', op: '>', value: 95 }],
    orderBy: { field: 'id', dir: 'ASC' }, limit: 100,
  });
  expect(gt.ok(), await gt.text()).toBeTruthy();
  expect((await gt.json()).rows.map((row: { id: number }) => row.id)).toEqual([96, 97, 98, 99, 100]);

  const agg = await api.post('/api/analytics/query', {
    dataset: collection, groupBy: ['userId'], aggregate: { field: 'id', fn: 'count' },
    where: [{ field: 'userId', op: '<=', value: 2 }],
    orderBy: { field: 'aggregate_value', dir: 'DESC' }, limit: 10,
  });
  expect(agg.ok(), await agg.text()).toBeTruthy();
  expect((await agg.json()).rows).toHaveLength(2);

  // Paginated raw-row browse
  const page1 = await api.get(`/api/analytics/datasets/${collection}/rows?limit=30&offset=0`);
  expect(page1.ok(), await page1.text()).toBeTruthy();
  const p1 = await page1.json();
  expect(p1.total).toBe(100);
  expect(p1.rows).toHaveLength(30);
  const page4 = await api.get(`/api/analytics/datasets/${collection}/rows?limit=30&offset=90`);
  expect((await page4.json()).rows).toHaveLength(10);

  // Time-bucketed aggregate: all rows ingested just now → single hour bucket with count 100
  const bucketed = await api.post('/api/analytics/query', {
    dataset: collection, bucket: 'hour', aggregate: { field: 'id', fn: 'count' }, limit: 10,
  });
  expect(bucketed.ok(), await bucketed.text()).toBeTruthy();
  const buckets = (await bucketed.json()).rows;
  expect(buckets.length).toBeGreaterThanOrEqual(1);
  expect(buckets.reduce((sum: number, b: { aggregate_value: number }) => sum + Number(b.aggregate_value), 0)).toBe(100);
  expect(buckets[0].time_bucket).toBeTruthy();

  const badBucket = await api.post('/api/analytics/query', {
    dataset: collection, bucket: 'fortnight', aggregate: { field: 'id', fn: 'count' },
  });
  expect(badBucket.status()).toBe(400);
});

test('P2 analytics dashboard can be saved, changed, shared read-only, and deleted', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const created = await api.post('/api/analytics/dashboards', {
    name: `QA dashboard ${Date.now()}`, definition: { dataset: 'qa', charts: [{ type: 'table' }] },
  });
  expect(created.status(), await created.text()).toBe(201);
  const dashboard = await created.json();

  const updated = await api.put(`/api/analytics/dashboards/${dashboard.id}`, { name: 'QA dashboard updated' });
  expect(updated.ok(), await updated.text()).toBeTruthy();
  expect((await updated.json()).name).toBe('QA dashboard updated');

  const shared = await api.post(`/api/analytics/dashboards/${dashboard.id}/share`);
  expect(shared.ok(), await shared.text()).toBeTruthy();
  const { shareUrl } = await shared.json();
  const publicView = await request.get(shareUrl);
  expect(publicView.ok(), await publicView.text()).toBeTruthy();
  expect(await publicView.json()).toMatchObject({ readOnly: true, dashboard: { id: dashboard.id, name: 'QA dashboard updated' } });

  // P3: share links are listable and revocable; revoked links stop working
  const shares = await api.get(`/api/analytics/dashboards/${dashboard.id}/shares`);
  expect(shares.ok(), await shares.text()).toBeTruthy();
  const shareList = await shares.json();
  expect(shareList.length).toBeGreaterThanOrEqual(1);

  const revoked = await api.delete(`/api/analytics/dashboards/${dashboard.id}/shares/${shareList[0].share_token_hash}`);
  expect(revoked.ok(), await revoked.text()).toBeTruthy();
  const afterRevoke = await request.get(shareUrl);
  expect(afterRevoke.status()).toBe(404);

  const deleted = await api.delete(`/api/analytics/dashboards/${dashboard.id}`);
  expect(deleted.ok(), await deleted.text()).toBeTruthy();
});
