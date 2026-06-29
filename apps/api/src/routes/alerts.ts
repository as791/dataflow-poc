import { Router } from 'express';
import { withTenantTx } from '../db';
import { auditLog } from '../middleware/audit';

export const alerts = Router();

alerts.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'active';
  if (!['active', 'open', 'acknowledged', 'resolved', 'all'].includes(status)) {
    return res.status(400).json({ error: 'invalid alert status' });
  }
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? 100), 10) || 100, 1), 500);
  const rows = await withTenantTx(req, client => client.query(
    `SELECT a.*, p.name AS pipeline_name, p.environment,
            u.email AS acknowledged_by_email,
            delivery.sent_at AS notification_sent_at,
            delivery.attempts AS notification_attempts,
            delivery.last_error AS notification_error
       FROM pipeline_alerts a JOIN pipelines p ON p.id=a.pipeline_id
       LEFT JOIN users u ON u.id=a.acknowledged_by
       LEFT JOIN LATERAL (
         SELECT sent_at,attempts,last_error FROM pipeline_alert_notification_outbox
          WHERE alert_id=a.id ORDER BY created_at DESC LIMIT 1
       ) delivery ON true
      WHERE ($1='all' OR ($1='active' AND a.status IN ('open','acknowledged')) OR a.status=$1)
      ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END, a.last_seen_at DESC
      LIMIT $2`, [status, limit],
  ));
  res.json(rows.rows);
});

alerts.post('/:id/acknowledge', async (req, res) => {
  const row = await withTenantTx(req, async client => {
    const { rows } = await client.query(
      `UPDATE pipeline_alerts SET status='acknowledged', acknowledged_at=now(), acknowledged_by=$2
        WHERE id=$1 AND status='open' RETURNING *`, [req.params.id, req.tenant.userId]);
    return rows[0];
  });
  if (!row) return res.status(404).json({ error: 'open alert not found' });
  await auditLog(req, 'pipeline_alert.acknowledged', row.id, { pipelineId: row.pipeline_id, kind: row.kind });
  res.json(row);
});

alerts.post('/:id/resolve', async (req, res) => {
  const row = await withTenantTx(req, async client => {
    const { rows } = await client.query(
      `UPDATE pipeline_alerts SET status='resolved', resolved_at=now()
        WHERE id=$1 AND status IN ('open','acknowledged') RETURNING *`, [req.params.id]);
    return rows[0];
  });
  if (!row) return res.status(404).json({ error: 'active alert not found' });
  await auditLog(req, 'pipeline_alert.resolved', row.id, { pipelineId: row.pipeline_id, kind: row.kind });
  res.json(row);
});

alerts.post('/:id/retry-notification', async (req, res) => {
  const row = await withTenantTx(req, async client => {
    const { rows } = await client.query(
      `UPDATE pipeline_alert_notification_outbox n
          SET attempts=0,next_attempt_at=now(),last_error=NULL
         FROM pipeline_alerts a
        WHERE n.alert_id=a.id AND a.id=$1 AND n.sent_at IS NULL
        RETURNING n.id`, [req.params.id]);
    return rows[0];
  });
  if (!row) return res.status(404).json({ error: 'failed or pending notification not found' });
  await auditLog(req, 'pipeline_alert.notification_retried', req.params.id);
  res.json({ ok: true });
});
