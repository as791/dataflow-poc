import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { DeployedAPI } from './deployed-api';
import { bucket } from './external';

type LineageNode = {
  id: string;
  kind: 'asset' | 'pipeline';
  asset?: { urn: string; layer?: string; schema?: { fields?: Array<{ name: string }> } };
  pipeline?: { rowId: string; pipelineKey: string; name: string };
};
type LineageGraph = {
  nodes: LineageNode[];
  edges: Array<{ source: string; target: string }>;
  columnEdges: Array<{ source: string; target: string }>;
  stats: { pipelines: number; assets: number; links: number; sharedAssets: number; columnLinks: number };
};

async function lineage(api: DeployedAPI) {
  const response = await api.get('/api/pipelines/lineage/workspace?environment=test');
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json() as Promise<LineageGraph>;
}

test('P2 bronze → silver → gold pipelines produce connected workspace lineage', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const run = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const bronzeKey = `medallion/${run}/bronze/orders.json`;
  const silverKey = `medallion/${run}/silver/orders.json`;
  const goldKey = `medallion/${run}/gold/orders.json`;

  await api.runDefinition({
    name: `medallion-bronze-${run}`, trigger: { type: 'manual' }, metadata: { domain: 'sales', owner: 'qa' },
    nodes: [
      { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts' } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: bronzeKey, format: 'json', layer: 'bronze' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
  await api.runDefinition({
    name: `medallion-silver-${run}`, trigger: { type: 'manual' }, metadata: { domain: 'sales', owner: 'qa' },
    nodes: [
      { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: bronzeKey, format: 'json', layer: 'bronze' } },
      { id: 'contract', type: 'transform', activityType: 'transform.contract', config: { schemaJson: { id: 'number', userId: 'number', title: 'string', body: 'string' }, onViolation: 'drop', allowExtra: false } },
      { id: 'map', type: 'transform', activityType: 'transform.map', config: { expression: '({ id: r.id, customer_id: r.userId, title: r.title })' } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: silverKey, format: 'json', layer: 'silver' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'contract' }, { id: 'e2', source: 'contract', target: 'map' }, { id: 'e3', source: 'map', target: 'sink' }],
  });
  await api.runDefinition({
    name: `medallion-gold-${run}`, trigger: { type: 'manual' }, metadata: { domain: 'sales', owner: 'qa' },
    nodes: [
      { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: silverKey, format: 'json', layer: 'silver' } },
      { id: 'formula', type: 'transform', activityType: 'transform.formula', config: { outputField: 'title_length', expression: 'length(r.title)' } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: goldKey, format: 'json', layer: 'gold' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'formula' }, { id: 'e2', source: 'formula', target: 'sink' }],
  });

  const graph = await lineage(api);
  const assets = graph.nodes.filter(node => node.kind === 'asset');
  for (const [key, layer] of [[bronzeKey, 'bronze'], [silverKey, 'silver'], [goldKey, 'gold']] as const) {
    expect(assets.some(node => node.asset?.urn === `s3://${bucket}/${key}` && node.asset.layer === layer), `${layer} asset missing`).toBeTruthy();
  }
  const bronze = assets.find(node => node.asset?.urn === `s3://${bucket}/${bronzeKey}`)!;
  const silver = assets.find(node => node.asset?.urn === `s3://${bucket}/${silverKey}`)!;
  expect(graph.edges.some(edge => edge.source.startsWith('pipeline:') && edge.target === bronze.id)).toBeTruthy();
  expect(graph.edges.some(edge => edge.source === bronze.id && edge.target.startsWith('pipeline:'))).toBeTruthy();
  expect(graph.edges.some(edge => edge.source === silver.id && edge.target.startsWith('pipeline:'))).toBeTruthy();
  expect(graph.stats.assets).toBeGreaterThanOrEqual(3);
  expect(graph.stats.sharedAssets).toBeGreaterThanOrEqual(2);
});

test('P2 contract and map produce field-level lineage into the silver asset', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const run = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const key = `medallion/${run}/silver/columns.json`;
  await api.runDefinition({
    name: `lineage-columns-${run}`, trigger: { type: 'manual' },
    nodes: [
      { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/orders.json', format: 'json', layer: 'bronze' } },
      { id: 'contract', type: 'transform', activityType: 'transform.contract', config: { schemaJson: { id: 'number', customer: 'string', amount: 'number' }, onViolation: 'fail', allowExtra: true } },
      { id: 'map', type: 'transform', activityType: 'transform.map', config: { expression: '({ order_id: r.id, customer_name: r.customer, revenue: r.amount })' } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key, format: 'json', layer: 'silver' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'contract' }, { id: 'e2', source: 'contract', target: 'map' }, { id: 'e3', source: 'map', target: 'sink' }],
  });
  const graph = await lineage(api);
  const sink = graph.nodes.find(node => node.asset?.urn === `s3://${bucket}/${key}`);
  expect(sink?.asset?.schema?.fields?.map(field => field.name)).toEqual(expect.arrayContaining(['id', 'customer', 'amount']));
  expect(graph.columnEdges.length).toBeGreaterThanOrEqual(3);
  expect(graph.stats.columnLinks).toBeGreaterThanOrEqual(3);
});

test('P3 lineage change history records a pipeline version change', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const pipelineKey = randomUUID();
  const base = {
    id: pipelineKey, name: `lineage-version-${Date.now()}`, trigger: { type: 'manual' },
    nodes: [
      { id: 'src', type: 'source', activityType: 's3.fetch', config: { connectionId: s3, bucket, key: 'fixtures/orders.json', format: 'json', layer: 'bronze' } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `medallion/${pipelineKey}/silver/v1.json`, format: 'json', layer: 'silver' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  };
  await api.create(base);
  await api.create({ ...base, nodes: [base.nodes[0], { ...base.nodes[1], config: { ...base.nodes[1].config, key: `medallion/${pipelineKey}/gold/v2.json`, layer: 'gold' } }] });
  const response = await api.get('/api/pipelines/lineage/changes?environment=test&limit=100');
  expect(response.ok(), await response.text()).toBeTruthy();
  const items = (await response.json()).items as Array<{ pipelineKey: string; fromVersion: number; toVersion: number; changes: unknown[] }>;
  const change = items.find(item => item.pipelineKey === pipelineKey);
  expect(change).toMatchObject({ fromVersion: 1, toVersion: 2 });
  expect(change?.changes.length).toBeGreaterThan(0);
});

test('P3 invalid medallion layer is rejected at the API boundary', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  await api.createExpecting(400, {
    name: `invalid-layer-${Date.now()}`, trigger: { type: 'manual' },
    nodes: [
      { id: 'src', type: 'source', activityType: 'http.fetch', config: { url: 'https://jsonplaceholder.typicode.com/posts' } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { bucket, key: 'invalid.json', layer: 'platinum' } },
    ], edges: [{ id: 'e1', source: 'src', target: 'sink' }],
  });
});
