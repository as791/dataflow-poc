import assert from 'node:assert/strict';
import { canRetryExecution, decodeExecutionCursor, encodeExecutionCursor, monitoringSummary, safeTraceValue } from './executions';
import { evaluatePipelineHealth } from '@dataflow/shared';

assert.deepEqual(monitoringSummary({ runs: '10', succeeded: '9', failed: '1', running: '0', avg_duration_ms: '1250' }), {
  runs: 10, succeeded: 9, failed: 1, running: 0, successRate: 90, avgDurationMs: 1250,
});
assert.equal(monitoringSummary({ runs: 0 }).successRate, null);
const cursor = { startedAt: '2026-06-29T12:00:00.000Z', id: 'exec-2' };
assert.deepEqual(decodeExecutionCursor(encodeExecutionCursor(cursor)), cursor);
assert.throws(() => decodeExecutionCursor('nope'), /invalid cursor|Unexpected token/);
assert.equal(canRetryExecution('failed'), true);
assert.equal(canRetryExecution('running'), false);
assert.deepEqual(safeTraceValue({ activityType: 'fetch', input: { password: 'secret' }, message: 'token=abc123' }), {
  activityType: 'fetch', message: 'token=[REDACTED]',
});

const health = evaluatePipelineHealth({
  runs: 10, failed: 2, avg_duration_ms: 2500,
  last_success_at: '2026-01-01T00:00:00Z',
  definition: { metadata: { owner: 'data@acme.test' }, slo: { freshnessMinutes: 30, maxFailureRatePercent: 10, maxDurationMs: 2000 } },
}, new Date('2026-01-01T02:00:00Z').getTime());
assert.equal(health.health, 'critical');
assert.deepEqual(health.breaches.map((item: any) => item.type), ['freshness', 'failure-rate', 'duration']);

console.log('execution monitoring tests passed');
