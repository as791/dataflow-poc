import { expect, test } from '@playwright/test';
import { DeployedAPI, required } from './deployed-api';

test('P0 unauthenticated APIs are rejected', async ({ request }) => {
  expect((await request.get('/api/pipelines')).status()).toBe(401);
  expect((await request.get('/api/connectors')).status()).toBe(401);
});

test('P0 invalid password is rejected without account disclosure', async ({ request }) => {
  const response = await request.post('/api/auth/login', { data: { email: required('QA_EMAIL'), password: 'definitely-wrong-password' } });
  expect(response.status()).toBe(401);
  expect(await response.text()).toContain('invalid email or password');
});

const source = { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts' } };
const sink = { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: '00000000-0000-0000-0000-000000000000', bucket: 'unused', key: 'unused' } };

for (const [name, nodes, edges] of [
  ['empty graph', [], []],
  ['cycle', [source, { id: 'map', type: 'transform', activityType: 'transform.map', config: { expression: 'r' } }, sink], [{ id: 'e1', source: 'src', target: 'map' }, { id: 'e2', source: 'map', target: 'sink' }, { id: 'e3', source: 'sink', target: 'src' }]],
  ['unknown edge node', [source, sink], [{ id: 'e1', source: 'src', target: 'missing' }]],
  ['duplicate node id', [source, { ...sink, id: 'src' }], []],
] as const) {
  test(`P0 validation rejects ${name}`, async ({ request }) => {
    const api = new DeployedAPI(request);
    await api.login();
    await api.createExpecting(400, { name: `qa-invalid-${Date.now()}`, trigger: { type: 'manual' }, nodes, edges });
  });
}
