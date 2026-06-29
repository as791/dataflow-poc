import Redis from 'ioredis';
import pino from 'pino';
import { pool } from './activities/db';

const log = pino({ name: 'pipeline-event-outbox' });
const STREAM = 'dataflow:pipeline-events';

export function startEventOutboxDispatcher() {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  let stopped = false, busy = false;

  const dispatch = async () => {
    if (stopped || busy) return;
    busy = true;
    const client = await pool.connect().catch(error => {
      log.warn({ err: error.message }, 'outbox database unavailable');
      return null;
    });
    if (!client) { busy = false; return; }
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id,tenant_id,environment,event_id,topic,payload
           FROM pipeline_event_outbox WHERE published_at IS NULL
          ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20`);
      for (const row of rows) {
        try {
          await redis.xadd(STREAM, '*',
            'tenantId', row.tenant_id, 'environment', row.environment,
            'eventId', row.event_id, 'topic', row.topic,
            'payload', JSON.stringify(row.payload));
          await client.query(`UPDATE pipeline_event_outbox SET published_at=now(),attempts=attempts+1,last_error=NULL WHERE id=$1`, [row.id]);
        } catch (error: any) {
          await client.query(`UPDATE pipeline_event_outbox SET attempts=attempts+1,last_error=$2 WHERE id=$1`, [row.id, String(error.message ?? error).slice(0, 1000)]);
        }
      }
      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.code !== '42P01') log.warn({ err: error.message }, 'outbox dispatch failed');
    } finally { client.release(); busy = false; }
  };

  const timer = setInterval(() => { void dispatch(); }, 1000);
  timer.unref();
  void dispatch();
  return async () => { stopped = true; clearInterval(timer); await redis.quit().catch(() => {}); };
}
