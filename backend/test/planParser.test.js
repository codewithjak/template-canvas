'use strict';

/**
 * Tests for the Terraform -json parser, focused on the drift path.
 *
 * The headline case is the regression that made drift a silent no-op: a
 * `-refresh-only` plan reports out-of-band drift as `resource_drift` messages
 * (with an empty change_summary), NOT `planned_change`. parseDriftJson must read
 * those, and must not be confused with a normal plan's proposed changes.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { parsePlanJson, parseDriftJson } = require('../cloud/planParser');

const ndjson = (...msgs) => msgs.map((m) => JSON.stringify(m)).join('\n');

const plannedChange = (addr, action) => ({
  '@level': 'info', type: 'planned_change',
  change: { resource: { addr, resource_type: addr.split('.')[0], resource_name: addr.split('.')[1] }, action },
});
const resourceDrift = (addr, action) => ({
  '@level': 'info', type: 'resource_drift',
  change: { resource: { addr, resource_type: addr.split('.')[0], resource_name: addr.split('.')[1] }, action },
});
const changeSummary = (add, change, remove) => ({
  '@level': 'info', type: 'change_summary', changes: { add, change, remove, operation: 'plan' },
});
const version = { '@level': 'info', type: 'version', terraform: '1.7.0' };

test('parseDriftJson reads resource_drift from a refresh-only plan (the regression)', () => {
  // A refresh-only check: drift on one resource, and change_summary is 0/0/0.
  const out = ndjson(
    version,
    resourceDrift('aws_instance.web', 'update'),
    changeSummary(0, 0, 0),
  );

  const drift = parseDriftJson(out);
  assert.strictEqual(drift.resources.length, 1);
  assert.strictEqual(drift.resources[0].address, 'aws_instance.web');
  assert.strictEqual(drift.resources[0].action, 'update');
  assert.deepStrictEqual(drift.summary, { add: 0, change: 1, destroy: 0 });

  // The old parser (planned_change only) would have seen nothing here.
  assert.strictEqual(parsePlanJson(out).resources.length, 0);
});

test('parseDriftJson surfaces an out-of-band deletion as a delete', () => {
  const out = ndjson(resourceDrift('aws_s3_bucket.assets', 'delete'), changeSummary(0, 0, 0));
  const drift = parseDriftJson(out);
  assert.strictEqual(drift.resources.length, 1);
  assert.strictEqual(drift.resources[0].action, 'delete');
  assert.deepStrictEqual(drift.summary, { add: 0, change: 0, destroy: 1 });
});

test('an empty refresh-only plan is in sync (no drift)', () => {
  const out = ndjson(version, changeSummary(0, 0, 0));
  const drift = parseDriftJson(out);
  assert.strictEqual(drift.resources.length, 0);
  assert.deepStrictEqual(drift.summary, { add: 0, change: 0, destroy: 0 });
});

test('plan and drift do not contaminate each other', () => {
  // A normal plan can emit BOTH drift (detected during refresh) and proposed
  // changes. Proposed changes belong to the plan; drift belongs to drift.
  const out = ndjson(
    resourceDrift('aws_instance.web', 'update'),      // changed outside Terraform
    plannedChange('aws_db_instance.main', 'create'),  // what the plan will do
    changeSummary(1, 0, 0),
  );

  const plan = parsePlanJson(out);
  assert.deepStrictEqual(plan.resources.map((r) => r.address), ['aws_db_instance.main']);
  assert.deepStrictEqual(plan.summary, { add: 1, change: 0, destroy: 0 });

  const drift = parseDriftJson(out);
  assert.deepStrictEqual(drift.resources.map((r) => r.address), ['aws_instance.web']);
});

test('parsePlanJson still parses a normal plan (no regression)', () => {
  const out = ndjson(
    plannedChange('aws_instance.web', 'create'),
    plannedChange('aws_s3_bucket.assets', 'update'),
    changeSummary(1, 1, 0),
  );
  const plan = parsePlanJson(out);
  assert.strictEqual(plan.resources.length, 2);
  assert.deepStrictEqual(plan.summary, { add: 1, change: 1, destroy: 0 });
});

test('malformed lines are skipped, not fatal', () => {
  const out = ['not json', JSON.stringify(resourceDrift('aws_instance.web', 'update')), ''].join('\n');
  assert.strictEqual(parseDriftJson(out).resources.length, 1);
});
