'use strict';

/**
 * End-to-end test for POST /v1/ingest after it was refactored onto the shared
 * helpers (requireApiTeam + templateStore loaders + apiAuth error handling).
 * Guards against regressions in the parking-only path. Supabase is faked with a
 * small stateful store that also supports upsert.
 *
 * Run:  node --test test/
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const express = require('express');

const API_KEY = 'tc_live_test_key';
const KEY_HASH = crypto.createHash('sha256').update(API_KEY).digest('hex');

let db;

function freshDb() {
  return {
    team_api_keys: [{ team_id: 'team-1', revoked_at: null, key_hash: KEY_HASH }],
    teams:         [{ id: 'team-1', name: 'Acme', plan: 'business' }],
    templates:     [{ id: 'tpl-1', team_id: 'team-1', body_json: { pages: [{ elements: [] }] } }],
    template_bindings: [],
  };
}

class Query {
  constructor(database, table) {
    this.db = database; this.table = table; this.op = 'select';
    this.filters = []; this._payload = null; this._conflict = null;
  }
  select() { return this; }
  insert(row) { this.op = 'insert'; this._payload = row; return this; }
  update(p) { this.op = 'update'; this._payload = p; return this; }
  upsert(row, opts) { this.op = 'upsert'; this._payload = row; this._conflict = opts && opts.onConflict; return this; }
  eq(col, val) { this.filters.push([col, val]); return this; }
  _match() {
    let rows = this.db[this.table] || [];
    for (const [c, v] of this.filters) rows = rows.filter((r) => r[c] === v);
    return rows;
  }
  _apply() {
    if (this.op === 'upsert') {
      const cols = String(this._conflict || '').split(',').map((s) => s.trim()).filter(Boolean);
      const existing = (this.db[this.table] || []).find((r) => cols.every((c) => r[c] === this._payload[c]));
      if (existing) { Object.assign(existing, this._payload); return [existing]; }
      this.db[this.table].push({ ...this._payload });
      return [this._payload];
    }
    if (this.op === 'insert') { this.db[this.table].push({ ...this._payload }); return [this._payload]; }
    if (this.op === 'update') { const hit = this._match(); hit.forEach((r) => Object.assign(r, this._payload)); return hit; }
    return this._match();
  }
  maybeSingle() { const r = this._apply(); return Promise.resolve({ data: r[0] || null, error: null }); }
  then(resolve, reject) { const r = this._apply(); return Promise.resolve({ data: r, error: null }).then(resolve, reject); }
}

const supa = require('../supabaseAdmin');
supa.getAdmin = () => ({ from: (table) => new Query(db, table) });

const teamApi = require('../routes/teamApi');

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use(teamApi);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => { if (server) server.close(); });

beforeEach(() => { db = freshDb(); });

const KEY = { 'X-API-Key': API_KEY };

function ingest(body, headers = {}) {
  return fetch(`${baseUrl}/v1/ingest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('parks the payload and reports bound:false on first ingest', async () => {
  const res = await ingest({ templateId: 'tpl-1', data: { name: 'Acme' } }, KEY);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.bound, false);
  assert.strictEqual(body.fields, 1);

  // The payload is now parked on template_bindings.
  const row = db.template_bindings.find((r) => r.template_id === 'tpl-1');
  assert.ok(row && row.last_payload, 'last_payload stored');
});

test('reports bound:true when a binding already exists', async () => {
  db.template_bindings.push({ team_id: 'team-1', template_id: 'tpl-1', field_mapping: { name: 'Name' } });
  const res = await ingest({ templateId: 'tpl-1', data: { name: 'Acme' } }, KEY);
  assert.strictEqual((await res.json()).bound, true);
});

test('401 without an API key', async () => {
  const res = await ingest({ templateId: 'tpl-1', data: { name: 'Acme' } });
  assert.strictEqual(res.status, 401);
});

test('400 when templateId or data is missing', async () => {
  assert.strictEqual((await ingest({ data: {} }, KEY)).status, 400);
  assert.strictEqual((await ingest({ templateId: 'tpl-1' }, KEY)).status, 400);
});

test('404 when the template is not the team\'s', async () => {
  const res = await ingest({ templateId: 'nope', data: { name: 'Acme' } }, KEY);
  assert.strictEqual(res.status, 404);
});
