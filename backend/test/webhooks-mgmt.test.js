'use strict';

/**
 * Tests for webhook endpoint lifecycle: ping (test event), secret rotation, and
 * pause/resume (incl. that a paused endpoint is skipped by dispatch). Supabase
 * faked with a stateful store; ping delivers to a real local receiver.
 *
 * Run:  node --test test/
 */

// ping/dispatch post to a 127.0.0.1 receiver, which the SSRF guard blocks by default.
process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const express = require('express');

const API_KEY = 'tc_live_test_key';
const KEY_HASH = crypto.createHash('sha256').update(API_KEY).digest('hex');

let db;

class Query {
  constructor(database, table) {
    this.db = database; this.table = table; this.op = 'select';
    this.filters = []; this._payload = null;
  }
  select() { return this; }
  insert(row) { this.op = 'insert'; this._payload = row; return this; }
  update(p)  { this.op = 'update'; this._payload = p; return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  _select() {
    let rows = this.db[this.table] || [];
    for (const [c, v] of this.filters) rows = rows.filter((r) => r[c] === v);
    return rows;
  }
  _apply() {
    if (this.op === 'insert') {
      const row = { id: 'row-' + (++this.db._seq), ...this._payload };
      this.db[this.table].push(row);
      return [row];
    }
    if (this.op === 'update') { const hit = this._select(); hit.forEach((r) => Object.assign(r, this._payload)); return hit; }
    return this._select();
  }
  maybeSingle() { const r = this._apply(); return Promise.resolve({ data: r[0] || null, error: null }); }
  single()      { const r = this._apply(); return Promise.resolve({ data: r[0] || null, error: r[0] ? null : { message: 'no row' } }); }
  then(resolve, reject) { const r = this._apply(); return Promise.resolve({ data: r, error: null }).then(resolve, reject); }
}

const supa = require('../supabaseAdmin');
supa.getAdmin = () => ({ from: (table) => new Query(db, table) });

const webhooks = require('../routes/webhooks');
const { dispatchWebhook } = require('../webhooks/dispatch');

let recvServer, recvUrl, received;
let apiServer, apiUrl;

before(async () => {
  const recv = express();
  recv.use(express.json());
  recv.post('/hook', (req, res) => { received.push(req.headers); res.status(200).send('ok'); });
  await new Promise((r) => { recvServer = recv.listen(0, r); });
  recvUrl = `http://127.0.0.1:${recvServer.address().port}/hook`;

  const app = express();
  app.use(express.json());
  app.use(webhooks);
  await new Promise((r) => { apiServer = app.listen(0, r); });
  apiUrl = `http://127.0.0.1:${apiServer.address().port}`;
});

after(() => { if (recvServer) recvServer.close(); if (apiServer) apiServer.close(); });

beforeEach(() => {
  received = [];
  db = {
    _seq: 0,
    team_api_keys: [{ team_id: 'team-1', revoked_at: null, key_hash: KEY_HASH }],
    teams:         [{ id: 'team-1', name: 'Acme', plan: 'business' }],
    webhook_endpoints: [
      { id: 'ep-1', team_id: 'team-1', url: recvUrl, secret: 'whsec_old', events: ['document.generated'], active: true, created_at: '2026-01-01T00:00:00Z' },
    ],
    webhook_deliveries: [],
  };
});

const KEY = { 'X-API-Key': API_KEY };
const call = (method, path, body) => fetch(`${apiUrl}${path}`, {
  method, headers: { 'Content-Type': 'application/json', ...KEY }, body: body === undefined ? undefined : JSON.stringify(body),
});

// ── ping ────────────────────────────────────────────────────────────────────────

test('ping sends a signed webhook.test event and records a delivery', async () => {
  const res = await call('POST', '/v1/webhooks/ep-1/ping', {});
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });

  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0]['x-mapdoc-event'], 'webhook.test');
  assert.ok(received[0]['x-mapdoc-signature']);
  assert.strictEqual(db.webhook_deliveries.length, 1, 'ping is recorded in the log');
});

test('ping is 404 for an unknown endpoint', async () => {
  assert.strictEqual((await call('POST', '/v1/webhooks/nope/ping', {})).status, 404);
});

// ── rotate-secret ─────────────────────────────────────────────────────────────

test('rotate-secret returns a new secret and updates the row', async () => {
  const res = await call('POST', '/v1/webhooks/ep-1/rotate-secret', {});
  assert.strictEqual(res.status, 200);
  const { secret } = await res.json();
  assert.match(secret, /^whsec_/);
  assert.notStrictEqual(secret, 'whsec_old');
  assert.strictEqual(db.webhook_endpoints[0].secret, secret);
});

test('rotate-secret is 404 for an unknown endpoint', async () => {
  assert.strictEqual((await call('POST', '/v1/webhooks/nope/rotate-secret', {})).status, 404);
});

// ── pause / resume ──────────────────────────────────────────────────────────────

test('PATCH active:false pauses; a paused endpoint is skipped by dispatch', async () => {
  const res = await call('PATCH', '/v1/webhooks/ep-1', { active: false });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).active, false);
  assert.strictEqual(db.webhook_endpoints[0].active, false);

  // Dispatch must not deliver to a paused endpoint.
  await dispatchWebhook('team-1', 'document.generated', { event: 'document.generated', teamId: 'team-1' });
  assert.strictEqual(received.length, 0, 'paused endpoint received nothing');
});

test('PATCH active:true resumes delivery', async () => {
  await call('PATCH', '/v1/webhooks/ep-1', { active: false });
  const res = await call('PATCH', '/v1/webhooks/ep-1', { active: true });
  assert.strictEqual((await res.json()).active, true);

  await dispatchWebhook('team-1', 'document.generated', { event: 'document.generated', teamId: 'team-1' });
  assert.strictEqual(received.length, 1, 'resumed endpoint receives again');
});

test('PATCH rejects a non-boolean active and unknown endpoint', async () => {
  assert.strictEqual((await call('PATCH', '/v1/webhooks/ep-1', { active: 'yes' })).status, 400);
  assert.strictEqual((await call('PATCH', '/v1/webhooks/nope', { active: true })).status, 404);
});
