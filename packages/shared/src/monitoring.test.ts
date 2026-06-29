import assert from 'node:assert/strict';
import { evaluatePipelineHealth } from './monitoring';

const health = evaluatePipelineHealth({
  runs: 10, failed: 2, avg_duration_ms: 2500, last_phase: 'failed',
  last_success_at: '2026-01-01T00:00:00Z',
  definition: { metadata: { owner: 'data@acme.test' }, slo: { freshnessMinutes: 30, maxFailureRatePercent: 10, maxDurationMs: 2000 } },
}, new Date('2026-01-01T02:00:00Z').getTime());
assert.equal(health.health, 'critical');
assert.deepEqual(health.breaches.map(item => item.type), ['execution-failed', 'freshness', 'failure-rate', 'duration']);
assert.equal(evaluatePipelineHealth({ definition: { metadata: { owner: 'team' } } }).health, 'unmonitored');

console.log('monitoring tests passed');
