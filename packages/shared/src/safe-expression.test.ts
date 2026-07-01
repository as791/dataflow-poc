import assert from 'node:assert';
import {
  evaluateMapExpression,
  evaluateFormulaExpression,
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

assert.strictEqual(evaluateFormulaExpression('round(r.price * r.quantity * 1.18, 2)', { price: 10, quantity: 3 }), 35.4);
assert.strictEqual(evaluateFormulaExpression("concat(upper(r.country), '-', r.id)", { country: 'in', id: 7 }), 'IN-7');
assert.deepStrictEqual(evaluateMapExpression('({ label: concat(r.first, ", ", r.last), total: r.price * r.qty })', {
  first: 'Ada', last: 'Lovelace', price: 4, qty: 3,
}), { label: 'Ada, Lovelace', total: 12 });

assert.throws(
  () => validateSafeExpression('r.constructor.constructor("return process")()', 'predicate'),
  /unsafe property access|unsupported/,
);

assert.throws(
  () => validateSafeExpression('process.exit()', 'predicate'),
  /unsupported/,
);
assert.throws(() => validateSafeExpression('constructor(r.x)', 'formula'), /unsupported|unsafe/);
assert.throws(() => validateSafeExpression('r.x = 1', 'formula'), /unsupported/);

console.log('all safe-expression tests passed');
