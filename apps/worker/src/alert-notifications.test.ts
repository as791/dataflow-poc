import assert from 'node:assert/strict';
import { notificationRetryDelaySeconds } from './alert-notifications';

assert.equal(notificationRetryDelaySeconds(1), 30);
assert.equal(notificationRetryDelaySeconds(4), 240);
assert.equal(notificationRetryDelaySeconds(20), 3600);

console.log('alert notification tests passed');
