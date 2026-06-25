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

executions.get('/', async (req, res) => {
  const rows = await withTenantTx(req, c => c.query(
    `SELECT e.*, p.name FROM executions e JOIN pipelines p ON p.id = e.pipeline_id
     ORDER BY started_at DESC LIMIT 100`));
  res.json(rows.rows);
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
