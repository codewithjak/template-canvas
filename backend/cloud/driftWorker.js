'use strict';

/**
 * backend/cloud/driftWorker.js
 *
 * Phase 2 of drift detection (CLOUD_DRIFT_ARCHITECTURE.md §7): a durable,
 * continuous sweeper. The unit of work is the DEPLOYMENT, not the connection: an
 * account can hold many infras, each with its own state key, so the worker checks
 * every active deployment across verified connections (least-recently-checked
 * first, capped at BATCH real checks per sweep so no deployment starves and cost
 * stays bounded). It runs each check against that deployment's OWN state key and
 * applied config, stores the result in cloud_runs (kind='drift', stamped with
 * deployment_id) and fires a `cloud.drift.detected` webhook when NEW drift appears
 * — a resource drifting that was not drifting on the previous check (so a
 * persistent, already-notified drift does not re-alert every sweep).
 *
 * Like the webhook retry worker it is idempotent, overlap-guarded, and carries
 * no in-memory schedule: every input (connections, deployments, prior drift)
 * lives in the database, so it survives restarts. Single-instance only — no
 * cross-instance claim; see the same caveat in webhooks/dispatch.js.
 *
 * A drift check spins up CodeBuild in the customer account (real cost), so the
 * default cadence is deliberately slow and env-tunable.
 */

const { getAdmin } = require('../supabaseAdmin');
const runner = require('./runner');
const history = require('./runHistory');
const deps = require('./deployments');
const { dispatchWebhook } = require('../webhooks/dispatch');

const INTERVAL_MS = parseInt(process.env.DRIFT_CHECK_INTERVAL_MS, 10) || 6 * 60 * 60 * 1000; // 6h
// Max real drift checks (CodeBuild runs) per sweep. Connections beyond this cap
// aren't dropped — they're picked up on later sweeps, least-recently-checked first.
const BATCH = parseInt(process.env.DRIFT_CHECK_BATCH, 10) || 25;

// Per-connection stack outputs, falling back to global env (mirrors the route).
const cfgFor = (c) => ({
  stateBucket: (c && c.state_bucket) || process.env.CLOUD_STATE_BUCKET,
  lockTable: (c && c.lock_table) || process.env.CLOUD_LOCK_TABLE,
  runnerProject: (c && c.runner_project) || process.env.CLOUD_RUNNER_PROJECT,
});

const addrsOf = (plan) => new Set(((plan && plan.resources) || []).map((r) => r.address));

/**
 * All verified connections across all teams (admin scope). Fetches the full set
 * (a cheap indexed read) rather than an arbitrary page, so `runDriftSweep` can
 * order them fairly; the expensive CodeBuild work is capped separately, per
 * sweep. Stable `created_at` order for deterministic tie-breaking. Never
 * throws → [].
 */
async function fetchVerifiedConnections(sb) {
  try {
    const { data, error } = await sb
      .from('cloud_connections')
      .select('id, team_id, provider, region, status, role_arn, external_id, state_bucket, lock_table, runner_project')
      .eq('status', 'verified')
      .order('created_at', { ascending: true });
    return error ? [] : (data || []);
  } catch {
    return [];
  }
}

/**
 * Every ACTIVE deployment across all verified connections, each paired with the
 * connection that carries its credentials (role/region/outputs). The deployment
 * is the unit of drift; the connection is just how we reach the account. Cheap
 * indexed reads; the expensive CodeBuild work is capped separately. Never throws → [].
 */
async function fetchActiveDeployments(sb) {
  const connections = await fetchVerifiedConnections(sb);
  const pairs = [];
  for (const connection of connections) {
    let list = [];
    try {
      list = await deps.listByConnection(sb, connection.team_id, connection.id);
    } catch { list = []; }
    for (const deployment of list) {
      if (deployment.status === 'active') pairs.push({ connection, deployment });
    }
  }
  return pairs;
}

/**
 * Order deployments least-recently-drift-checked first (never-checked → first),
 * pairing each with its last drift check so the sweep doesn't re-query it. This
 * is what guarantees every active deployment eventually gets swept instead of an
 * arbitrary subset starving forever. Priority comes from the DB each sweep, so it
 * survives restarts. Returns `[{ connection, deployment, prev }]`.
 */
async function prioritizeByOldestCheck(sb, pairs) {
  const withPrev = await Promise.all(
    pairs.map(async ({ connection, deployment }) => ({
      connection,
      deployment,
      prev: await history.latestDriftForDeployment(sb, connection.team_id, deployment.id),
    })),
  );
  const checkedAt = (p) => (p && p.created_at ? Date.parse(p.created_at) : 0); // never checked ⇒ 0 ⇒ first
  return withPrev.sort((a, b) => checkedAt(a.prev) - checkedAt(b.prev));
}

/**
 * Run a drift check for one deployment, store it, and notify on new drift.
 * `prev` (the deployment's last drift check) may be supplied by the caller to
 * avoid a duplicate lookup; when omitted it is fetched here so the function is
 * usable standalone.
 * @returns {Promise<boolean>} true if a check actually ran (had a real, applied
 *   deployment to compare against).
 */
async function checkDeployment(sb, connection, deployment, prev) {
  const teamId = connection.team_id;
  const applied = await history.latestAppliedForDeployment(sb, teamId, deployment.id);
  if (!applied || applied.simulated) return false; // nothing real to compare against

  const cfg = cfgFor(connection);
  if (!process.env.AWS_ACCESS_KEY_ID || !cfg.stateBucket || !cfg.runnerProject) return false;

  if (prev === undefined) prev = await history.latestDriftForDeployment(sb, teamId, deployment.id);
  // This deployment's OWN state key — not the connection's legacy key — so each
  // infra in an account is checked against its own state.
  const stateKey = deps.stateKeyFor(deployment);
  const plan = await runner.runDrift({ connection, hcl: applied.hcl, ...cfg, stateKey });
  await history.createRun(sb, teamId, {
    connectionId: connection.id, deploymentId: deployment.id, kind: 'drift',
    name: 'Drift check (scheduled)', status: 'planned', plan,
  });

  // Notify only on newly-drifted resources (transition/expansion), not on drift
  // that was already reported on the previous sweep.
  const prevAddrs = addrsOf(prev && prev.plan);
  const newly = [...addrsOf(plan)].filter((a) => !prevAddrs.has(a));
  if (newly.length) {
    dispatchWebhook(teamId, 'cloud.drift.detected', {
      event: 'cloud.drift.detected',
      teamId,
      connectionId: connection.id,
      deploymentId: deployment.id,
      provider: connection.provider,
      region: connection.region,
      count: plan.resources.length,
      newlyDrifted: newly,
      resources: plan.resources.map((r) => ({ address: r.address, action: r.action })),
      createdAt: new Date().toISOString(),
    });
  }
  return true;
}

/**
 * One sweep: check the least-recently-checked deployments first, up to BATCH
 * *actual* checks (the real CodeBuild cost). Deployments without a real applied
 * run return early and cheaply, so they don't consume the budget; the rest rotate
 * in on subsequent sweeps. Returns how many were checked.
 */
async function runDriftSweep(sb) {
  const pairs = await fetchActiveDeployments(sb);
  const prioritized = await prioritizeByOldestCheck(sb, pairs);
  let checked = 0;
  for (const { connection, deployment, prev } of prioritized) {
    if (checked >= BATCH) break; // cap expensive checks per sweep, not cheap skips
    try {
      if (await checkDeployment(sb, connection, deployment, prev)) checked += 1;
    } catch (err) {
      console.warn(`[drift] check failed for deployment ${deployment.id}:`, err.message);
    }
  }
  return checked;
}

let workerTimer = null;
let workerBusy = false;

/**
 * Start the continuous drift sweeper (idempotent). Returns the timer, or null
 * when disabled or the cloud runner isn't configured (nothing to check).
 */
function startDriftWorker(intervalMs = INTERVAL_MS) {
  if (workerTimer) return workerTimer;
  if (process.env.DRIFT_WORKER_ENABLED === 'false') return null;
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.CLOUD_STATE_BUCKET) return null;

  workerTimer = setInterval(async () => {
    if (workerBusy) return; // no overlap on a single instance
    workerBusy = true;
    try {
      const sb = getAdmin();
      if (sb) await runDriftSweep(sb);
    } catch (err) {
      console.warn('[drift] worker error:', err.message);
    } finally {
      workerBusy = false;
    }
  }, intervalMs);
  if (workerTimer.unref) workerTimer.unref(); // don't keep the process alive for the timer
  return workerTimer;
}

module.exports = { startDriftWorker, runDriftSweep, checkDeployment };
