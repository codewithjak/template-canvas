'use strict';

/**
 * Tests for the durable retry worker (runDueRetries). State lives in the faked
 * webhook_deliveries store; the worker re-attempts due deliveries, advancing
 * them success → done or failed → … → dead. We drive it tick-by-tick (setting
 * next_attempt_at into the past) so there's no real waiting.
 *
 * Run:  node --test test/
 */

process.env.WEBHOOK_MAX_ATTEMPTS = '3';            // small ceiling for the test
process.env.WEBHOOK_ALLOW_PRIVATE_TARGETS = 'true'; // receiver is on 127.0.0.1

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');

let db;

class Query {
  constructor(database, table) {
    this.db = database; this.table = table; this.op = 'select';
    this.filters = []; this._in = null; this._cmp = []; this._payload = null; this._order = null; this._limit = null;
  }
  select() { return this; }
  insert(row) { this.op = 'insert'; this._payload = row; return this; }
  update(p)  { this.op = 'update'; this._payload = p; return this; }
  eq(c, v) { this.filters.push([c, v]); return this; }
  in(c, vals) { this._in = [c, vals]; return this; }
  lte(c, v) { this._cmp.push([c, (x) => x <= v]); return this; }
  lt(c, v)  { this._cmp.push([c, (x) => x < v]); return this; }
  order(c, opts) { this._order = [c, opts]; return this; }
  limit(n) { this._limit = n; return this; }
  _select() {
    let rows = this.db[this.table] || [];
    for (const [c, v] of this.filters) rows = rows.filter((r) => r[c] === v);
    if (this._in) { const [c, vals] = this._in; rows = rows.filter((r) => vals.includes(r[c])); }
    for (const [c, fn] of this._cmp) rows = rows.filter((r) => r[c] != null && fn(r[c]));
    if (this._order) { const [c, o] = this._order; const dir = o && o.ascending === false ? -1 : 1; rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * dir); }
    if (this._limit != null) rows = rows.slice(0, this._limit);
    return rows;
  }
  _apply() {
    if (this.op === 'insert') { const row = { id: 'row-' + (++this.db._seq), ...this._payload }; this.db[this.table].push(row); return [row]; }
    if (this.op === 'update') { const hit = this._select(); hit.forEach((r) => Object.assign(r, this._payload)); return hit; }
    return this._select();
  }
  maybeSingle() { const r = this._apply(); return Promise.resolve({ data: r[0] || null, error: null }); }
  single()      { const r = this._apply(); return Promise.resolve({ data: r[0] || null, error: r[0] ? null : { message: 'no row' } }); }
  then(resolve, reject) { const r = this._apply(); return Promise.resolve({ data: r, error: null }).then(resolve, reject); }
}

const supa = require('../supabaseAdmin');
const sb = { from: (table) => new Query(db, table) };
supa.getAdmin = () => sb;

const { runDueRetries } = require('../webhooks/dispatch');

let server, recvUrl, received, respondStatus;

before(async () => {
  const app = express();
  app.use(express.json());
  app.post('/hook', (req, res) => { received.push(req.headers); res.status(respondStatus).send(); });
  await new Promise((r) => { server = app.listen(0, r); });
  recvUrl = `http://127.0.0.1:${server.address().port}/hook`;
});

after(() => { if (server) server.close(); });

const PAST = '2020-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';

beforeEach(() => {
  received = [];
  respondStatus = 200;
  db = {
    _seq: 0,
    webhook_endpoints: [{ id: 'ep-1', team_id: 'team-1', url: recvUrl, secret: 'whsec_x', events: ['document.generated'], active: true }],
    webhook_deliveries: [],
  };
});

const seedDelivery = (over) => {
  const row = { id: 'd1', endpoint_id: 'ep-1', event: 'document.generated', payload: { event: 'document.generated' }, status: 'failed', attempts: 1, next_attempt_at: PAST, ...over };
  db.webhook_deliveries.push(row);
  return row;
};

const d1 = () => db.webhook_deliveries.find((d) => d.id === 'd1');

test('re-attempts a due failed delivery and marks it success', async () => {
  seedDelivery({ attempts: 1 });
  respondStatus = 200;

  const processed = await runDueRetries(sb);

  assert.strictEqual(processed, 1);
  assert.strictEqual(received.length, 1, 're-attempted over HTTP');
  assert.strictEqual(d1().status, 'success');
  assert.strictEqual(d1().attempts, 2);
  assert.strictEqual(d1().next_attempt_at, null);
});

test('skips deliveries that are not yet due', async () => {
  seedDelivery({ next_attempt_at: FUTURE });
  const processed = await runDueRetries(sb);
  assert.strictEqual(processed, 0);
  assert.strictEqual(received.length, 0);
  assert.strictEqual(d1().status, 'failed');
});

test('dead-letters once MAX_ATTEMPTS is reached', async () => {
  seedDelivery({ attempts: 2 }); // one more failure → attempts 3 == MAX
  respondStatus = 500;
  await runDueRetries(sb);
  assert.strictEqual(d1().status, 'dead');
  assert.strictEqual(d1().attempts, 3);
  assert.strictEqual(d1().next_attempt_at, null);
});

test('keeps retrying across ticks until dead (durable schedule)', async () => {
  seedDelivery({ attempts: 1 });
  respondStatus = 500;

  await runDueRetries(sb);                 // attempt 2 → failed, scheduled
  assert.strictEqual(d1().status, 'failed');
  assert.strictEqual(d1().attempts, 2);

  d1().next_attempt_at = PAST;             // simulate time passing to the next due moment
  await runDueRetries(sb);                 // attempt 3 → dead
  assert.strictEqual(d1().status, 'dead');
  assert.strictEqual(d1().attempts, 3);
  assert.strictEqual(received.length, 2);
});

test('dead-letters a delivery whose endpoint no longer exists', async () => {
  seedDelivery({ endpoint_id: 'ep-gone' });
  await runDueRetries(sb);
  assert.strictEqual(received.length, 0, 'nothing sent');
  assert.strictEqual(d1().status, 'dead');
});
