import { expect, test } from '@playwright/test';
import { DeployedAPI, required, type Node } from './deployed-api';
import { bucket, readS3Json } from './external';

const s3Source = (connectionId: string, key: string): Node => ({
  id: 'src', type: 'source', activityType: 's3.fetch',
  config: { connectionId, bucket, key, format: 'json' },
});
const s3Sink = (connectionId: string, key: string, id = 'sink'): Node => ({
  id, type: 'sink', activityType: 'sink.s3',
  config: { connectionId, bucket, key, format: 'json' },
});

test('P2 map, filter, formula, rename and select compose correctly', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const key = `runs/p2-transform-chain-${Date.now()}.json`;
  await api.run(`p2-transform-chain-${Date.now()}`, [
    s3Source(s3, 'fixtures/orders.json'),
    { id: 'filter', type: 'transform', activityType: 'transform.filter', config: { predicate: "r.status === 'paid'" } },
    { id: 'formula', type: 'transform', activityType: 'transform.formula', config: { outputField: 'gross', expression: 'round(r.amount * 1.18, 2)' } },
    { id: 'map', type: 'transform', activityType: 'transform.map', config: { expression: '({ id: r.id, customer: r.customer, gross: r.gross })' } },
    { id: 'rename', type: 'transform', activityType: 'transform.rename', config: { mapping: { customer: 'customer_name' } } },
    { id: 'select', type: 'transform', activityType: 'transform.select', config: { expression: '{id: id, customer_name: customer_name, gross: gross}' } },
    s3Sink(s3, key),
  ], [
    { id: 'e1', source: 'src', target: 'filter' }, { id: 'e2', source: 'filter', target: 'formula' },
    { id: 'e3', source: 'formula', target: 'map' }, { id: 'e4', source: 'map', target: 'rename' },
    { id: 'e5', source: 'rename', target: 'select' }, { id: 'e6', source: 'select', target: 'sink' },
  ]);
  const rows = readS3Json(key);
  expect(rows.map((r: { id: number }) => r.id)).toEqual([2, 4]);
  expect(rows[0]).toMatchObject({ customer_name: 'Bob', gross: 295 });
});

test('P2 parse and flatten preserve Unicode, nulls and nested arrays', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const key = `runs/p2-parse-flatten-${Date.now()}.json`;
  await api.run(`p2-parse-flatten-${Date.now()}`, [
    s3Source(s3, 'fixtures/edge-cases.json'),
    { id: 'parse', type: 'transform', activityType: 'transform.parse', config: { fields: 'payload', onError: 'null' } },
    { id: 'flatten', type: 'transform', activityType: 'transform.flatten', config: { delimiter: '.', maxDepth: 10, arrayPolicy: 'index' } },
    s3Sink(s3, key),
  ], [{ id: 'e1', source: 'src', target: 'parse' }, { id: 'e2', source: 'parse', target: 'flatten' }, { id: 'e3', source: 'flatten', target: 'sink' }]);
  const rows = readS3Json(key);
  expect(rows[0]['nested.region']).toBe('IN');
  expect(rows[0].text).toBe('नमस्ते 🌍');
  expect(rows[1].payload).toBeNull();
});

test('P2 compound-key dedupe keeps the requested record', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const key = `runs/p2-dedupe-${Date.now()}.json`;
  await api.run(`p2-dedupe-${Date.now()}`, [
    s3Source(s3, 'fixtures/duplicates.json'),
    { id: 'dedupe', type: 'transform', activityType: 'transform.dedupe', config: { key: 'id,country', keep: 'last', scope: 'run' } },
    s3Sink(s3, key),
  ], [{ id: 'e1', source: 'src', target: 'dedupe' }, { id: 'e2', source: 'dedupe', target: 'sink' }]);
  const rows = readS3Json(key);
  expect(rows).toHaveLength(3);
  expect(rows.find((r: { id: number; country: string }) => r.id === 1 && r.country === 'IN').amount).toBe(125);
});

test('P2 contract drop rejects bad rows and writes valid rows externally', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const key = `runs/p2-contract-${Date.now()}.json`;
  await api.run(`p2-contract-${Date.now()}`, [
    s3Source(s3, 'fixtures/edge-cases.json'),
    { id: 'parse', type: 'transform', activityType: 'transform.parse', config: { fields: 'payload', onError: 'null' } },
    { id: 'contract', type: 'transform', activityType: 'transform.contract', config: { schemaJson: { id: 'number', text: 'string', payload: 'object' }, onViolation: 'drop', allowExtra: true } },
    s3Sink(s3, key),
  ], [{ id: 'e1', source: 'src', target: 'parse' }, { id: 'e2', source: 'parse', target: 'contract' }, { id: 'e3', source: 'contract', target: 'sink' }]);
  expect(readS3Json(key).map((r: { id: number }) => r.id)).toEqual([1]);
});

test('P2 fork delivers the same source to two real destinations', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const left = `runs/p2-fork-left-${Date.now()}.json`, right = `runs/p2-fork-right-${Date.now()}.json`;
  await api.run(`p2-fork-${Date.now()}`, [
    s3Source(s3, 'fixtures/orders.json'),
    { id: 'fork', type: 'fork', activityType: 'flow.fork', config: {} },
    s3Sink(s3, left, 'left'), s3Sink(s3, right, 'right'),
  ], [{ id: 'e1', source: 'src', target: 'fork' }, { id: 'e2', source: 'fork', target: 'left' }, { id: 'e3', source: 'fork', target: 'right' }]);
  expect(readS3Json(left)).toEqual(readS3Json(right));
});

test('P2 merge joins two real sources by ID', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  const key = `runs/p2-merge-${Date.now()}.json`;
  await api.run(`p2-merge-${Date.now()}`, [
    { ...s3Source(s3, 'fixtures/orders.json'), id: 'orders' },
    { ...s3Source(s3, 'fixtures/duplicates.json'), id: 'amounts' },
    { id: 'merge', type: 'merge', activityType: 'flow.merge', config: {}, mergeStrategy: 'innerJoin', joinKey: 'id' },
    s3Sink(s3, key),
  ], [{ id: 'e1', source: 'orders', target: 'merge' }, { id: 'e2', source: 'amounts', target: 'merge' }, { id: 'e3', source: 'merge', target: 'sink' }]);
  expect(readS3Json(key).length).toBeGreaterThan(0);
});

test('P2 invalid transform expression fails without writing a successful result', async ({ request }) => {
  const api = new DeployedAPI(request); await api.login();
  const s3 = await api.connection('s3');
  await api.runExpectingFailure(`p2-invalid-transform-${Date.now()}`, [
    s3Source(s3, 'fixtures/orders.json'),
    { id: 'filter', type: 'transform', activityType: 'transform.filter', config: { predicate: 'r.(' } },
    s3Sink(s3, `runs/p2-invalid-${Date.now()}.json`),
  ], [{ id: 'e1', source: 'src', target: 'filter' }, { id: 'e2', source: 'filter', target: 'sink' }]);
});
