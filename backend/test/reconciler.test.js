'use strict';

/**
 * Tests for the run reconciler's pure finalize mapping (CLOUD_RUN_RECONCILIATION_
 * ARCHITECTURE.md Phase 2). The DB/CodeBuild sweep is verified live; here we lock in
 * the (kind, phase) → terminal-patch decision, which must exactly mirror what the
 * inline async fns write — including the sensitive-output filter on apply and NO
 * filter on a deploy result.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { computeFinalize } = require('../cloud/runReconciler');

test('running + plan → planned (parsed plan)', () => {
  const { patch } = computeFinalize({ kind: 'plan', status: 'running' }, '');
  assert.strictEqual(patch.status, 'planned');
  assert.ok(patch.plan && Array.isArray(patch.plan.resources));
});

test('running + drift → planned (drift interpreted as a plan)', () => {
  const { patch } = computeFinalize({ kind: 'drift', status: 'running' }, '');
  assert.strictEqual(patch.status, 'planned');
  assert.ok(patch.plan && 'summary' in patch.plan);
});

test('applying + plan → applied, outputs filtered, deployment bumped', () => {
  const body = JSON.stringify({
    api_url: { value: 'https://x.execute-api.us-east-1.amazonaws.com', type: 'string', sensitive: false },
    db_password: { value: 'super-secret', type: 'string', sensitive: true },
  });
  const { patch, bumpDeployment } = computeFinalize({ kind: 'plan', status: 'applying' }, body);
  assert.strictEqual(patch.status, 'applied');
  assert.strictEqual(bumpDeployment, true, 'an apply advances the deployment pointer');
  assert.ok('api_url' in patch.outputs);
  assert.ok(!('db_password' in patch.outputs), 'sensitive output must be dropped in the reconciled path too');
  assert.strictEqual(JSON.stringify(patch.outputs).includes('super-secret'), false);
});

test('applying + deploy → applied, result stored raw (NOT terraform output, no filter)', () => {
  const { patch, bumpDeployment } = computeFinalize({ kind: 'deploy', status: 'applying' }, '{"image":"repo:latest"}');
  assert.strictEqual(patch.status, 'applied');
  assert.deepStrictEqual(patch.outputs, { image: 'repo:latest' });
  assert.ok(!bumpDeployment, 'a deploy does not bump the deployment pointer');
});

test('malformed apply output does not throw → empty outputs', () => {
  const { patch } = computeFinalize({ kind: 'plan', status: 'applying' }, 'not json');
  assert.strictEqual(patch.status, 'applied');
  assert.deepStrictEqual(patch.outputs, {});
});
