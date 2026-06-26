import assert from 'node:assert';
import { flattenRecord, parseRecordFields, dedupeRecords, buildPgUpsert } from './catalog';
import { mergeArrays } from './index';

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
  'INSERT INTO orders ("id","name") VALUES ($1,$2)');
assert.strictEqual(
  buildPgUpsert('orders', ['id', 'name'], ['id'], 2),
  'INSERT INTO orders ("id","name") VALUES ($1,$2),($3,$4) ON CONFLICT ("id") DO UPDATE SET "name"=EXCLUDED."name"');
// every column is a conflict key → nothing to update → DO NOTHING
assert.ok(buildPgUpsert('t', ['id'], ['id'], 1).endsWith('DO NOTHING'));
// compound conflict key
assert.ok(buildPgUpsert('t', ['id', 'c', 'v'], ['id', 'c'], 1).includes('ON CONFLICT ("id","c") DO UPDATE SET "v"=EXCLUDED."v"'));

console.log('catalog.test.ts: all assertions passed');
