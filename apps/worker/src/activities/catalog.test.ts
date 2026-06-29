import assert from 'node:assert';
import { applyDataContract, flattenRecord, parseRecordFields, dedupeRecords, buildPgSourceQuery, buildPgUpsert, buildPgDelete, safeClickHouseTable } from './catalog';
import { buildAssetMaterializationEvent, mergeArrays } from './index';
import { buildMysqlDelete, buildMysqlSourceQuery, buildMysqlUpsert } from './connectors/mysql';
import { buildMongoCursorFilter } from './connectors/mongodb';
import { decodeKafkaRecord, validKafkaTopic } from './connectors/kafka';
import { collapseCdcEvents, deriveCdcTopic, normalizeDebeziumMessage } from './connectors/debezium';

// ── A4: flatten — nested depth, custom delimiter, depth ceiling, array policies ──
assert.deepStrictEqual(flattenRecord({ a: { b: { c: 1 } }, x: 2 }), { 'a.b.c': 1, x: 2 });
assert.deepStrictEqual(flattenRecord({ a: { b: 1 } }, '_'), { a_b: 1 });
assert.deepStrictEqual(flattenRecord({ a: { b: { c: 1 } } }, '.', 1), { 'a.b': { c: 1 } });
assert.deepStrictEqual(flattenRecord({ items: [{ id: 1 }, 'x'] }), { 'items.0.id': 1, 'items.1': 'x' });
assert.deepStrictEqual(flattenRecord({ tags: [1, 2] }, '.', 10, 'stringify'), { tags: '[1,2]' });
assert.deepStrictEqual(flattenRecord({ tags: [1, 2] }, '.', 10, 'keep'), { tags: [1, 2] });

// ── A4: parse — valid, and bad JSON across onError modes ──
assert.deepStrictEqual(parseRecordFields({ p: '{"a":1}' }, ['p']), { p: { a: 1 } });
assert.deepStrictEqual(parseRecordFields({ p: 'nope' }, ['p'], 'skip'), { p: 'nope' });
assert.deepStrictEqual(parseRecordFields({ p: 'nope' }, ['p'], 'null'), { p: null });
assert.throws(() => parseRecordFields({ p: 'nope' }, ['p'], 'fail'), /not valid JSON/);
assert.deepStrictEqual(parseRecordFields({ p: { a: 1 }, q: 5 }, ['p', 'q', 'missing']), { p: { a: 1 }, q: 5 });

// Data contracts enforce required/optional types and optionally drop violations.
const contract = { id: 'number', email: 'string', updated_at: 'date?' };
assert.deepStrictEqual(applyDataContract([{ id: 1, email: 'a@b.test' }], contract), [{ id: 1, email: 'a@b.test' }]);
assert.throws(() => applyDataContract([{ id: '1', email: 'a@b.test' }], contract), /id must be number/);
assert.deepStrictEqual(applyDataContract([{ id: 1, email: 'ok' }, { id: 2 }], contract, 'drop'), [{ id: 1, email: 'ok' }]);
assert.deepStrictEqual(applyDataContract([{ id: 1, email: 'ok' }, { id: 2 }], contract, 'quarantine'), [{ id: 1, email: 'ok' }]);
assert.throws(() => applyDataContract([{ id: 1, email: 'ok', extra: true }], contract, 'fail', false), /extra fields/);

// ── A5: merge strategies ──
const left = [{ id: 1, a: 'x' }, { id: 2, a: 'y' }, { id: 3, a: 'z' }];
const right = [{ id: 2, b: 'Y' }, { id: 3, b: 'Z' }, { id: 4, b: 'W' }];
assert.strictEqual(mergeArrays('concat', [left, right]).length, 6);
const inner = mergeArrays('innerJoin', [left, right], 'id');
assert.strictEqual(inner.length, 2);
assert.deepStrictEqual(inner[0], { id: 2, a: 'y', b: 'Y' });
const lj = mergeArrays('leftJoin', [left, right], 'id');
assert.strictEqual(lj.length, 3); assert.strictEqual(lj[0].b, undefined); assert.strictEqual(lj[1].b, 'Y');
assert.strictEqual(mergeArrays('outerJoin', [left, right], 'id').length, 4);
assert.strictEqual(mergeArrays('union', [[{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]]).length, 3);
const tagged = mergeArrays('appendWithSourceTag', [left, right]);
assert.strictEqual(tagged[0]._source, 0); assert.strictEqual(tagged[3]._source, 1);
assert.throws(() => mergeArrays('innerJoin', [left, right]), /joinKey/);

// ── A5: compound-key dedupe + keep ──
const dupes = [
  { id: 1, c: 'US', v: 'a' }, { id: 1, c: 'US', v: 'b' },
  { id: 1, c: 'CA', v: 'c' }, { id: 2, c: 'US', v: 'd' },
];
assert.strictEqual(dedupeRecords(dupes, 'id', 'first').length, 2);
assert.strictEqual(dedupeRecords(dupes, ['id', 'c'], 'first').length, 3);
assert.strictEqual(dedupeRecords(dupes, 'id, c', 'first').length, 3);
assert.strictEqual(dedupeRecords(dupes, ['id', 'c'], 'first')[0].v, 'a');
assert.strictEqual(dedupeRecords(dupes, ['id', 'c'], 'last')[0].v, 'b');

// ── A6: sink.postgres upsert SQL builder ──
assert.strictEqual(
  buildPgUpsert('orders', ['id', 'name'], [], 1),
  'INSERT INTO "orders" ("id","name") VALUES ($1,$2)');
assert.strictEqual(
  buildPgUpsert('orders', ['id', 'name'], ['id'], 2),
  'INSERT INTO "orders" ("id","name") VALUES ($1,$2),($3,$4) ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name"');
// every column is a conflict key → nothing to update → DO NOTHING
assert.ok(buildPgUpsert('t', ['id'], ['id'], 1).endsWith('DO NOTHING'));
// compound conflict key
assert.ok(buildPgUpsert('t', ['id', 'c', 'v'], ['id', 'c'], 1).includes('ON CONFLICT ("id","c") DO UPDATE SET "v"=EXCLUDED."v"'));
assert.throws(() => buildPgUpsert('orders;drop', ['id'], [], 1), /invalid PostgreSQL identifier/);

// ── MVP Postgres source: safe identifiers, cursor pagination, look-ahead ──
assert.deepStrictEqual(buildPgSourceQuery('public.orders', 'id,total', 'updated_at', null, 100), {
  sql: 'SELECT "id","total","updated_at" FROM "public"."orders" ORDER BY "updated_at" ASC LIMIT $1',
  params: [101],
});
assert.deepStrictEqual(buildPgSourceQuery('orders', '*', 'id', 50, 20), {
  sql: 'SELECT * FROM "orders" WHERE "id" > $1 ORDER BY "id" ASC LIMIT $2',
  params: [50, 21],
});
assert.deepStrictEqual(buildPgSourceQuery('orders', '*', 'created_at', null, 20, '2026-01-01', '2026-02-01'), {
  sql: 'SELECT * FROM "orders" WHERE "created_at" >= $1 AND "created_at" < $2 ORDER BY "created_at" ASC LIMIT $3',
  params: ['2026-01-01', '2026-02-01', 21],
});
assert.deepStrictEqual(buildPgSourceQuery('orders', '*', 'created_at', '2026-01-15', 20, '2026-01-01', '2026-02-01'), {
  sql: 'SELECT * FROM "orders" WHERE "created_at" > $1 AND "created_at" < $2 ORDER BY "created_at" ASC LIMIT $3',
  params: ['2026-01-15', '2026-02-01', 21],
});
assert.throws(() => buildPgSourceQuery('orders;drop table users', '*', 'id', null, 10), /invalid PostgreSQL identifier/);
assert.strictEqual(safeClickHouseTable('analytics.events'), 'analytics.events');
assert.throws(() => safeClickHouseTable('events;DROP TABLE users'), /table must be/);
assert.deepStrictEqual(buildMysqlSourceQuery('app.orders', 'id,total', 'id', 10, 50), {
  sql: 'SELECT `id`,`total` FROM `app`.`orders` WHERE `id` > ? ORDER BY `id` ASC LIMIT ?',
  params: [10, 51],
});
assert.deepStrictEqual(buildMysqlSourceQuery('orders', '*', 'created_at', null, 50, '2026-01-01', '2026-02-01'), {
  sql: 'SELECT * FROM `orders` WHERE `created_at` >= ? AND `created_at` < ? ORDER BY `created_at` ASC LIMIT ?',
  params: ['2026-01-01', '2026-02-01', 51],
});
assert.deepStrictEqual(buildMongoCursorFilter('createdAt', undefined, new Date('2026-01-01'), new Date('2026-02-01')), {
  createdAt: { $gte: new Date('2026-01-01'), $lt: new Date('2026-02-01') },
});
assert.deepStrictEqual(buildMongoCursorFilter('createdAt', new Date('2026-01-15'), new Date('2026-01-01'), new Date('2026-02-01')), {
  createdAt: { $gt: new Date('2026-01-15'), $lt: new Date('2026-02-01') },
});
assert.deepStrictEqual(decodeKafkaRecord({
  topic: 'orders', partition: 1, offset: '7', key: Buffer.from('42'),
  value: Buffer.from('{"id":42}'), timestamp: '1000', headers: { source: Buffer.from('checkout') },
}), { id: 42, _kafka: { topic: 'orders', partition: 1, offset: '7', key: '42', timestamp: '1000', headers: { source: 'checkout' } } });
assert.equal(validKafkaTopic('orders.v1'), 'orders.v1');
assert.throws(() => validKafkaTopic('../orders'), /Kafka topic/);
assert.throws(() => decodeKafkaRecord({ topic: 'orders', partition: 0, offset: '8', key: null,
  value: Buffer.from('{bad'), timestamp: '1000' }), /invalid JSON/);
const assetEvent = buildAssetMaterializationEvent({
  executionId: 'exec-1', pipelineId: 'pipeline-1', nodeId: 'sink',
  asset: { urn: 'postgres://warehouse/bronze.orders', platform: 'postgres', namespace: 'warehouse', name: 'bronze.orders', type: 'table' },
  recordCount: 3, materializedAt: '2026-06-29T00:00:00.000Z',
});
assert.equal(assetEvent.topic, 'asset.materialized.postgres://warehouse/bronze.orders');
assert.equal(assetEvent.payload.recordCount, 3);
assert.ok(buildMysqlUpsert('orders', ['id', 'total'], 2).includes('ON DUPLICATE KEY UPDATE'));
assert.throws(() => buildMysqlSourceQuery('orders;drop', '*', 'id', null, 10), /invalid MySQL identifier/);

// CDC normalization, last-event collapse, and idempotent delete SQL.
const cdc = normalizeDebeziumMessage({
  topic: 'db.public.orders', partition: 0, offset: '12',
  key: Buffer.from('{"payload":{"id":7}}'),
  value: Buffer.from('{"payload":{"op":"u","before":{"id":7,"total":1},"after":{"id":7,"total":2},"ts_ms":1000,"source":{"connector":"postgresql","db":"app","schema":"public","table":"orders"}}}'),
})!;
assert.strictEqual(cdc.op, 'update');
assert.strictEqual(cdc.source.provider, 'postgres');
assert.strictEqual(cdc.after?.total, 2);
assert.strictEqual(normalizeDebeziumMessage({ topic: 't', partition: 0, offset: '1', key: null, value: null }), null);
const mongoCdc = normalizeDebeziumMessage({
  topic: 'db.app.orders', partition: 0, offset: '2',
  key: Buffer.from('{"id":"{\\"$oid\\":\\"507f1f77bcf86cd799439011\\"}"}'),
  value: Buffer.from('{"op":"d","before":null,"after":null,"ts_ms":1000,"source":{"connector":"mongodb","db":"app","collection":"orders"}}'),
})!;
assert.deepStrictEqual(mongoCdc.key, { _id: { $oid: '507f1f77bcf86cd799439011' } });
const collapsed = collapseCdcEvents([
  cdc,
  { ...cdc, op: 'delete', after: null, before: cdc.after },
], ['id']);
assert.deepStrictEqual(collapsed.upserts, []);
assert.deepStrictEqual(collapsed.deletes, [{ id: 7 }]);
assert.strictEqual(buildPgDelete('orders', ['id'], 2), 'DELETE FROM "orders" WHERE ("id"=$1) OR ("id"=$2)');
assert.strictEqual(buildMysqlDelete('orders', ['id'], 2), 'DELETE FROM `orders` WHERE (`id`=?) OR (`id`=?)');
assert.strictEqual(deriveCdcTopic({ enabled: true, topicPrefix: 'df_x', resources: ['app.orders'] }, 'orders'), 'df_x.app.orders');
assert.throws(() => deriveCdcTopic({ enabled: true, topicPrefix: 'df_x', resources: ['a.orders', 'b.orders'] }, 'orders'), /not uniquely allowlisted/);

console.log('catalog.test.ts: all assertions passed');
