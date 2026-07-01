import assert from 'node:assert/strict';
import { buildCdcConfig, GOOGLE_SCOPES, testInstance, validateCredentialInput } from './connectors';

validateCredentialInput('mysql',
  { host: 'mysql', database: 'app', user: 'cdc' }, { password: 'secret' });
assert.throws(() => validateCredentialInput('unknown', {}, {}), /unsupported credential provider/);
assert.throws(() => validateCredentialInput('s3', { region: 'us-east-1' }, {}), /accessKeyId/);
validateCredentialInput('kafka', { brokers: 'redpanda:9092', saslMechanism: 'none' }, {});
validateCredentialInput('sftp', { host: 'sftp.example.com', user: 'etl' }, { password: 'secret' });
validateCredentialInput('snowflake', { account: 'acme', user: 'etl', warehouse: 'LOAD', database: 'RAW' }, { password: 'secret' });
validateCredentialInput('iceberg', { url: 'https://catalog.example.com' }, { token: 'secret' });
assert.throws(() => validateCredentialInput('sftp', { host: 'sftp.example.com', user: 'etl' }, {}), /password or privateKey/);
assert.throws(() => validateCredentialInput('kafka', { brokers: 'missing-port' }, {}), /host:port/);
assert.throws(() => validateCredentialInput('kafka', { brokers: 'cloud:9092', saslMechanism: 'plain' }, {}), /username/);

const postgres = buildCdcConfig({
  id: 'connection', kind: 'credential', provider: 'postgres', secret: null,
  extra: { host: 'postgres', database: 'app', user: 'cdc' },
}, 'tenant', ['public.orders']);
assert.equal(postgres['connector.class'], 'io.debezium.connector.postgresql.PostgresConnector');
assert.equal(postgres['table.include.list'], 'public\\.orders');
assert.ok(postgres['topic.prefix'].startsWith('df_'));
assert(GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/spreadsheets'));
assert(!GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/spreadsheets.readonly'));

const mongo = buildCdcConfig({
  id: 'connection', kind: 'credential', provider: 'mongodb', secret: null,
  extra: { host: 'cluster.example.com', database: 'app', tls: true },
}, 'tenant', ['app.orders']);
assert.match(mongo['mongodb.connection.string'], /^mongodb\+srv:\/\//);

void assert.rejects(
  () => testInstance('tenant', { kind: 'oauth', provider: 'google', scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] }),
  /Reconnect Google/,
).then(() => console.log('connector route tests passed'));
