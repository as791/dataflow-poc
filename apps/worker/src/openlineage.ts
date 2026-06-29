import axios from 'axios';
import pino from 'pino';
import { pool } from './activities/db';

const log = pino({ name: 'openlineage' });

export const openLineageEndpoint = (base: string) => {
  const url = new URL(base);
  if (!url.pathname.endsWith('/api/v1/lineage')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/api/v1/lineage`;
  }
  return url.toString();
};
export const openLineageRetryDelaySeconds = (attempt: number) =>
  Math.min(3600, 10 * 2 ** Math.min(Math.max(attempt - 1, 0), 9));

export function startOpenLineageDispatcher() {
  const base = process.env.OPENLINEAGE_URL;
  if (!base) return () => {};
  const endpoint = openLineageEndpoint(base);
  let stopped = false, busy = false;
  const dispatch = async () => {
    if (stopped || busy) return;
    busy = true;
    const client = await pool.connect().catch(error => {
      log.warn({ err: error.message }, 'OpenLineage database unavailable'); return null;
    });
    if (!client) { busy = false; return; }
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id,payload,attempts FROM openlineage_outbox
          WHERE sent_at IS NULL AND attempts<10 AND next_attempt_at<=now()
          ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 20`);
      for (const row of rows) {
        try {
          await axios.post(endpoint, row.payload, {
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.OPENLINEAGE_API_KEY ? { Authorization: `Bearer ${process.env.OPENLINEAGE_API_KEY}` } : {}),
            },
            timeout: 5000,
          });
          await client.query(`UPDATE openlineage_outbox SET sent_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1`, [row.id]);
        } catch (error: any) {
          const attempts = Number(row.attempts) + 1;
          await client.query(
            `UPDATE openlineage_outbox SET attempts=$2,last_error=$3,
                    next_attempt_at=now()+make_interval(secs=>$4) WHERE id=$1`,
            [row.id, attempts, String(error.response?.data?.message ?? error.message ?? error).slice(0, 1000),
             openLineageRetryDelaySeconds(attempts)],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code !== '42P01') log.warn({ err: error.message }, 'OpenLineage dispatch failed');
    } finally { client.release(); busy = false; }
  };
  const timer = setInterval(() => { void dispatch(); }, 2000);
  timer.unref(); void dispatch();
  return () => { stopped = true; clearInterval(timer); };
}
