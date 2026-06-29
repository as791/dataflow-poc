import assert from 'node:assert/strict';
import type { PipelineDefinition } from './types';
import { assetMaterializationTopic, attachLatestMaterializations, attachLatestQuality, buildWorkspaceLineage, comparePublishedContracts, deriveAssetBindings, diffPipelineLineage, downstreamOutputBindings, filterWorkspaceLineage, successfulOutputBindings } from './lineage';

const base = { id: 'p', version: 1, name: 'orders', tenantId: 't', trigger: { type: 'manual' as const }, edges: [] };
const def: PipelineDefinition = {
  ...base,
  nodes: [
    { id: 'src', type: 'source', activityType: 'http.fetch', label: 'API', config: { url: 'https://api.example.com/orders?token=secret' } },
    { id: 'sink', type: 'sink', activityType: 'sink.postgres', label: 'Warehouse', config: { connectionId: 'warehouse', table: 'bronze.orders', layer: 'bronze' } },
    { id: 'archive', type: 'sink', activityType: 'sink.s3', label: 'Archive', config: { bucket: 'lake', key: 'bronze/orders.jsonl', layer: 'bronze' } },
  ],
};

const bindings = deriveAssetBindings(def);
assert.equal(bindings.length, 3);
assert.equal(bindings[0].asset.urn, 'https://api.example.com/orders');
assert.equal(bindings[0].direction, 'input');
assert.equal(bindings[1].asset.urn, 'postgres://warehouse/bronze.orders');
assert.equal(bindings[1].asset.layer, 'bronze');
assert.equal(bindings[2].asset.urn, 's3://lake/bronze/orders.jsonl');
assert(!bindings[0].asset.urn.includes('secret'));
assert.deepEqual(successfulOutputBindings(def, [
  { nodeId: 'sink', status: 'success', recordCount: 12 },
  { nodeId: 'archive', status: 'failed' },
]).map(binding => [binding.nodeId, binding.recordCount]), [['sink', 12]]);

const downstream: PipelineDefinition = {
  ...base, id: 'p2', name: 'order marts', trigger: { type: 'event', topic: 'pipeline.completed.p' },
  nodes: [
    { id: 'src', type: 'source', activityType: 'postgres.fetch', config: { connectionId: 'warehouse', table: 'bronze.orders', layer: 'bronze' } },
    { id: 'contract', type: 'transform', activityType: 'transform.contract', config: { schemaJson: { id: 'number', email: 'string?' } } },
    { id: 'sink', type: 'sink', activityType: 'sink.clickhouse', config: { connectionId: 'analytics', table: 'gold.orders', layer: 'gold' } },
  ],
  edges: [{ id: 'e1', source: 'src', target: 'contract' }, { id: 'e2', source: 'contract', target: 'sink' }],
};
const workspace = buildWorkspaceLineage([
  { rowId: 'r1', pipelineKey: 'p', name: 'orders', version: 1, status: 'active', environment: 'prod', definition: def },
  { rowId: 'r2', pipelineKey: 'p2', name: 'marts', version: 1, status: 'active', environment: 'prod', definition: downstream },
]);
assert.equal(workspace.stats.pipelines, 2);
assert.equal(workspace.stats.sharedAssets, 1);
assert.equal(workspace.nodes.filter(n => n.kind === 'asset').length, 4);
assert(workspace.edges.some(e => e.source === 'asset:postgres://warehouse/bronze.orders' && e.target === 'pipeline:r2'));
assert(workspace.edges.some(e => e.source === 'pipeline:r1' && e.target === 'pipeline:r2' && e.nodeId === 'trigger'));
assert.equal(assetMaterializationTopic('postgres://warehouse/bronze.orders'), 'asset.materialized.postgres://warehouse/bronze.orders');
const assetConsumer: PipelineDefinition = {
  ...base, id: 'p3', name: 'asset consumer', trigger: { type: 'asset', assetUrn: 'postgres://warehouse/bronze.orders' },
  nodes: [{ id: 'filter', type: 'transform', activityType: 'transform.filter', config: { predicate: 'true' } }],
};
const assetTriggered = buildWorkspaceLineage([
  { rowId: 'r1', pipelineKey: 'p', name: 'orders', version: 1, status: 'active', environment: 'prod', definition: def },
  { rowId: 'r3', pipelineKey: 'p3', name: 'consumer', version: 1, status: 'active', environment: 'prod', definition: assetConsumer },
]);
assert(assetTriggered.edges.some(edge => edge.source === 'asset:postgres://warehouse/bronze.orders'
  && edge.target === 'pipeline:r3' && edge.nodeId === 'trigger'));
const gold = workspace.nodes.find(n => n.kind === 'asset' && n.asset.urn === 'clickhouse://analytics/gold.orders');
assert(gold?.kind === 'asset' && gold.asset.schema?.fields[1].nullable);
assert(workspace.columnEdges.some(edge => edge.sourceField === 'id' && edge.targetField === 'id'));
assert.equal(downstreamOutputBindings(downstream, 'contract')[0].asset.urn, 'clickhouse://analytics/gold.orders');
const observed = attachLatestMaterializations(workspace, [{
  assetUrn: 'clickhouse://analytics/gold.orders', executionId: 'exec-1', pipelineRowId: 'r2',
  nodeId: 'sink', recordCount: 42, materializedAt: '2026-06-29T12:00:00.000Z',
}]);
const observedGold = observed.nodes.find(n => n.kind === 'asset' && n.asset.urn === 'clickhouse://analytics/gold.orders');
assert(observedGold?.kind === 'asset' && observedGold.materialization?.recordCount === 42);
const qualityGraph = attachLatestQuality(observed, [{
  assetUrn: 'clickhouse://analytics/gold.orders', executionId: 'exec-1', pipelineRowId: 'r2', nodeId: 'contract',
  status: 'warning', passedCount: 40, failedCount: 2, evaluatedAt: '2026-06-29T12:00:00.000Z', quarantineAvailable: true,
}]);
const qualityGold = qualityGraph.nodes.find(n => n.kind === 'asset' && n.asset.urn === 'clickhouse://analytics/gold.orders');
assert(qualityGold?.kind === 'asset' && qualityGold.quality?.failedCount === 2);

const breaking = structuredClone(downstream);
(breaking.nodes.find(node => node.id === 'contract')!.config as any).schemaJson = { id: 'string' };
assert.deepEqual(comparePublishedContracts(downstream, breaking).map(issue => issue.kind), ['type-changed', 'field-removed']);
const additive = structuredClone(downstream);
(additive.nodes.find(node => node.id === 'contract')!.config as any).schemaJson = { id: 'number', email: 'string?', total: 'number' };
assert.equal(comparePublishedContracts(downstream, additive).length, 0);
assert.deepEqual(diffPipelineLineage(downstream, additive).map(change => [change.kind, change.severity]), [['field-added', 'info']]);
assert.deepEqual(diffPipelineLineage(downstream, breaking).filter(change => change.severity === 'breaking').map(change => change.kind).sort(), ['field-removed', 'field-type-changed'].sort());
const moved = structuredClone(downstream);
(moved.nodes.find(node => node.id === 'sink')!.config as any).layer = 'silver';
assert(diffPipelineLineage(downstream, moved).some(change => change.kind === 'layer-changed'));
const rescheduled = structuredClone(downstream);
rescheduled.trigger = { type: 'asset', assetUrn: 'postgres://warehouse/bronze.orders' };
assert(diffPipelineLineage(downstream, rescheduled).some(change => change.kind === 'trigger-changed'));
const bronzeOnly = filterWorkspaceLineage(workspace, { layers: ['bronze'] });
assert(bronzeOnly.nodes.some(node => node.kind === 'asset' && node.asset.layer === 'bronze'));
assert(!bronzeOnly.nodes.some(node => node.kind === 'asset' && node.asset.layer === 'gold'));
const searched = filterWorkspaceLineage(workspace, { query: 'gold.orders' });
assert(searched.nodes.some(node => node.kind === 'asset' && node.asset.urn === 'clickhouse://analytics/gold.orders'));
assert(searched.nodes.some(node => node.kind === 'pipeline' && node.pipeline.rowId === 'r2'));
const focused = filterWorkspaceLineage(workspace, { focusId: 'asset:postgres://warehouse/bronze.orders', depth: 1 });
assert.deepEqual(new Set(focused.nodes.map(node => node.id)), new Set([
  'asset:postgres://warehouse/bronze.orders', 'pipeline:r1', 'pipeline:r2',
]));

const kafkaProducer: PipelineDefinition = { ...base, id: 'kp', metadata: { domain: 'sales' }, nodes: [
  { id: 'out', type: 'sink', activityType: 'sink.kafka', config: { connectionId: 'k1', cluster: 'events-prod', topic: 'orders.v1' } },
] };
const kafkaConsumer: PipelineDefinition = { ...base, id: 'kc', metadata: { domain: 'finance' }, nodes: [
  { id: 'in', type: 'source', activityType: 'kafka.fetch', config: { connectionId: 'k2', cluster: 'events-prod', topic: 'orders.v1' } },
] };
const kafkaLineage = buildWorkspaceLineage([
  { rowId: 'kp', pipelineKey: 'kp', name: 'producer', version: 1, status: 'active', environment: 'prod', metadata: kafkaProducer.metadata, definition: kafkaProducer },
  { rowId: 'kc', pipelineKey: 'kc', name: 'consumer', version: 1, status: 'active', environment: 'prod', metadata: kafkaConsumer.metadata, definition: kafkaConsumer },
]);
assert.equal(kafkaLineage.stats.sharedAssets, 1);
assert(kafkaLineage.nodes.some(node => node.kind === 'asset' && node.asset.urn === 'kafka://events-prod/orders.v1'));
const salesOnly = filterWorkspaceLineage(kafkaLineage, { domains: ['sales'] });
assert(salesOnly.nodes.some(node => node.kind === 'pipeline' && node.pipeline.metadata?.domain === 'sales'));
assert(!salesOnly.nodes.some(node => node.kind === 'pipeline' && node.pipeline.metadata?.domain === 'finance'));

console.log('lineage binding tests passed');
