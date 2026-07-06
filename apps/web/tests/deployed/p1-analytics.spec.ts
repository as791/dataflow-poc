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

  const deleted = await api.delete(`/api/analytics/dashboards/${dashboard.id}`);
  expect(deleted.ok(), await deleted.text()).toBeTruthy();
});
