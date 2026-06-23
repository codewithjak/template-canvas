'use strict';

/**
 * Tests for the delivery-visibility API: GET /v1/webhooks/deliveries (listing,
 * filtering, tenant scoping) and POST .../redeliver (re-fires a past delivery
 * and records a fresh attempt). Supabase is faked with a stateful in-memory
 * store; redeliver hits a real local receiver.
 *
 * Run:  node --test test/
 */

// redeliver posts to a 127.0.0.1 receiver, which the SSRF guard blocks by default.
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
    this.filters = []; this._in = null; this._payload = null; this._order = null; this._limit = null;
  }
  select() { return this; }
  insert(row) { this.op = 'insert'; this._payload = row; return this; }
  update(p)  { this.op = 'update'; this._payload = p; return this; }
  delete()   { this.op = 'delete'; return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  in(col, vals) { this._in = [col, vals]; return this; }
  order(col, opts) { this._order = [col, opts]; return this; }
  limit(n) { this._limit = n; return this; }
  _select() {
    let rows = this.db[this.table] || [];
    for (const [c, v] of this.filters) rows = rows.filter((r) => r[c] === v);
    if (this._in) { const [c, vals] = this._in; rows = rows.filter((r) => vals.includes(r[c])); }
    if (this._order) {
      const [c, opts] = this._order;
      const dir = opts && opts.ascending === false ? -1 : 1;
      rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * dir);
    }
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return rows;
  }
  _apply() {
    if (this.op === 'insert') {
      const row = { id: 'row-' + (++this.db._seq), created_at: new Date(2000 + this.db._seq).toISOString(), ...this._payload };
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

// ── Local receiver (for redeliver) ──────────────────────────────────────────────

let server, baseUrl, received;
let apiServer, apiUrl;

before(async () => {
  const recv = express();
  recv.use(express.json());
  recv.post('/hook', (req, res) => { received.push(req.headers); res.status(200).send('ok'); });
  await new Promise((r) => { server = recv.listen(0, r); });
  baseUrl = `http://127.0.0.1:${server.address().port}/hook`;

  const app = express();
  app.use(express.json());
  app.use(webhooks);
  await new Promise((r) => { apiServer = app.listen(0, r); });
  apiUrl = `http://127.0.0.1:${apiServer.address().port}`;
});

after(() => { if (server) server.close(); if (apiServer) apiServer.close(); });

beforeEach(() => {
  received = [];
  db = {
    _seq: 0,
    team_api_keys: [{ team_id: 'team-1', revoked_at: null, key_hash: KEY_HASH }],
    teams:         [{ id: 'team-1', name: 'Acme', plan: 'business' }],
    webhook_endpoints: [
      { id: 'ep-1', team_id: 'team-1', url: baseUrl, secret: 'whsec_x', events: ['document.generated'], active: true },
      { id: 'ep-other', team_id: 'team-2', url: 'https://example.com/h', secret: 'whsec_y', events: ['document.generated'], active: true },
    ],
    webhook_deliveries: [
      { id: 'd-1', endpoint_id: 'ep-1', event: 'document.generated', status: 'success', attempts: 1, response_code: 200, created_at: '2026-01-01T00:00:00Z', payload: { event: 'document.generated', teamId: 'team-1' } },
      { id: 'd-2', endpoint_id: 'ep-1', event: 'document.generated', status: 'dead', attempts: 3, response_code: 500, created_at: '2026-01-02T00:00:00Z', payload: { event: 'document.generated', teamId: 'team-1', note: 'retry me' } },
      { id: 'd-other', endpoint_id: 'ep-other', event: 'document.generated', status: 'success', attempts: 1, response_code: 200, created_at: '2026-01-03T00:00:00Z', payload: { event: 'document.generated', teamId: 'team-2' } },
    ],
  };
});

const KEY = { 'X-API-Key': API_KEY };
const call = (method, path, body) => fetch(`${apiUrl}${path}`, {
  method, headers: { 'Content-Type': 'application/json', ...KEY }, body: body === undefined ? undefined : JSON.stringify(body),
});

// ── list ──────────────────────────────────────────────────────────────────────

test('lists only the team\'s deliveries, newest first', async () => {
  const res = await call('GET', '/v1/webhooks/deliveries');
  assert.strictEqual(res.status, 200);
  const { deliveries } = await res.json();
  assert.deepStrictEqual(deliveries.map((d) => d.id), ['d-2', 'd-1']); // desc by created_at, team-2 excluded
});

test('filters deliveries by status', async () => {
  const res = await call('GET', '/v1/webhooks/deliveries?status=dead');
  const { deliveries } = await res.json();
  assert.deepStrictEqual(deliveries.map((d) => d.id), ['d-2']);
});

test('rejects an unknown status', async () => {
  const res = await call('GET', '/v1/webhooks/deliveries?status=bogus');
  assert.strictEqual(res.status, 400);
});

test('does not leak another team\'s deliveries via endpointId', async () => {
  const res = await call('GET', '/v1/webhooks/deliveries?endpointId=ep-other');
  const { deliveries } = await res.json();
  assert.deepStrictEqual(deliveries, []);
});

// ── redeliver ───────────────────────────────────────────────────────────────────

test('redelivers a dead delivery: fires to the endpoint and records a new attempt', async () => {
  const before = db.webhook_deliveries.length;
  const res = await call('POST', '/v1/webhooks/deliveries/d-2/redeliver', {});
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });

  assert.strictEqual(received.length, 1, 'endpoint received the redelivery');
  assert.strictEqual(received[0]['x-mapdoc-event'], 'document.generated');
  assert.strictEqual(db.webhook_deliveries.length, before + 1, 'a fresh delivery row was recorded');
});

test('redeliver is 404 for an unknown delivery and for another team\'s delivery', async () => {
  assert.strictEqual((await call('POST', '/v1/webhooks/deliveries/nope/redeliver', {})).status, 404);
  assert.strictEqual((await call('POST', '/v1/webhooks/deliveries/d-other/redeliver', {})).status, 404);
});
