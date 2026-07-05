import { test } from '@playwright/test';
import { DeployedAPI, required } from './deployed-api';
import { bucket } from './external';

const cases = [
  ['postgres', 'postgres.fetch', () => ({ table: required('QA_POSTGRES_TABLE') })],
  ['mysql', 'mysql.fetch', () => ({ table: required('QA_MYSQL_TABLE') })],
  ['mongodb', 'mongodb.fetch', () => ({ collection: required('QA_MONGODB_COLLECTION') })],
] as const;

for (const [provider, activityType, resource] of cases) {
  test(`P1 real ${provider} CDC source reaches an external S3 sink`, async ({ request }) => {
    const api = new DeployedAPI(request);
    await api.login();
    const [database, s3] = await Promise.all([api.connection(provider), api.connection('s3')]);
    await api.run(`qa-${provider}-cdc-${Date.now()}`, [
      { id: 'src', type: 'source', activityType, config: { connectionId: database, syncMode: 'cdc', ...resource() } },
      { id: 'sink', type: 'sink', activityType: 'sink.s3', config: { connectionId: s3, bucket, key: `runs/${provider}-cdc-${Date.now()}.json`, format: 'json' } },
    ], [{ id: 'e1', source: 'src', target: 'sink' }]);
  });
}
