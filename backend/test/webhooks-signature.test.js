'use strict';

/**
 * Tests for webhook signing + verification with replay protection.
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');

const { sign, verify, now } = require('../webhooks/signature');

const SECRET = 'whsec_test';
const BODY = JSON.stringify({ event: 'document.generated', teamId: 't1' });

test('sign is deterministic and binds the timestamp', () => {
  assert.strictEqual(sign(SECRET, '100', BODY), sign(SECRET, '100', BODY));
  assert.notStrictEqual(sign(SECRET, '100', BODY), sign(SECRET, '101', BODY)); // timestamp is signed
  assert.match(sign(SECRET, '100', BODY), /^sha256=[0-9a-f]{64}$/);
});

test('verify accepts a fresh, correctly-signed delivery', () => {
  const ts = now();
  assert.strictEqual(verify(SECRET, ts, BODY, sign(SECRET, ts, BODY)), true);
});

test('verify rejects a tampered body or wrong secret', () => {
  const ts = now();
  const sig = sign(SECRET, ts, BODY);
  assert.strictEqual(verify(SECRET, ts, BODY + 'x', sig), false);   // body changed
  assert.strictEqual(verify('whsec_other', ts, BODY, sig), false);  // wrong secret
});

test('verify rejects a stale timestamp (replay)', () => {
  const old = String(Math.floor(Date.now() / 1000) - 3600); // 1h ago
  assert.strictEqual(verify(SECRET, old, BODY, sign(SECRET, old, BODY), 300), false);
});

test('verify rejects a future timestamp beyond tolerance', () => {
  const future = String(Math.floor(Date.now() / 1000) + 3600);
  assert.strictEqual(verify(SECRET, future, BODY, sign(SECRET, future, BODY), 300), false);
});

test('verify rejects a non-numeric timestamp', () => {
  assert.strictEqual(verify(SECRET, 'not-a-time', BODY, sign(SECRET, 'not-a-time', BODY)), false);
});
