'use strict';

/**
 * End-to-end test for POST /v1/generate/bulk, exercised over real HTTP against
 * the actual router, auth, entitlement and assembly path.
 *
 * Like the /v1/generate test, the ONLY faked dependency is the Supabase
 * service-role client. Additionally we stub lib/bulkJobs.runBulkJob so the test
 * asserts the SYNCHRONOUS contract (auth → validate → resolve driver → register
 * job → 202 { jobId }) without kicking off the real render/S3/webhook loop. The
 * job record it creates is inspected via the shared `jobs` Map — the same
 * singleton the browser path and the status/download endpoints use.
 *
 * Run:  node --test test/
 */

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');

// lib/bulkJobs → storage/artifactStore builds an S3 store from env at load time
// and fails fast if unconfigured. The real store is never called here (runBulkJob
// is stubbed below), so dummy config is enough to let the module load.
process.env.AWS_REGION        = process.env.AWS_REGION        || 'us-east-1';
process.env.S3_ARTIFACT_BUCKET = process.env.S3_ARTIFACT_BUCKET || 'test-bucket';

// ── Fake Supabase client (shared, mutable seed) ─────────────────────────────────

const seed = {};

function singleRow(table) {
  if (table === 'team_api_keys')     return seed.apiKey;
  if (table === 'teams')             return seed.team;
  if (table === 'templates')         return seed.template;
  if (table === 'template_bindings') return seed.bindings;
  return null;
}

class Query {
  constructor(table) { this.table = table; }
  select() { return this; }
  insert() { return this; }
  update() { return this; }
  eq()     { return this; }
  gte()    { return this; }
  order()  { return this; }
  maybeSingle() { return Promise.resolve({ data: singleRow(this.table), error: null }); }
  then(resolve, reject) {
    return Promise.resolve({ data: [], error: null }).then(resolve, reject);
  }
}

const fakeClient = { from: (table) => new Query(table) };

const supa = require('../supabaseAdmin');
supa.getAdmin = () => fakeClient;

// Stub the engine BEFORE requiring the route so its destructured reference picks
// up the spy. We only verify the job was handed off; the loop itself is covered
// by the browser bulk path in production.
const bulkJobs = require('../lib/bulkJobs');
let runCalls = [];
bulkJobs.runBulkJob = (jobId) => { runCalls.push(jobId); };
const { jobs } = bulkJobs;

const router = require('../routes/apiGenerateBulk');

// ── Fixtures ────────────────────────────────────────────────────────────────────

const BODY_JSON = {
  version: '2.0',
  pageSize: { canvasWidth: 794, canvasHeight: 1123, pdfWidth: 595.28, pdfHeight: 841.89 },
  pages: [{ pageId: 'p1', label: 'Page 1', elements: [], header: null, footer: null }],
};

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

beforeEach(() => { resetSeed(); runCalls = []; jobs.clear(); });

function generateBulk(body, headers = {}) {
  return fetch(`${baseUrl}/v1/generate/bulk`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body:    JSON.stringify(body),
  });
}

const KEY = { 'X-API-Key': 'tc_live_test_key' };

// ── Tests ─────────────────────────────────────────────────────────────────────

test('202 + jobId; registers an api-sourced job that fans out every row', async () => {
  const data = { invoices: [{ name: 'Acme' }, { name: 'Globex' }, { name: 'Initech' }] };
  const res = await generateBulk({ templateId: 'tpl-1', data }, KEY);

  assert.strictEqual(res.status, 202);
  const body = await res.json();
  assert.ok(body.jobId, 'response carries a jobId');
  assert.strictEqual(body.rows, 3);

  // The job landed in the shared registry, stamped for the API path.
  const job = jobs.get(body.jobId);
  assert.ok(job, 'job registered in the shared registry');
  assert.strictEqual(job.source, 'api');
  assert.strictEqual(job.teamId, 'team-1');
  assert.strictEqual(job.total, 3);
  assert.strictEqual(job.driverCollectionKey, 'invoices');
  assert.strictEqual(job.rows.length, 3);

  // And the engine was actually kicked off with that jobId.
  assert.deepStrictEqual(runCalls, [body.jobId]);
});

test('auto-detects the driver collection from a bare JSON array (items)', async () => {
  const res = await generateBulk({ templateId: 'tpl-1', data: [{ name: 'A' }, { name: 'B' }] }, KEY);
  assert.strictEqual(res.status, 202);
  const job = jobs.get((await res.json()).jobId);
  assert.strictEqual(job.driverCollectionKey, 'items');
  assert.strictEqual(job.total, 2);
});

test('honours an explicit driverCollectionKey', async () => {
  const data = { invoices: [{ n: 1 }], customers: [{ n: 1 }, { n: 2 }] };
  const res = await generateBulk({ templateId: 'tpl-1', data, driverCollectionKey: 'customers' }, KEY);
  assert.strictEqual(res.status, 202);
  const job = jobs.get((await res.json()).jobId);
  assert.strictEqual(job.driverCollectionKey, 'customers');
  assert.strictEqual(job.total, 2);
});

test('400 when multiple collections and no driverCollectionKey', async () => {
  const data = { invoices: [{ n: 1 }], customers: [{ n: 1 }] };
  const res = await generateBulk({ templateId: 'tpl-1', data }, KEY);
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /driverCollectionKey.*required|multiple collections/i);
  assert.strictEqual(runCalls.length, 0);
});

test('400 when the requested driverCollectionKey is not present', async () => {
  const res = await generateBulk(
    { templateId: 'tpl-1', data: { invoices: [{ n: 1 }] }, driverCollectionKey: 'nope' }, KEY);
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /not found/i);
});

test('400 when the driver collection has no rows', async () => {
  const res = await generateBulk({ templateId: 'tpl-1', data: { invoices: [] } }, KEY);
  assert.strictEqual(res.status, 400);
  // Either "no rows" or "no collection to generate" depending on how the empty
  // array parses — both are the right 400.
  assert.match((await res.json()).error, /no rows|no collection/i);
  assert.strictEqual(runCalls.length, 0);
});

test('401 when no API key is supplied', async () => {
  const res = await generateBulk({ templateId: 'tpl-1', data: [{ n: 1 }] });
  assert.strictEqual(res.status, 401);
  assert.match((await res.json()).error, /API key required/i);
});

test('403 when the team plan lacks API access', async () => {
  seed.team = { plan: 'pro' };
  const res = await generateBulk({ templateId: 'tpl-1', data: [{ n: 1 }] }, KEY);
  assert.strictEqual(res.status, 403);
  assert.match((await res.json()).error, /Business plan/i);
});

test('400 when templateId is missing', async () => {
  const res = await generateBulk({ data: [{ n: 1 }] }, KEY);
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /templateId/);
});

test('400 when data is missing', async () => {
  const res = await generateBulk({ templateId: 'tpl-1' }, KEY);
  assert.strictEqual(res.status, 400);
  assert.match((await res.json()).error, /data/);
});

test('404 when the template does not belong to the team', async () => {
  seed.template = null;
  const res = await generateBulk({ templateId: 'tpl-x', data: [{ n: 1 }] }, KEY);
  assert.strictEqual(res.status, 404);
  assert.match((await res.json()).error, /not found/i);
});
