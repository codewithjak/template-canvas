'use strict';

/**
 * End-to-end test for POST /v1/generate, exercised over real HTTP against the
 * actual router and the real render pipeline (pdf-lib).
 *
 * The ONLY thing faked is the Supabase service-role client: we inject a tiny
 * in-memory stand-in via supabaseAdmin.getAdmin BEFORE requiring the router, so
 * every helper that captured getAdmin (apiKeys, usage, the route) uses it. That
 * keeps the test hermetic — no database, no credentials, no network — while
 * still flowing through auth → entitlement → load → parse → assemble → render →
 * HTTP response exactly as production does.
 *
 * Run:  node --test test/
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');

// ── Fake Supabase client (shared, mutable seed) ─────────────────────────────────

const seed = {};

/** The single row a `.maybeSingle()` query should resolve to, per table. */
function singleRow(table) {
  if (table === 'team_api_keys')     return seed.apiKey;    // {team_id, revoked_at} | null
  if (table === 'teams')             return seed.team;      // {plan}
  if (table === 'templates')         return seed.template;  // {id, team_id, body_json} | null
  if (table === 'template_bindings') return seed.bindings;  // mapping blob | null
  return null;
}

/** A thenable query builder: chainable, awaitable, and `.maybeSingle()`-able. */
class Query {
  constructor(table) { this.table = table; }
  select() { return this; }
  insert() { return this; }
  update() { return this; }
  eq()     { return this; }
  gte()    { return this; }
  order()  { return this; }
  maybeSingle() { return Promise.resolve({ data: singleRow(this.table), error: null }); }
  // Awaiting the builder directly (e.g. monthly-count query) yields a list.
  then(resolve, reject) {
    return Promise.resolve({ data: [], error: null }).then(resolve, reject);
  }
}

const fakeClient = { from: (table) => new Query(table) };

// Inject BEFORE requiring the router so transitive deps capture the fake.
const supa = require('../supabaseAdmin');
supa.getAdmin = () => fakeClient;

const router = require('../routes/apiGenerate');

// ── Fixtures ────────────────────────────────────────────────────────────────────

const BODY_JSON = {
  version: '2.0',
  pageSize: { canvasWidth: 794, canvasHeight: 1123, pdfWidth: 595.28, pdfHeight: 841.89 },
  pages: [{ pageId: 'p1', label: 'Page 1', elements: [], header: null, footer: null }],
};

/** Reset the seed to a valid Business-plan team + template before each case. */
function resetSeed() {
  seed.apiKey   = { team_id: 'team-1', revoked_at: null };
  seed.team     = { plan: 'business' };
  seed.template = { id: 'tpl-1', team_id: 'team-1', body_json: BODY_JSON };
  seed.bindings = { field_mapping: { name: 'Name' }, collection_mappings: {}, table_collection_bindings: {} };
}

// ── Server lifecycle ─────────────────────────────────────────────────────────────

let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(router);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => { if (server) server.close(); });

/** POST /v1/generate with optional headers; returns the fetch Response. */
function generate(body, headers = {}) {
  return fetch(`${baseUrl}/v1/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  });
}

const KEY = { 'X-API-Key': 'tc_live_test_key' };

// ── Tests ─────────────────────────────────────────────────────────────────────

test('returns a real PDF for a valid request', async () => {
  resetSeed();
  const res = await generate({ templateId: 'tpl-1', data: { name: 'Acme' } }, KEY);

  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/pdf/);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="document\.pdf"/);

  const bytes = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(bytes.subarray(0, 5).toString('latin1'), '%PDF-', 'body should be a PDF');
  assert.ok(bytes.length > 500, 'PDF should be non-trivial');
});

test('honours fileName and pdf is still produced', async () => {
  resetSeed();
  const res = await generate({ templateId: 'tpl-1', data: { name: 'Acme' }, fileName: 'invoice-42' }, KEY);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /filename="invoice-42\.pdf"/);
});

test('401 when no API key is supplied', async () => {
  resetSeed();
  const res = await generate({ templateId: 'tpl-1', data: { name: 'Acme' } });
  assert.strictEqual(res.status, 401);
  assert.match((await res.json()).error, /API key required/i);
});

test('403 when the API key is invalid/revoked', async () => {
  resetSeed();
  seed.apiKey = null; // resolveTeamFromApiKey → null
  const res = await generate({ templateId: 'tpl-1', data: { name: 'Acme' } }, KEY);
  assert.strictEqual(res.status, 403);
  assert.match((await res.json()).error, /Invalid or revoked/i);
});

test('403 when the team plan lacks API access', async () => {
  resetSeed();
  seed.team = { plan: 'pro' }; // pro has no `api` capability
  const res = await generate({ templateId: 'tpl-1', data: { name: 'Acme' } }, KEY);
  assert.strictEqual(res.status, 403);
  assert.match((await res.json()).error, /Business plan/i);
});

test('400 when templateId is missing', async () => {
  resetSeed();
  const res = await generate({ data: { name: 'Acme' } }, KEY);
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /templateId/);
});

test('400 when data is missing', async () => {
  resetSeed();
  const res = await generate({ templateId: 'tpl-1' }, KEY);
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /data/);
});

test('404 when the template does not belong to the team', async () => {
  resetSeed();
  seed.template = null; // loadTemplate → 404
  const res = await generate({ templateId: 'tpl-x', data: { name: 'Acme' } }, KEY);
  assert.strictEqual(res.status, 404);
  assert.match((await res.json()).error, /not found/i);
});
