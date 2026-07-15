import * as assert from 'node:assert/strict';
import { flowToDefinition } from './pipelineConvert';
import { deriveStage, displayEnvironment } from './pipelineStage';

const definition = flowToDefinition([
  { id: 'source', type: 'flowNode', position: { x: 0, y: 0 }, data: { nodeType: 'source', activityType: 'http.fetch', label: 'Source', config: {} } },
  { id: 'sink', type: 'flowNode', position: { x: 1, y: 0 }, data: { nodeType: 'sink', activityType: 'sink.postgres', label: 'Sink', config: {} } },
] as any, [
  { id: 'edge', source: 'source', target: 'sink', data: {} },
], {
  name: 'test',
  pipelineKey: 'pipeline-test',
  trigger: { type: 'manual' },
  notifications: { connectionId: 'connection-1', minimumSeverity: 'critical' },
});

assert.deepEqual(definition.notifications, { connectionId: 'connection-1', minimumSeverity: 'critical' });
assert.equal(deriveStage('active', 'prod'), 'production');
assert.equal(displayEnvironment('test'), 'Integration');
console.log('pipelineConvert.test.ts OK');
