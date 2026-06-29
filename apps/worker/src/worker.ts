import { Worker, NativeConnection } from '@temporalio/worker';
import { initOtel } from './otel';
import * as activities from './activities';
import { encryptedDataConverter } from './temporal-data-converter';
import pino from 'pino';
import { startEventOutboxDispatcher } from './event-outbox';
import { startAlertNotificationDispatcher } from './alert-notifications';
import { startOpenLineageDispatcher } from './openlineage';

const log = pino({ name: 'worker' });

/**
 * ─── Dev → Prod "actor model" deployment ─────────────────────────────────
 * This process is the TypeScript activity worker. Workflow orchestration is
 * owned by apps/workflow-go; keeping activities on a separate task queue lets
 * the Go and TypeScript SDKs cooperate without competing for task types.
 *
 * Every activity worker image carries a BUILD_ID (e.g. git SHA). Workers can
 * register with `useVersioning: true`:
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
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    activities,
    taskQueue: process.env.TASK_QUEUE ?? 'dynamic-activities-test',
    buildId,
    useVersioning: process.env.USE_VERSIONING === 'true',
    maxConcurrentActivityTaskExecutions: 20,
    dataConverter: encryptedDataConverter,
  });

  log.info({ buildId, taskQueue: worker.options.taskQueue }, 'worker started');
  const stopOutbox = startEventOutboxDispatcher();
  const stopNotifications = startAlertNotificationDispatcher();
  const stopOpenLineage = startOpenLineageDispatcher();
  try { await worker.run(); } finally { stopOpenLineage(); stopNotifications(); await stopOutbox(); }
}

main().catch(err => { log.error(err); process.exit(1); });
