'use strict';

/**
 * Tests for the outbound webhook dispatcher.
 *
 * Real HTTP delivery to a local receiver (so signing + headers + retries are
 * exercised end to end); only the Supabase client is faked, and that fake also
 * records webhook_deliveries so we can assert the audit trail.
 *
 * Run:  node --test test/
 */

// The receiver runs on 127.0.0.1, which the SSRF guard blocks by default; allow
// private targets for this dispatcher test (the guard itself is tested separately).
process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const express = require('express');

// ── Fake Supabase (records deliveries so we can assert status) ──────────────────

let endpoints = [];
let deliveries = [];
let seq = 0;

function fakeFrom(table) {
  if (table === 'webhook_endpoints') {
    const q = {
      select: () => q,
      eq:     () => q,
      then:   (resolve, reject) => Promise.resolve({ data: endpoints, error: null }).then(resolve, reject),
    };
    return q;
  }
  if (table === 'webhook_deliveries') {
    let inserted = null;
    let patch = null;
    let targetId = null;
    const q = {
      insert(row) { inserted = { id: 'd' + (++seq), ...row }; deliveries.push(inserted); return q; },
      select() { return q; },
      single() { return Promise.resolve({ data: { id: inserted.id }, error: null }); },
      update(p) { patch = p; return q; },
      eq(_col, val) { targetId = val; return q; },
      then(resolve, reject) {
        if (patch && targetId) {
          const row = deliveries.find((d) => d.id === targetId);
          if (row) Object.assign(row, patch);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      },
    };
    return q;
  }
  return { select: () => ({}), then: (r) => Promise.resolve({ data: [], error: null }).then(r) };
}

const supa = require('../supabaseAdmin');
supa.getAdmin = () => ({ from: fakeFrom });

const { dispatchWebhook } = require('../webhooks/dispatch');
const { sign } = require('../webhooks/signature');

// ── Local receiver ──────────────────────────────────────────────────────────────

let server;
let receiverUrl;
let received = [];
let respondStatus = 200;

before(async () => {
  const app = express();
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.post('/hook', (req, res) => {
    received.push({ headers: req.headers, body: req.body, raw: req.rawBody.toString() });
    res.status(respondStatus).send(respondStatus < 400 ? 'ok' : 'err');
  });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  receiverUrl = `http://127.0.0.1:${server.address().port}/hook`;
});

after(() => { if (server) server.close(); });

beforeEach(() => {
  endpoints = [];
  deliveries = [];
  received = [];
  respondStatus = 200;
});

const SECRET = 'whsec_testsecret';
const subscribe = (events) => { endpoints = [{ id: 'ep-1', url: receiverUrl, secret: SECRET, events }]; };

// ── Tests ─────────────────────────────────────────────────────────────────────

test('sign is a stable HMAC over "<timestamp>.<body>"', () => {
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update('1700000000.{"a":1}').digest('hex');
  assert.strictEqual(sign(SECRET, '1700000000', '{"a":1}'), expected);
});

test('delivers a signed POST to a subscribed endpoint and records success', async () => {
  subscribe(['document.generated']);
  const payload = { event: 'document.generated', teamId: 'team-1', templateId: 'tpl-1' };

  await dispatchWebhook('team-1', 'document.generated', payload);

  assert.strictEqual(received.length, 1, 'receiver should get exactly one POST');
  const got = received[0];
  assert.strictEqual(got.headers['x-mapdoc-event'], 'document.generated');
  assert.ok(got.headers['x-mapdoc-delivery'], 'delivery id header present');
  assert.ok(got.headers['x-mapdoc-timestamp'], 'timestamp header present');
  assert.deepStrictEqual(got.body, payload);

  // Signature verifies against "<timestamp>.<rawBody>".
  assert.strictEqual(got.headers['x-mapdoc-signature'], sign(SECRET, got.headers['x-mapdoc-timestamp'], got.raw));

  // Audit row closed as success.
  assert.strictEqual(deliveries.length, 1);
  assert.strictEqual(deliveries[0].status, 'success');
  assert.strictEqual(deliveries[0].attempts, 1);
  assert.strictEqual(deliveries[0].response_code, 200);
});

test('does not deliver when no endpoint subscribed to the event', async () => {
  subscribe(['some.other.event']);
  await dispatchWebhook('team-1', 'document.generated', { event: 'document.generated' });
  assert.strictEqual(received.length, 0);
  assert.strictEqual(deliveries.length, 0);
});

test('is a no-op (no throw) when the team has no endpoints', async () => {
  endpoints = [];
  await dispatchWebhook('team-1', 'document.generated', { event: 'document.generated' });
  assert.strictEqual(received.length, 0);
  assert.strictEqual(deliveries.length, 0);
});

test('retries then dead-letters when the receiver keeps failing', async () => {
  subscribe(['document.generated']);
  respondStatus = 500;

  await dispatchWebhook('team-1', 'document.generated', { event: 'document.generated' });

  assert.strictEqual(received.length, 3, 'should attempt MAX_ATTEMPTS times');
  assert.strictEqual(deliveries.length, 1);
  assert.strictEqual(deliveries[0].status, 'dead');
  assert.strictEqual(deliveries[0].attempts, 3);
  assert.strictEqual(deliveries[0].response_code, 500);
});
