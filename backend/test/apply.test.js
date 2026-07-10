'use strict';

/**
 * Tests for the sensitive-output filter (CLOUD_BUILDER_TRUST_ARCHITECTURE.md — secrets
 * stay in the customer's account). `terraform output -json` includes the VALUES of
 * sensitive outputs; nonSensitiveOutputs must drop them before they reach the DB.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { nonSensitiveOutputs } = require('../cloud/apply');

test('drops sensitive outputs entirely (name AND value), keeps the rest', () => {
  const raw = {
    api_url: { value: 'https://abc.execute-api.us-east-1.amazonaws.com', type: 'string', sensitive: false },
    db_password: { value: 'super-secret', type: 'string', sensitive: true },
  };
  const out = nonSensitiveOutputs(raw);
  assert.deepStrictEqual(Object.keys(out), ['api_url']);
  assert.ok(!('db_password' in out), 'sensitive name must not be stored');
  assert.strictEqual(JSON.stringify(out).includes('super-secret'), false, 'secret value must never appear');
});

test('non-sensitive outputs keep their exact { value, type, sensitive } shape', () => {
  const raw = { alb_dns: { value: 'app-123.us-east-1.elb.amazonaws.com', type: 'string', sensitive: false } };
  assert.deepStrictEqual(nonSensitiveOutputs(raw), raw);
});

test('empty / no-op / malformed inputs yield an empty object, never throw', () => {
  assert.deepStrictEqual(nonSensitiveOutputs({}), {});
  assert.deepStrictEqual(nonSensitiveOutputs(null), {});
  assert.deepStrictEqual(nonSensitiveOutputs(undefined), {});
  assert.deepStrictEqual(nonSensitiveOutputs('nope'), {});
});

test('only an explicit sensitive:true drops an entry (unflagged shapes are kept)', () => {
  const raw = {
    plain: 'value-without-wrapper',            // defensive: not the wrapped shape
    flagged: { value: 'x', sensitive: true },
    safe: { value: 'y', sensitive: false },
  };
  const out = nonSensitiveOutputs(raw);
  assert.deepStrictEqual(Object.keys(out).sort(), ['plain', 'safe']);
});
