import assert from 'node:assert/strict';
import { planBackfill, validateBackfillSources } from './backfills';

const plan = planBackfill({
  from: '2026-01-01T00:00:00Z', to: '2026-01-06T00:00:00Z',
  partitionDays: 2, maxConcurrency: 2,
});
assert.equal(plan.partitionCount, 3);
assert.deepEqual(plan.partitions.at(-1), {
  from: '2026-01-05T00:00:00.000Z', to: '2026-01-06T00:00:00.000Z',
});
assert.throws(() => planBackfill({ from: 'bad', to: '2026-01-01' }), /valid ISO/);
assert.throws(() => planBackfill({ from: '2026-01-01', to: '2026-01-02', maxConcurrency: 6 }), /maxConcurrency/);

const definition: any = { nodes: [{ type: 'source', activityType: 'postgres.fetch', config: {
  syncMode: 'cursor', cursorType: 'date', cursorColumn: 'updated_at',
} }] };
assert.doesNotThrow(() => validateBackfillSources(definition));
delete definition.nodes[0].config.cursorType;
assert.throws(() => validateBackfillSources(definition), /cursorType=date/);
definition.nodes[0].config.cursorType = 'date';
definition.nodes[0].config.syncMode = 'cdc';
assert.throws(() => validateBackfillSources(definition), /CDC sources cannot/);
definition.nodes[0] = { type: 'source', activityType: 's3.fetch', config: {} };
assert.throws(() => validateBackfillSources(definition), /supported only/);

console.log('backfill tests passed');
