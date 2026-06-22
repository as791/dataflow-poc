import { Router } from 'express';
import { withTenantTx } from '../db';
import { temporal } from '../temporal';

export const executions = Router();

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
    const { rows: e } = await client.query(`SELECT phase FROM executions WHERE id=$1`, [id]);
    const { rows: nr } = await client.query(`SELECT * FROM node_runs WHERE execution_id=$1`, [id]);
    return { dbPhase: e[0]?.phase ?? null, nodeRuns: nr };
  });

  // If the DB already marks this execution terminal, return immediately.
  const TERMINAL = ['completed', 'failed', 'cancelled'];
  if (dbRow.dbPhase && TERMINAL.includes(dbRow.dbPhase)) {
    res.json({ executionId: id, phase: dbRow.dbPhase, nodeRuns: dbRow.nodeRuns });
    return;
  }

  // Workflow still running — query the live status from Temporal.
  try {
    const c = await temporal();
    const handle = c.workflow.getHandle(id);
    const status = await handle.query('status');
    res.json(status);
  } catch {
    // Workflow unreachable (e.g. worker restart before markExecution fired).
    res.json({ executionId: id, phase: dbRow.dbPhase ?? 'unknown', nodeRuns: dbRow.nodeRuns });
  }
});

for (const action of ['pause', 'resume', 'cancel'] as const) {
  executions.post(`/:id/${action}`, async (req, res) => {
    const c = await temporal();
    await c.workflow.getHandle(req.params.id).signal(action);
    res.json({ ok: true });
  });
}
