export interface PipelineBreach {
  type: string;
  severity: 'warning' | 'critical';
  message: string;
}

export interface PipelineHealthInput {
  runs?: number | string;
  failed?: number | string;
  avg_duration_ms?: number | string;
  last_success_at?: string | Date | null;
  last_phase?: string | null;
  definition?: { metadata?: { owner?: string }; slo?: {
    freshnessMinutes?: number; maxFailureRatePercent?: number; maxDurationMs?: number;
  } };
  [key: string]: unknown;
}

export function evaluatePipelineHealth(row: PipelineHealthInput, now = Date.now()) {
  const definition = row.definition ?? {};
  const metadata = definition.metadata ?? {};
  const slo = definition.slo ?? {};
  const runs = Number(row.runs ?? 0), failed = Number(row.failed ?? 0);
  const avgDurationMs = Number(row.avg_duration_ms ?? 0);
  const breaches: PipelineBreach[] = [];
  if (row.last_phase === 'failed') breaches.push({ type: 'execution-failed', severity: 'critical', message: 'Latest execution failed' });
  if (!metadata.owner) breaches.push({ type: 'ownership', severity: 'warning', message: 'No pipeline owner assigned' });
  if (slo.freshnessMinutes) {
    const ageMinutes = row.last_success_at ? (now - new Date(row.last_success_at).getTime()) / 60_000 : Infinity;
    if (ageMinutes > Number(slo.freshnessMinutes)) breaches.push({
      type: 'freshness', severity: 'critical',
      message: row.last_success_at ? `Last success is ${Math.floor(ageMinutes)}m old` : 'Pipeline has never completed successfully',
    });
  }
  if (slo.maxFailureRatePercent !== undefined && runs > 0) {
    const rate = (failed / runs) * 100;
    if (rate > Number(slo.maxFailureRatePercent)) breaches.push({
      type: 'failure-rate', severity: 'critical', message: `${rate.toFixed(1)}% failure rate exceeds ${slo.maxFailureRatePercent}%`,
    });
  }
  if (slo.maxDurationMs && avgDurationMs > Number(slo.maxDurationMs)) breaches.push({
    type: 'duration', severity: 'warning', message: `Average duration exceeds ${Math.round(Number(slo.maxDurationMs) / 1000)}s`,
  });
  const hasSlo = Object.values(slo).some(value => value !== undefined && value !== null);
  const health = breaches.some(item => item.severity === 'critical') ? 'critical'
    : breaches.length ? 'warning' : hasSlo ? 'healthy' : 'unmonitored';
  const { definition: _definition, ...pipeline } = row;
  return { ...pipeline, runs, failed, avg_duration_ms: avgDurationMs, metadata, slo, breaches, health };
}
