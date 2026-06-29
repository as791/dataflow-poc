import assert from 'node:assert';
import {
  evaluateMapExpression,
  deriveMapFieldLineage,
  evaluatePredicate,
  validateSafeExpression,
} from './safe-expression';

assert.strictEqual(
  evaluatePredicate("r.status !== 'deleted' && r.priority >= 2", {
    r: { status: 'open', priority: 3 },
  }),
  true,
);

assert.strictEqual(
  evaluatePredicate('records.length > 0', { records: [{ id: 1 }] }),
  true,
);

assert.deepStrictEqual(
  evaluateMapExpression(
    '({ id: r.id, subject: r.subject, active: true })',
    { id: 7, subject: 'hello', ignored: 'value' },
  ),
  { id: 7, subject: 'hello', active: true },
);

assert.deepStrictEqual(deriveMapFieldLineage('({ order_id: r.id, total: r.amount, active: true })'), [
  { outputField: 'order_id', inputFields: ['id'] },
  { outputField: 'total', inputFields: ['amount'] },
  { outputField: 'active', inputFields: [] },
]);

assert.throws(
  () => validateSafeExpression('r.constructor.constructor("return process")()', 'predicate'),
  /unsafe property access|unsupported/,
);

assert.throws(
  () => validateSafeExpression('process.exit()', 'predicate'),
  /unsupported/,
);

console.log('all safe-expression tests passed');
