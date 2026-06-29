import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { PipelineDefinition } from '@dataflow/shared';
import { validatePipeline } from './validatePipeline';

const base: PipelineDefinition = {
  id: 'pipeline', version: 1, tenantId: 'tenant', name: 'orders',
  trigger: { type: 'manual' }, edges: [],
  nodes: [{ id: 'source', type: 'source', activityType: 'http.fetch', config: { url: 'https://example.com' } }],
};
assert.doesNotThrow(() => validatePipeline(base));
assert.throws(() => validatePipeline({
  ...base, nodes: [{ id: 'source', type: 'source', activityType: 'mysql.fetch', config: { connectionId: 'db', table: 'orders' } }],
}), /cursorColumn/);
assert.throws(() => validatePipeline({
  ...base, nodes: [{ id: 'sink', type: 'sink', activityType: 'sink.postgres', config: { connectionId: 'db', table: 'gold.orders', writeMode: 'apply-cdc', layer: 'gold' } }],
}), /primary key/);
assert.throws(() => validatePipeline({
  ...base, nodes: [{ ...base.nodes[0], config: { layer: 'platinum' } }],
}), /layer must be/);
assert.throws(() => validatePipeline({ ...base, slo: { freshnessMinutes: 0 } }), /freshnessMinutes/);
assert.throws(() => validatePipeline({ ...base, slo: { maxFailureRatePercent: 101 } }), /maxFailureRatePercent/);
assert.throws(() => validatePipeline({ ...base, notifications: { connectionId: 'not-a-uuid' } }), /connectionId/);
assert.throws(() => validatePipeline({ ...base, trigger: { type: 'event', topic: 'pipeline.completed.pipeline' } }), /trigger itself/);
assert.doesNotThrow(() => validatePipeline({ ...base, trigger: { type: 'asset', assetUrn: 'postgres://warehouse/bronze.orders' } }));
assert.throws(() => validatePipeline({ ...base, trigger: { type: 'asset', assetUrn: 'postgres://warehouse/orders?password=secret' } }), /stable URI/);
assert.throws(() => validatePipeline({
  ...base, trigger: { type: 'asset', assetUrn: 'postgres://warehouse/gold.orders' },
  nodes: [{ id: 'sink', type: 'sink', activityType: 'sink.postgres', config: { connectionId: 'warehouse', table: 'gold.orders' } }],
}), /cannot trigger itself/);
assert.doesNotThrow(() => validatePipeline({ ...base, nodes: [
  { id: 'source', type: 'source', activityType: 'kafka.fetch', config: { connectionId: 'kafka', topic: 'orders.v1', startPosition: 'earliest' } },
] }));
assert.throws(() => validatePipeline({ ...base, nodes: [
  { id: 'sink', type: 'sink', activityType: 'sink.kafka', config: { connectionId: 'kafka', topic: '../bad' } },
] }), /invalid topic/);
assert.throws(() => validatePipeline({
  ...base, nodes: [{ id: 'contract', type: 'transform', activityType: 'transform.contract', config: { schemaJson: '{bad' } }],
}), /valid JSON/);
assert.doesNotThrow(() => validatePipeline({
  ...base, nodes: [{ id: 'contract', type: 'transform', activityType: 'transform.contract', config: { schemaJson: { id: 'number' }, onViolation: 'quarantine' } }],
}));
assert.throws(() => validatePipeline({
  ...base, nodes: [{ id: 'rename', type: 'transform', activityType: 'transform.rename', config: { mapping: '{bad' } }],
}), /mapping must be valid JSON/);

for (const file of [
  'zendesk-to-postgres.json', 'medallion-bronze-orders.json',
  'medallion-silver-orders.json', 'medallion-gold-orders.json',
  'kafka-bronze-orders.json',
]) {
  const definition = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../examples', file), 'utf8'));
  assert.doesNotThrow(() => validatePipeline(definition), file);
}

console.log('pipeline validation tests passed');
