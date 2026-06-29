import assert from 'node:assert/strict';
import { openLineageEndpoint, openLineageRetryDelaySeconds } from './openlineage';

assert.equal(openLineageEndpoint('https://lineage.example'), 'https://lineage.example/api/v1/lineage');
assert.equal(openLineageEndpoint('https://lineage.example/custom/api/v1/lineage'), 'https://lineage.example/custom/api/v1/lineage');
assert.equal(openLineageRetryDelaySeconds(1), 10);
assert.equal(openLineageRetryDelaySeconds(20), 3600);

console.log('openlineage dispatcher tests passed');
