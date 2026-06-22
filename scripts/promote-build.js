#!/usr/bin/env node
// Promote a worker build to be the default for the task queue.
// Usage: node scripts/promote-build.js <buildId>
// In-flight workflows stay pinned to their old build; new ones get this build.
const { Connection, Client } = require('@temporalio/client');

(async () => {
  const buildId = process.argv[2];
  if (!buildId) { console.error('usage: promote-build.js <buildId>'); process.exit(1); }
  const connection = await Connection.connect({ address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233' });
  const client = new Client({ connection });
  await client.taskQueue.updateBuildIdCompatibility(process.env.TASK_QUEUE ?? 'dynamic-dag', {
    operation: 'addNewIdInNewDefaultSet', buildId,
  });
  console.log(`✓ build "${buildId}" is now the default. Old executions stay pinned to their builds.`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
