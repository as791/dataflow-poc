import assert from 'node:assert';
import { deriveStage, planTransition } from './pipelines';

assert.equal(deriveStage('draft', 'test'), 'draft');
assert.equal(deriveStage('active', 'test'), 'testing');
assert.equal(deriveStage('active', 'prod'), 'production');
assert.equal(deriveStage('archived', 'prod'), 'draft'); // archived is not a live stage

// gate: testing→production blocked without a green test run
assert.deepEqual(planTransition('testing', 'production', false), {
  code: 409,
  error: 'promotion gate: this version has no successful test run yet. Run it in test and let it complete, then promote.',
});
// gate passes with a green run
assert.deepEqual(planTransition('testing', 'production', true), { action: 'promote-prod' });
assert.deepEqual(planTransition('draft', 'testing', false), { action: 'activate-test' });
// production→testing is no longer an auto-rollback — it is rejected.
assert.ok('code' in planTransition('production', 'testing', false));
assert.ok('code' in planTransition('draft', 'production', true)); // no skip-the-line

console.log('pipelines stage gate self-check OK');
process.exit(0);
