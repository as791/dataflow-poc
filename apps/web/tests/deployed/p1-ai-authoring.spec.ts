import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DeployedAPI } from './deployed-api';

type Definition = {
  suggestedName?: string;
  trigger: { type: string };
  nodes: Array<{ id: string; type: string; activityType: string; config: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string }>;
};

// ponytail: this box runs Ollama on CPU (~4 tok/s) — a generate/refine call can
// take minutes, well past Playwright's 30s default request timeout.
async function ai(api: DeployedAPI, path: string, data: Record<string, unknown>) {
  const response = await api.post(path, data, 290_000);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<{ definition: Definition; mermaid: string; warnings: string[] }>;
}

function persisted(definition: Definition, id = randomUUID()) {
  return { ...definition, id, name: definition.suggestedName || `AI QA ${Date.now()}` };
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(360_000);

test('P1 AI generates and creates a persisted pipeline', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const generated = await ai(api, '/api/ai/generate', {
    prompt: 'Build a manual pipeline named Paid posts export. Read the JSON list from https://jsonplaceholder.typicode.com/posts, keep only records where userId equals 1, then write JSON to S3 bucket dataflow-integration-qa-726929246977 at key ai-tests/paid-posts.json.',
  });

  expect(generated.definition.nodes.map(node => node.activityType)).toEqual(expect.arrayContaining(['http.fetch', 'transform.filter', 'sink.s3']));
  expect(generated.definition.nodes.find(node => node.activityType === 'http.fetch')?.config).toMatchObject({ url: 'https://jsonplaceholder.typicode.com/posts' });
  expect(generated.definition.nodes.find(node => node.activityType === 'transform.filter')?.config).toMatchObject({ predicate: 'r.userId === 1' });
  expect(generated.definition.nodes.find(node => node.activityType === 'sink.s3')?.config).toMatchObject({
    bucket: 'dataflow-integration-qa-726929246977', key: 'ai-tests/paid-posts.json', format: 'json',
  });
  expect(generated.mermaid).toMatch(/flowchart (TD|LR)/);

  const created = await api.create(persisted(generated.definition));
  const saved = await api.get(`/api/pipelines/${created.rowId}`);
  expect(saved.ok(), await saved.text()).toBeTruthy();
  expect(await saved.json()).toMatchObject({ version: 1, definition: { nodes: generated.definition.nodes, edges: generated.definition.edges } });
});

test('P2 natural-language edits insert and update configured nodes and persist a new version', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const pipelineId = randomUUID();
  const base: Definition = {
    suggestedName: `AI refine QA ${Date.now()}`, trigger: { type: 'manual' },
    nodes: [
      { id: 'source', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts' } },
      { id: 'filter', type: 'transform', activityType: 'transform.filter', config: { predicate: 'r.userId === 1' } },
      { id: 'destination', type: 'sink', activityType: 'sink.s3', config: { bucket: 'dataflow-integration-qa-726929246977', key: 'ai-tests/posts.json', format: 'json' } },
    ],
    edges: [{ source: 'source', target: 'filter' }, { source: 'filter', target: 'destination' }],
  };

  const inserted = await ai(api, '/api/ai/refine', {
    definition: base,
    prompt: 'Before filtering, remove duplicate posts using the id field and keep the first record. Leave the source, filter, and destination settings unchanged.',
  });
  const dedupe = inserted.definition.nodes.find(node => node.activityType === 'transform.dedupe');
  expect(dedupe?.config).toMatchObject({ key: 'id', keep: 'first' });
  const source = inserted.definition.nodes.find(node => node.activityType === 'http.fetch')!;
  const filter = inserted.definition.nodes.find(node => node.activityType === 'transform.filter')!;
  expect(inserted.definition.edges).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: source.id, target: dedupe?.id }),
    expect.objectContaining({ source: dedupe?.id, target: filter.id }),
  ]));
  const first = await api.create(persisted(inserted.definition, pipelineId));
  expect(first.version).toBe(1);

  const updated = await ai(api, '/api/ai/refine', {
    definition: inserted.definition,
    prompt: 'Change the filter to keep records where userId equals 2, and change the S3 object key to ai-tests/posts-user-2.json. Do not change anything else.',
  });
  expect(updated.definition.nodes.find(node => node.activityType === 'transform.filter')?.config).toMatchObject({ predicate: 'r.userId === 2' });
  expect(updated.definition.nodes.find(node => node.activityType === 'sink.s3')?.config).toMatchObject({
    bucket: 'dataflow-integration-qa-726929246977', key: 'ai-tests/posts-user-2.json', format: 'json',
  });
  expect(updated.definition.nodes.find(node => node.activityType === 'transform.dedupe')?.config).toMatchObject({ key: 'id', keep: 'first' });
  expect(updated.definition.edges).toEqual(inserted.definition.edges);
  const second = await api.create(persisted(updated.definition, pipelineId));
  expect(second).toMatchObject({ pipelineKey: pipelineId, version: 2 });
});
