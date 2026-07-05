import { strict as assert } from 'assert';
import { timeRangeFor } from './types';

const now = new Date('2026-07-05T12:00:00.000Z');
const range = timeRangeFor(24, now);
assert.equal(range.from, '2026-07-04T12:00:00.000Z');
assert.equal(range.to, now.toISOString());
