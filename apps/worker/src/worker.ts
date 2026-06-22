import { Worker, NativeConnection } from '@temporalio/worker';
import { initOtel } from './otel';
import * as activities from './activities';
import { encryptedDataConverter } from './temporal-data-converter';
import pino from 'pino';

const log = pino({ name: 'worker' });

/**
 * ─── Dev → Prod "actor model" deployment ─────────────────────────────────
 * Every worker image carries a BUILD_ID (e.g. git SHA). Workers register
 * with `useVersioning: true`. Each workflow execution is an isolated actor
 * PINNED to the build that started it:
 *
 *   - New executions route to the queue's *default* build ID.
 *   - In-flight executions keep replaying on their original build —
 *     old image keeps running until they drain. Zero broken replays.
 *   - Promotion = one CLI/API call flipping the default (scripts/promote-build.js).
 *   - Rollback = flip the default back. Bad builds never touch old actors.
 */
async function main() {
  initOtel('dataflow-worker');
  const buildId = process.env.BUILD_ID ?? 'dev-local';

  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    workflowsPath: require.resolve('./workflows/dynamic-dag'),
    activities,
    taskQueue: process.env.TASK_QUEUE ?? 'dynamic-dag',
    buildId,
    useVersioning: process.env.USE_VERSIONING === 'true',
    maxConcurrentActivityTaskExecutions: 20,
    dataConverter: encryptedDataConverter,
  });

  log.info({ buildId, taskQueue: worker.options.taskQueue }, 'worker started');
  await worker.run();
}

main().catch(err => { log.error(err); process.exit(1); });
