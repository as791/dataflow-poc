import assert from 'node:assert/strict';
import { buildWorkspaceLineage } from './lineage';
import { dataflowOpenLineageRunEvent, mergeExternalLineage, openLineageDatasetUrn, parseOpenLineageRunEvent } from './openlineage';
import type { PipelineDefinition } from './types';

const definition: PipelineDefinition = {
  id: 'pipeline', version: 1, tenantId: 'tenant', name: 'orders', trigger: { type: 'manual' },
  nodes: [
    { id: 'source', type: 'source', activityType: 'postgres.fetch', config: { connectionId: 'db', table: 'raw.orders' } },
    { id: 'sink', type: 'sink', activityType: 'sink.postgres', config: { connectionId: 'warehouse', table: 'bronze.orders' } },
  ], edges: [{ id: 'edge', source: 'source', target: 'sink' }],
};
const event = dataflowOpenLineageRunEvent({
  definition, pipelineKey: 'pipeline', executionId: 'exec-12345678-1234-1234-1234-123456789abc',
  tenantId: 'tenant', environment: 'prod', phase: 'completed', eventTime: '2026-06-29T12:00:00.000Z',
});
assert.equal(event.eventType, 'COMPLETE');
assert.equal(event.outputs?.[0].name, 'postgres://warehouse/bronze.orders');
assert.deepEqual(parseOpenLineageRunEvent(event).job, event.job);
assert.throws(() => parseOpenLineageRunEvent({ ...event, inputs: new Array(1001).fill({ namespace: 'x', name: 'y' }) }), /1000/);
assert.equal(openLineageDatasetUrn({ namespace: 'postgres', name: 'postgres://user:secret@db/orders?token=x' }), 'postgres://db/orders');

const graph = buildWorkspaceLineage([]);
const merged = mergeExternalLineage(graph, [{
  namespace: 'airflow', name: 'load_orders', environment: 'prod', eventTime: event.eventTime,
  inputs: [{ namespace: 'postgres', name: 'postgres://warehouse/bronze.orders' }],
  outputs: [{ namespace: 'snowflake', name: 'analytics.gold.orders' }],
}]);
assert.equal(merged.stats.externalJobs, 1);
assert(merged.nodes.some(node => node.kind === 'external-job'));
assert(merged.nodes.some(node => node.kind === 'asset' && node.asset.urn === 'postgres://warehouse/bronze.orders'));

console.log('openlineage tests passed');
