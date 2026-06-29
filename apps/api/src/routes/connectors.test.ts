import assert from 'node:assert/strict';
import { buildCdcConfig, validateCredentialInput } from './connectors';

validateCredentialInput('mysql',
  { host: 'mysql', database: 'app', user: 'cdc' }, { password: 'secret' });
assert.throws(() => validateCredentialInput('unknown', {}, {}), /unsupported credential provider/);
assert.throws(() => validateCredentialInput('s3', { region: 'us-east-1' }, {}), /accessKeyId/);
validateCredentialInput('kafka', { brokers: 'redpanda:9092', saslMechanism: 'none' }, {});
assert.throws(() => validateCredentialInput('kafka', { brokers: 'missing-port' }, {}), /host:port/);
assert.throws(() => validateCredentialInput('kafka', { brokers: 'cloud:9092', saslMechanism: 'plain' }, {}), /username/);

const postgres = buildCdcConfig({
  id: 'connection', kind: 'credential', provider: 'postgres', secret: null,
  extra: { host: 'postgres', database: 'app', user: 'cdc' },
}, 'tenant', ['public.orders']);
assert.equal(postgres['connector.class'], 'io.debezium.connector.postgresql.PostgresConnector');
assert.equal(postgres['table.include.list'], 'public\\.orders');
assert.ok(postgres['topic.prefix'].startsWith('df_'));

const mongo = buildCdcConfig({
  id: 'connection', kind: 'credential', provider: 'mongodb', secret: null,
  extra: { host: 'cluster.example.com', database: 'app', tls: true },
}, 'tenant', ['app.orders']);
assert.match(mongo['mongodb.connection.string'], /^mongodb\+srv:\/\//);

console.log('connector route tests passed');
