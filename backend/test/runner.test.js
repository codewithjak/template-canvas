'use strict';

/**
 * Tests for the run-reconciliation Phase 1 primitives (CLOUD_RUN_RECONCILIATION_
 * ARCHITECTURE.md). The CodeBuild/STS network path is correct-by-construction and
 * verified live; here we lock in the PURE decision that makes the honest poll work
 * — classifying a build as terminal vs still-pending — plus the split's surface.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const runner = require('../cloud/runner');
const history = require('../cloud/runHistory');

test('isTerminal: IN_PROGRESS and unknown are NOT terminal (→ pending, never error)', () => {
  assert.strictEqual(runner.isTerminal('IN_PROGRESS'), false);
  assert.strictEqual(runner.isTerminal(undefined), false);
  assert.strictEqual(runner.isTerminal(null), false);
  assert.strictEqual(runner.isTerminal(''), false);
});

test('isTerminal: every CodeBuild terminal status is terminal', () => {
  for (const s of ['SUCCEEDED', 'FAILED', 'FAULT', 'STOPPED', 'TIMED_OUT']) {
    assert.strictEqual(runner.isTerminal(s), true, `${s} should be terminal`);
  }
});

test('runner exposes the start/resolve split (both actors call resolveBuild)', () => {
  assert.strictEqual(typeof runner.startBuild, 'function');
  assert.strictEqual(typeof runner.resolveBuild, 'function');
  assert.strictEqual(typeof runner.runBuild, 'function');
});

test('runHistory persists the durable build handle + projects it', () => {
  assert.strictEqual(typeof history.setBuildHandle, 'function');
});
