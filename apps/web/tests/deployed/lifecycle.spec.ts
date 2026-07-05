import { expect, test } from '@playwright/test';
import { DeployedAPI } from './deployed-api';

test('P0 pipeline persists and reloads with its graph intact', async ({ request }) => {
  const api = new DeployedAPI(request);
  await api.login();
  const name = `qa-lifecycle-${Date.now()}`;
  const created = await api.create({
    name, trigger: { type: 'manual' },
    nodes: [
      { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts' } },
      { id: 'sink', type: 'sink', activityType: 'sink.webhook', config: { url: 'https://httpbin.org/post' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
  const response = await api.get(`/api/pipelines/${created.rowId}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const saved = await response.json();
  const definition = saved.definition ?? saved;
  expect(definition.name).toBe(name);
  expect(definition.nodes).toHaveLength(2);
  expect(definition.edges).toEqual([{ id: 'e1', source: 'src', target: 'sink' }]);
});
