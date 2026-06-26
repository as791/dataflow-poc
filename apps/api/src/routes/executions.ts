import { Router } from 'express';
import { withTenantTx } from '../db';
import { temporal, namespaceFor } from '../temporal';
import type { Environment } from '@dataflow/shared';

export const executions = Router();

// Each execution lives in its environment's Temporal namespace, so status
// queries and signals must target that namespace.
async function temporalIdentityForExecution(req: any, id: string): Promise<{
  env: Environment; workflowId: string; runId?: string;
}> {
  return withTenantTx(req, async client => {
    const { rows } = await client.query(
      `SELECT environment, workflow_id, run_id FROM executions WHERE id=$1`,
      [id],
    );
    return {
      env: (rows[0]?.environment ?? 'test') as Environment,
      workflowId: rows[0]?.workflow_id ?? id,
      runId: rows[0]?.run_id ?? undefined,
    };
  });
}

// Run list with optional filters. No pagination — a workspace has a dozen runs (roadmap A2).
executions.get('/', async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: string[] = []; const params: any[] = [];
  const add = (col: string, val?: string) => { if (val) { params.push(val); where.push(`${col} = $${params.length}`); } };
  add('e.pipeline_id', q.pipeline);
  add('e.environment', q.env);
  add('e.phase', q.phase ?? q.status);
  if (q.from) { params.push(q.from); where.push(`e.started_at >= $${params.length}`); }
  if (q.to)   { params.push(q.to);   where.push(`e.started_at <= $${params.length}`); }
  const limit = Math.min(Math.max(parseInt(q.limit ?? '100', 10) || 100, 1), 500);
  const rows = await withTenantTx(req, c => c.query(
    `SELECT e.*, p.name FROM executions e JOIN pipelines p ON p.id = e.pipeline_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY started_at DESC LIMIT ${limit}`, params));
  res.json(rows.rows);
});

// Run detail: execution + node_runs + pipeline definition (nodes/edges).
executions.get('/:id', async (req, res) => {
  const data = await withTenantTx(req, async client => {
    const { rows: e } = await client.query(
      `SELECT e.*, p.name, p.definition FROM executions e
       JOIN pipelines p ON p.id = e.pipeline_id WHERE e.id = $1`, [req.params.id]);
    if (!e[0]) return null;
    const { rows: nodeRuns } = await client.query(
      `SELECT node_id, status, duration_ms, record_count, error, finished_at
         FROM node_runs WHERE execution_id = $1`, [req.params.id]);
    const { definition, ...execution } = e[0];
    return { execution, definition: { nodes: definition?.nodes ?? [], edges: definition?.edges ?? [] }, nodeRuns };
  });
  data ? res.json(data) : res.status(404).json({ error: 'not found' });
});

executions.get('/:id/status', async (req, res) => {
  const id = req.params.id;
  // Always read the DB phase — markExecution writes it when the workflow
  // finishes, and the Temporal query handler never returns 'completed'/'failed'.
  const dbRow = await withTenantTx(req, async client => {
    const { rows: e } = await client.query(
      `SELECT phase, environment, workflow_id, run_id FROM executions WHERE id=$1`,
      [id],
    );
    const { rows: nr } = await client.query(`SELECT * FROM node_runs WHERE execution_id=$1`, [id]);
    return {
      dbPhase: e[0]?.phase ?? null,
      env: (e[0]?.environment ?? 'test') as Environment,
      workflowId: e[0]?.workflow_id ?? id,
      runId: e[0]?.run_id ?? undefined,
      nodeRuns: nr,
    };
  });

  // If the DB already marks this execution terminal, return immediately.
  const TERMINAL = ['completed', 'failed', 'cancelled'];
  if (dbRow.dbPhase && TERMINAL.includes(dbRow.dbPhase)) {
    res.json({ executionId: id, phase: dbRow.dbPhase, nodeRuns: dbRow.nodeRuns });
    return;
  }

  // Workflow still running — query the live status from Temporal.
  try {
    const c = await temporal(namespaceFor(dbRow.env));
    const handle = c.workflow.getHandle(dbRow.workflowId, dbRow.runId);
    const status = await handle.query('status');
    res.json(status);
  } catch {
    // Workflow unreachable (e.g. worker restart before markExecution fired).
    res.json({ executionId: id, phase: dbRow.dbPhase ?? 'unknown', nodeRuns: dbRow.nodeRuns });
  }
});

for (const action of ['pause', 'resume', 'cancel'] as const) {
  executions.post(`/:id/${action}`, async (req, res) => {
    const identity = await temporalIdentityForExecution(req, req.params.id);
    const c = await temporal(namespaceFor(identity.env));
    await c.workflow.getHandle(identity.workflowId, identity.runId).signal(action);
    res.json({ ok: true });
  });
}
