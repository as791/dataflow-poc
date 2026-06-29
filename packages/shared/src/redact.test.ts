import assert from 'node:assert/strict';
import { redactSensitiveText } from './redact';

assert.equal(redactSensitiveText('postgres://alice:hunter2@db/app'), 'postgres://alice:[REDACTED]@db/app');
assert.equal(redactSensitiveText('Bearer abc.def password="secret"'), 'Bearer [REDACTED] password=[REDACTED]');
assert.equal(redactSensitiveText('connection refused at db:5432'), 'connection refused at db:5432');
console.log('redaction tests passed');
