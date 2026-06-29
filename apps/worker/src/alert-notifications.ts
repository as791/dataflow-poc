import axios from 'axios';
import pino from 'pino';
import { pool } from './activities/db';
import { loadCredentialInstance } from './activities/connectors/credentials';

const log = pino({ name: 'alert-notifications' });

export const notificationRetryDelaySeconds = (attempt: number) =>
  Math.min(3600, 30 * 2 ** Math.min(Math.max(attempt - 1, 0), 7));

export function startAlertNotificationDispatcher() {
  let stopped = false, busy = false;
  const dispatch = async () => {
    if (stopped || busy) return;
    busy = true;
    const client = await pool.connect().catch(error => {
      log.warn({ err: error.message }, 'notification database unavailable'); return null;
    });
    if (!client) { busy = false; return; }
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id,tenant_id,alert_id,connection_id,payload,attempts
           FROM pipeline_alert_notification_outbox
          WHERE sent_at IS NULL AND attempts<10 AND next_attempt_at<=now()
          ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 5`);
      for (const row of rows) {
        try {
          const connector = await loadCredentialInstance(row.connection_id, row.tenant_id);
          if (connector.provider !== 'http' || !connector.extra.baseUrl) throw new Error('notification connector must be an HTTP credential');
          await axios.post(connector.extra.baseUrl, row.payload, {
            headers: {
              'Content-Type': 'application/json', 'X-DataFlow-Alert-ID': row.alert_id,
              ...(connector.secret.apiKey ? { Authorization: `Bearer ${connector.secret.apiKey}` } : {}),
            },
            timeout: 5000,
          });
          await client.query(`UPDATE pipeline_alert_notification_outbox SET sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1`, [row.id]);
        } catch (error: any) {
          const attempts = Number(row.attempts) + 1;
          const delay = notificationRetryDelaySeconds(attempts);
          await client.query(
            `UPDATE pipeline_alert_notification_outbox
                SET attempts=$2,last_error=$3,next_attempt_at=now()+make_interval(secs=>$4)
              WHERE id=$1`,
            [row.id, attempts, String(error.response?.data?.message ?? error.message ?? error).slice(0, 1000), delay],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code !== '42P01') log.warn({ err: error.message }, 'notification dispatch failed');
    } finally { client.release(); busy = false; }
  };
  const timer = setInterval(() => { void dispatch(); }, 2000);
  timer.unref(); void dispatch();
  return () => { stopped = true; clearInterval(timer); };
}
