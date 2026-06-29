import assert from 'node:assert/strict';
import { assetUrnFromEventTopic } from './triggers';

const topic = 'asset.materialized.postgres://warehouse/bronze.orders';
assert.equal(assetUrnFromEventTopic(topic, true), 'postgres://warehouse/bronze.orders');
assert.equal(assetUrnFromEventTopic(topic, false), null); // generic pub/sub cannot spoof materialization
assert.equal(assetUrnFromEventTopic('asset.materialized.', true), null);
assert.equal(assetUrnFromEventTopic('pipeline.completed.p', true), null);
console.log('trigger route tests passed');
