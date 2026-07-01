import assert from 'node:assert/strict';
import { CATALOG, catalogForFeatures } from '@dataflow/shared';
import { effectivePaidFeatures, pipelineUsesAdvancedConnectors, pipelineUsesRealtime, pipelineUsesStatefulProcessing } from './edition';

const enabled = effectivePaidFeatures([
  { feature: 'realtime', enabled: true },
  { feature: 'advancedConnectors', enabled: true },
]);
assert.equal(enabled.realtime, true);
assert.equal(enabled.advancedConnectors, true);

const coreCatalog = catalogForFeatures(CATALOG, { ...enabled, realtime: false, statefulProcessing: false });
assert(!coreCatalog.some(entry => entry.activityType === 'kafka.fetch' || entry.activityType === 'sink.kafka'));
assert(!coreCatalog.flatMap(entry => entry.fields).some(field => field.options?.includes('cdc')));

assert.equal(pipelineUsesRealtime({ nodes: [{ activityType: 'postgres.fetch', config: { syncMode: 'cdc' } }] } as any), true);
assert.equal(pipelineUsesRealtime({ nodes: [{ activityType: 'postgres.fetch', config: { syncMode: 'cursor' } }] } as any), false);
assert.equal(pipelineUsesStatefulProcessing({ nodes: [{ activityType: 'transform.dedupe', config: { scope: 'pipeline' } }] } as any), true);
assert.equal(pipelineUsesAdvancedConnectors({ nodes: [{ activityType: 'sftp.fetch', config: {} }] } as any), true);

console.log('paid feature tests passed');
