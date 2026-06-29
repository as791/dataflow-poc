import assert from 'node:assert/strict';
import { payloadObjectKey, payloadStoreConfig } from './index';

assert.equal(payloadStoreConfig({}), null);
assert.deepEqual(payloadStoreConfig({ PAYLOAD_S3_BUCKET: 'data', PAYLOAD_S3_FORCE_PATH_STYLE: 'true' }), {
  bucket: 'data', region: 'us-east-1', endpoint: undefined, forcePathStyle: true,
  accessKeyId: undefined, secretAccessKey: undefined,
});
assert.throws(() => payloadStoreConfig({ PAYLOAD_S3_BUCKET: 'data', PAYLOAD_S3_ACCESS_KEY_ID: 'key' }), /set together/);
assert.equal(payloadObjectKey('tenant', 'exec/1', 'node/1', 'fixed'), 'payloads/tenant/exec%2F1/node%2F1/fixed.json.enc');

console.log('object-store tests passed');
