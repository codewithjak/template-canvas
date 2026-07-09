'use strict';

/**
 * backend/cloud/runReconciler.js
 *
 * Phase 2 of run reconciliation (CLOUD_RUN_RECONCILIATION_ARCHITECTURE.md): a
 * durable, restart-surviving sweeper that drives every cloud run to a correct
 * terminal state from the build's REAL status — not an in-memory timer. Mirrors the
 * drift worker's shape: idempotent, overlap-guarded, unref'd, DB-backed, single
 * instance (no cross-instance claim; same caveat as driftWorker / webhooks).
 *
 * Two facets, because a stuck run may or may not carry a build handle (§7):
 *   resolveSweep — runs WITH a build_id, non-terminal past GRACE: ask CodeBuild and
 *                  finish them (the inline poll gave up, or the server restarted).
 *   orphanSweep  — runs with NO build_id, stuck past ORPHAN_TTL: a crash landed in
 *                  the create→persist window (§6). Retire to 'error'. NEVER touches
 *                  'staging' — that is a deploy legitimately waiting for the user to
 *                  trigger /run (§7.2), not an orphan.
 *
 * GRACE > the inline-poll window (600s), so by the time a row is swept the inline
 * poll has provably exited — the two never resolve the same row concurrently, and a
 * status-guarded write (see `terminate`) is enough; no row locking on one instance.
 */

const { getAdmin } = require('../supabaseAdmin');
const runner = require('./runner');
const deps = require('./deployments');
const { parsePlanJson, parseDriftJson } = require('./planParser');
const { nonSensitiveOutputs } = require('./apply');

const INLINE_WINDOW_MS = 600 * 1000; // matches the runner's 120 × 5s inline poll
const GRACE_MS = parseInt(process.env.CLOUD_RECONCILE_GRACE_MS, 10) || 2 * INLINE_WINDOW_MS; // 20m
// > the CodeBuild project TimeoutInMinutes (30), so a build that really launched has
// finished by now — a still-null handle means the crash beat handle-persistence.
const ORPHAN_TTL_MS = parseInt(process.env.CLOUD_ORPHAN_TTL_MS, 10) || 45 * 60 * 1000; // 45m
const INTERVAL_MS = parseInt(process.env.CLOUD_RECONCILE_INTERVAL_MS, 10) || 60 * 1000; // 1m
const BATCH = parseInt(process.env.CLOUD_RECONCILE_BATCH, 10) || 25;

// Post-StartBuild build states. 'staging' (a deploy awaiting /run) is deliberately
// NOT here — it is pre-build and must never be swept.
const NON_TERMINAL = ['running', 'applying'];

/** The connection fields needed to RESOLVE a build (assume + BatchGetBuilds + fetch
 *  the result object). Includes external_id, which the public projection omits.
 *  Throws on a query error (transient — let the sweep retry) so a DB blip is never
 *  mistaken for a deleted connection; returns null only when the row is truly gone. */
async function loadConnection(sb, connectionId) {
  if (!connectionId) return null; // FK `on delete set null` → the connection was removed
  const { data, error } = await sb
    .from('cloud_connections')
    .select('id, region, role_arn, external_id, state_bucket')
    .eq('id', connectionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Idempotent terminal write: only applies if the row is STILL non-terminal, so a
 * late inline poll (or an overlapping sweep) can't clobber an already-finished row.
 * Returns whether this call is the one that terminalized it.
 */
async function terminate(sb, run, patch) {
  const { data } = await sb
    .from('cloud_runs')
    .update(patch)
    .eq('id', run.id)
    .eq('team_id', run.team_id)
    .in('status', NON_TERMINAL)
    .select('id')
    .maybeSingle();
  return Boolean(data);
}

/**
 * Pure: map a resolved build to the terminal run patch, keyed by (kind, phase).
 * status 'applying' = the apply/deploy phase; 'running' = the plan/drift phase.
 * Mirrors exactly what the inline async fns write, so a reconciled run is
 * indistinguishable from one the inline poll finished (incl. the sensitive-output
 * filter on apply, and NO filter on a deploy result, which isn't terraform output).
 */
function computeFinalize(run, body) {
  const parseJson = (b) => { try { return JSON.parse(b); } catch { return {}; } };
  if (run.status === 'applying') {
    if (run.kind === 'deploy') {
      return { patch: { status: 'applied', outputs: parseJson(body) } };
    }
    return { patch: { status: 'applied', outputs: nonSensitiveOutputs(parseJson(body)) }, bumpDeployment: true };
  }
  const plan = run.kind === 'drift' ? parseDriftJson(body) : parsePlanJson(body);
  return { patch: { status: 'planned', plan } };
}

/**
 * Resolve one run from its durable handle. Probes CodeBuild via the shared
 * runner.resolveBuild with FRESH credentials (no creds passed) — the sweep long
 * outlives the original run's 900s creds, which is exactly why it can finish a build
 * the inline poll couldn't. Returns whether the run reached a terminal state.
 */
async function resolveRun(sb, run) {
  const connection = await loadConnection(sb, run.connection_id);
  if (!connection) {
    // Connection removed → this handle can NEVER resolve. Retire it, so an
    // unresolvable oldest-row doesn't re-select every sweep and starve the batch
    // (a partial down-payment on Phase 3 dead-run detection).
    return terminate(sb, run, { status: 'error', error: 'Connection was removed; run can no longer be resolved (reconciled).' });
  }
  const stateBucket = connection.state_bucket || process.env.CLOUD_STATE_BUCKET;
  if (!stateBucket) return false; // config missing (likely transient) — leave for a later sweep

  const r = await runner.resolveBuild({
    connection,
    stateBucket,
    buildId: run.build_id,
    region: run.build_region || connection.region,
    resultKey: run.result_key,
  });
  if (r.pending) return false;
  if (r.failed) {
    return terminate(sb, run, { status: 'error', error: `Build failed: ${r.reason} (reconciled).` });
  }

  const { patch, bumpDeployment } = computeFinalize(run, r.body);
  const done = await terminate(sb, run, patch);
  if (done && bumpDeployment && run.deployment_id) {
    await deps.updateDeployment(sb, run.team_id, run.deployment_id, { last_run_id: run.id });
  }
  return done;
}

/** §7.1 — resolve handle-carrying runs the inline poll abandoned (oldest first). */
async function resolveSweep(sb) {
  const cutoff = new Date(Date.now() - GRACE_MS).toISOString();
  const { data: rows } = await sb
    .from('cloud_runs')
    .select('id, team_id, kind, status, connection_id, deployment_id, build_id, build_region, result_key')
    .in('status', NON_TERMINAL)
    .not('build_id', 'is', null)
    .lt('build_started_at', cutoff)
    .order('build_started_at', { ascending: true })
    .limit(BATCH);
  let resolved = 0;
  for (const run of rows || []) {
    try {
      if (await resolveRun(sb, run)) resolved += 1;
    } catch (err) {
      console.warn(`[reconcile] resolve failed for run ${run.id}:`, err.message);
    }
  }
  return resolved;
}

/**
 * §7.2 — retire null-handle runs stuck past ORPHAN_TTL (crashes in the
 * StartBuild → setBuildHandle window). Anchored on build_started_at (the build
 * ATTEMPT time, stamped at the phase transition), NOT created_at: a deploy/apply row
 * can be created long before its build attempt, and anchoring on created_at would
 * orphan-error a build the instant it started. build_started_at is set for every run
 * that entered the build phase, so a null value here means "never attempted a build"
 * (e.g. a Path-1 CLI deploy Mapdoc doesn't run) — deliberately left alone.
 */
async function orphanSweep(sb) {
  const cutoff = new Date(Date.now() - ORPHAN_TTL_MS).toISOString();
  const { data: rows } = await sb
    .from('cloud_runs')
    .select('id, team_id, status')
    .in('status', NON_TERMINAL) // never 'staging'
    .is('build_id', null)
    .not('build_started_at', 'is', null)
    .lt('build_started_at', cutoff)
    .limit(BATCH);
  let retired = 0;
  for (const run of rows || []) {
    try {
      if (await terminate(sb, run, { status: 'error', error: 'Run never recorded a build handle; abandoned (reconciled).' })) retired += 1;
    } catch (err) {
      console.warn(`[reconcile] orphan retire failed for run ${run.id}:`, err.message);
    }
  }
  return retired;
}

async function runReconcileSweep(sb) {
  const resolved = await resolveSweep(sb);
  const retired = await orphanSweep(sb);
  return { resolved, retired };
}

let workerTimer = null;
let workerBusy = false;

/**
 * Start the continuous run reconciler (idempotent). Returns the timer, or null when
 * disabled or the cloud runner isn't configured. Mirrors startDriftWorker.
 */
function startRunReconciler(intervalMs = INTERVAL_MS) {
  if (workerTimer) return workerTimer;
  if (process.env.CLOUD_RECONCILER_ENABLED === 'false') return null;
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.CLOUD_STATE_BUCKET) return null;

  workerTimer = setInterval(async () => {
    if (workerBusy) return; // no overlap on a single instance
    workerBusy = true;
    try {
      const sb = getAdmin();
      if (sb) await runReconcileSweep(sb);
    } catch (err) {
      console.warn('[reconcile] worker error:', err.message);
    } finally {
      workerBusy = false;
    }
  }, intervalMs);
  if (workerTimer.unref) workerTimer.unref(); // don't keep the process alive for the timer
  return workerTimer;
}

module.exports = {
  startRunReconciler, runReconcileSweep, resolveSweep, orphanSweep, resolveRun, computeFinalize,
};
