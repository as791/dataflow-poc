import type { PipelineDefinition, Environment } from '@dataflow/shared';
import { pool, withTenant } from './db';
import { fireExecution } from './temporal';

const DAY_MS = 86_400_000;
const SUPPORTED_SOURCES = new Set(['postgres.fetch', 'mysql.fetch', 'mongodb.fetch']);

export interface BackfillPlan {
  from: string; to: string; partitionDays: number; maxConcurrency: number;
  partitionCount: number; estimatedExecutions: number;
  partitions: Array<{ from: string; to: string }>;
}

export function planBackfill(input: any): BackfillPlan {
  const fromMs = Date.parse(input?.from), toMs = Date.parse(input?.to);
  const partitionDays = Number(input?.partitionDays ?? 1);
  const maxConcurrency = Number(input?.maxConcurrency ?? 1);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs)
    throw new Error('from and to must be valid ISO timestamps with from before to');
  if (!Number.isInteger(partitionDays) || partitionDays < 1 || partitionDays > 31)
    throw new Error('partitionDays must be an integer between 1 and 31');
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 5)
    throw new Error('maxConcurrency must be an integer between 1 and 5');
  const partitions = [];
  for (let cursor = fromMs; cursor < toMs; cursor += partitionDays * DAY_MS) {
    partitions.push({
      from: new Date(cursor).toISOString(),
      to: new Date(Math.min(toMs, cursor + partitionDays * DAY_MS)).toISOString(),
    });
    if (partitions.length > 366) throw new Error('backfill exceeds the 366 partition limit');
  }
  return {
    from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(),
    partitionDays, maxConcurrency, partitionCount: partitions.length,
    estimatedExecutions: partitions.length, partitions,
  };
}

export function validateBackfillSources(definition: PipelineDefinition): void {
  const sources = definition.nodes.filter(node => node.type === 'source');
  if (!sources.length) throw new Error('pipeline has no source');
  for (const source of sources) {
    if (!SUPPORTED_SOURCES.has(source.activityType))
      throw new Error(`${source.activityType}: partitioned backfill is supported only for PostgreSQL, MySQL, and MongoDB cursor sources`);
    if (source.config?.syncMode === 'cdc')
      throw new Error(`${source.activityType}: CDC sources cannot run partitioned backfills; switch to cursor mode`);
    if (source.config?.syncMode !== 'cursor')
      throw new Error(`${source.activityType}: partitioned backfills require cursor mode`);
    if (source.config?.cursorType !== 'date')
      throw new Error(`${source.activityType}: partitioned backfills require cursorType=date`);
    const cursorField = source.activityType === 'mongodb.fetch'
      ? source.config?.cursorField : source.config?.cursorColumn;
    if (!cursorField) throw new Error(`${source.activityType}: partitioned backfills require a cursor field`);
  }
}

export async function dispatchBackfillPartitions(limit = 20): Promise<number> {
  let started = 0;
  for (; started < limit; started++) {
    const { rows } = await pool.query(`SELECT * FROM claim_next_backfill_partition()`);
    const claimed = rows[0];
    if (!claimed) break;
    const definition = structuredClone(claimed.definition) as PipelineDefinition;
    for (const node of definition.nodes.filter(node => node.type === 'source')) {
      node.ingestion = {
        ...node.ingestion, mode: 'backfill',
        backfillStart: new Date(claimed.range_start).toISOString(),
        backfillEnd: new Date(claimed.range_end).toISOString(),
        stateKey: claimed.partition_id,
        pageSize: Math.max(Number(node.ingestion?.pageSize ?? 0), 10_000),
      };
    }
    try {
      await fireExecution(
        definition, claimed.pipeline_id, 'backfill', claimed.environment as Environment,
        undefined, undefined, undefined, claimed.partition_id,
      );
    } catch (error: any) {
      await withTenant(claimed.tenant_id, client => client.query(
        `WITH changed AS (
           UPDATE backfill_partitions SET status='failed',error=$2,completed_at=now() WHERE id=$1 RETURNING job_id
         )
         UPDATE backfill_jobs bj SET status='failed',completed_at=now()
           FROM changed WHERE bj.id=changed.job_id
            AND NOT EXISTS (SELECT 1 FROM backfill_partitions p
                              WHERE p.job_id=bj.id AND p.status IN ('pending','starting','running'))`,
        [claimed.partition_id, String(error?.message ?? error).slice(0, 2000)],
      ));
    }
  }
  return started;
}

export function startBackfillDispatcher(): void {
  const tick = async () => {
    try { await dispatchBackfillPartitions(); }
    catch (error: any) { console.error('backfill dispatcher failed', error.message); }
  };
  void tick();
  setInterval(tick, Number(process.env.BACKFILL_DISPATCH_INTERVAL_MS ?? 2000)).unref();
}
