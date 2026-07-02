'use strict';

/**
 * End-to-end tests for the connector REST-hook endpoints (Step 4), over real
 * HTTP against the actual router. The Supabase client is faked with a small
 * stateful in-memory store so subscribe → unsubscribe actually persists and
 * tenant-scoped queries behave.
 *
 * Run:  node --test test/
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const express = require('express');

// ── Tiny in-memory Supabase stand-in ────────────────────────────────────────────

const API_KEY = 'tc_live_test_key';
const KEY_HASH = crypto.createHash('sha256').update(API_KEY).digest('hex');

let db;

function freshDb() {
  return {
    _seq: 0,
    team_api_keys: [{ team_id: 'team-1', revoked_at: null, key_hash: KEY_HASH }],
    teams:         [{ id: 'team-1', name: 'Acme', plan: 'business' }],
    webhook_endpoints: [],
    webhook_deliveries: [],
  };
}

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
      const row = { id: 'row-' + (++this.db._seq), created_at: new Date(1000 + this.db._seq).toISOString(), ...this._payload };
      this.db[this.table].push(row);
      return [row];
    }
    if (this.op === 'delete') {
      const hit = this._select();
      this.db[this.table] = this.db[this.table].filter((r) => !hit.includes(r));
      return hit;
    }
    if (this.op === 'update') {
      const hit = this._select();
      hit.forEach((r) => Object.assign(r, this._payload));
      return hit;
    }
    return this._select();
  }
  maybeSingle() { const r = this._apply(); return Promise.resolve({ data: r[0] || null, error: null }); }
  single()      { const r = this._apply(); return Promise.resolve({ data: r[0] || null, error: r[0] ? null : { message: 'no row' } }); }
  then(resolve, reject) { const r = this._apply(); return Promise.resolve({ data: r, error: null }).then(resolve, reject); }
}

const supa = require('../supabaseAdmin');
supa.getAdmin = () => ({ from: (table) => new Query(db, table) });

const connector = require('../routes/connector');

// ── Server ──────────────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(connector);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => { if (server) server.close(); });

beforeEach(() => { db = freshDb(); });

const KEY = { 'X-API-Key': API_KEY };

function call(method, path, { body, headers = {} } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ── /v1/me ───────────────────────────────────────────────────────────────────

test('GET /v1/me returns team identity + plan + events', async () => {
  const res = await call('GET', '/v1/me', { headers: KEY });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), {
    teamId: 'team-1', name: 'Acme', plan: 'business',
    events: ['document.generated', 'bulk.completed', 'bulk.failed', 'cloud.drift.detected'],
  });
});

test('GET /v1/me is 401 without a key', async () => {
  const res = await call('GET', '/v1/me');
  assert.strictEqual(res.status, 401);
});

// ── subscribe / unsubscribe ───────────────────────────────────────────────────

test('subscribe registers a connector endpoint and returns its id', async () => {
  const res = await call('POST', '/v1/hooks/subscribe', {
    headers: KEY, body: { url: 'https://hooks.zapier.com/abc', event: 'document.generated' },
  });
  assert.strictEqual(res.status, 201);
  const { id } = await res.json();
  assert.ok(id);

  const row = db.webhook_endpoints.find((e) => e.id === id);
  assert.strictEqual(row.team_id, 'team-1');
  assert.strictEqual(row.source, 'connector');
  assert.deepStrictEqual(row.events, ['document.generated']);
  assert.ok(row.secret.startsWith('whsec_'), 'a signing secret is stored');
});

test('subscribe rejects an unknown event', async () => {
  const res = await call('POST', '/v1/hooks/subscribe', {
    headers: KEY, body: { url: 'https://example.com/h', event: 'nope.event' },
  });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /Unknown event/);
});

test('subscribe rejects a non-http url', async () => {
  const res = await call('POST', '/v1/hooks/subscribe', {
    headers: KEY, body: { url: 'ftp://example.com', event: 'document.generated' },
  });
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /valid http/);
});

test('unsubscribe removes the subscription created by subscribe', async () => {
  const sub = await call('POST', '/v1/hooks/subscribe', {
    headers: KEY, body: { url: 'https://example.com/h', event: 'document.generated' },
  });
  const { id } = await sub.json();
  assert.strictEqual(db.webhook_endpoints.length, 1);

  const res = await call('POST', '/v1/hooks/unsubscribe', { headers: KEY, body: { id } });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(await res.json(), { ok: true });
  assert.strictEqual(db.webhook_endpoints.length, 0);
});

test('unsubscribe is 404 for an unknown id and 400 with no id', async () => {
  const missing = await call('POST', '/v1/hooks/unsubscribe', { headers: KEY, body: { id: 'does-not-exist' } });
  assert.strictEqual(missing.status, 404);

  const noId = await call('POST', '/v1/hooks/unsubscribe', { headers: KEY, body: {} });
  assert.strictEqual(noId.status, 400);
});

// ── events/sample ─────────────────────────────────────────────────────────────

test('events/sample returns a synthetic sample when nothing has fired', async () => {
  const res = await call('GET', '/v1/events/sample?event=document.generated', { headers: KEY });
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.live, false);
  assert.strictEqual(body.sample.event, 'document.generated');
  assert.strictEqual(body.sample.format, 'pdf');
});

test('events/sample returns the most recent real delivery when one exists', async () => {
  db.webhook_endpoints.push({ id: 'ep-1', team_id: 'team-1', events: ['document.generated'], active: true });
  const realPayload = { event: 'document.generated', teamId: 'team-1', templateId: 'tpl-9', fileName: 'real.pdf' };
  db.webhook_deliveries.push({
    id: 'd-1', endpoint_id: 'ep-1', event: 'document.generated',
    payload: realPayload, created_at: '2026-01-01T00:00:00.000Z',
  });

  const res = await call('GET', '/v1/events/sample?event=document.generated', { headers: KEY });
  const body = await res.json();
  assert.strictEqual(body.live, true);
  assert.deepStrictEqual(body.sample, realPayload);
});
