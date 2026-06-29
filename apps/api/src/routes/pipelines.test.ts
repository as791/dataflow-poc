import assert from 'node:assert/strict';
import { buildLineageChangeHistory, promotionGate } from './pipelines';
import { hashOpenLineageKey } from '../lib/openlineage';

const issue = {
  assetUrn: 'postgres://warehouse/gold.orders', kind: 'field-removed' as const,
  field: 'email', message: 'gold.orders: field removed: email',
};

assert.match((promotionGate(false, [], false) as any).error, /successful Integration run/);
assert.match((promotionGate(true, [issue], false) as any).error, /breaking data contract/);
assert.deepEqual(promotionGate(true, [issue], true), { ok: true });
assert.deepEqual(promotionGate(true, [], false), { ok: true });
assert.equal(hashOpenLineageKey('token'), '3c469e9d6c5875d37a43f353d4f88e61fcf812c66eee3457465a40b0da4153e0');

const definition = (schemaJson: Record<string, string>) => ({
  id: 'pipeline', version: 1, name: 'orders', tenantId: 'tenant', trigger: { type: 'manual' as const },
  nodes: [
    { id: 'contract', type: 'transform' as const, activityType: 'transform.contract', config: { schemaJson } },
    { id: 'sink', type: 'sink' as const, activityType: 'sink.postgres', config: { connectionId: 'warehouse', table: 'gold.orders', layer: 'gold' } },
  ], edges: [{ id: 'edge', source: 'contract', target: 'sink' }],
});
const history = buildLineageChangeHistory([
  { id: 'v1', pipeline_key: 'pipeline', version: 1, name: 'orders', status: 'archived', environment: 'prod', definition: definition({ id: 'number', email: 'string' }), created_at: '2026-06-28T00:00:00Z' },
  { id: 'v2', pipeline_key: 'pipeline', version: 2, name: 'orders', status: 'active', environment: 'prod', definition: definition({ id: 'string' }), created_at: '2026-06-29T00:00:00Z' },
]);
assert.equal(history[0].fromVersion, 1);
assert.equal(history[0].toVersion, 2);
assert.equal(history[0].summary.breaking, 2);
assert.deepEqual(history[0].changes.filter(change => change.severity === 'breaking').map(change => change.kind).sort(), ['field-removed', 'field-type-changed']);

console.log('pipeline promotion tests passed');
