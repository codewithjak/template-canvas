'use strict';

/**
 * backend/cloud/driftWorker.js
 *
 * Phase 2 of drift detection (CLOUD_DRIFT_ARCHITECTURE.md §7): a durable,
 * continuous sweeper. On a timer it runs drift checks for verified connections
 * that have a real deployment, least-recently-checked first and capped at BATCH
 * real checks per sweep so no connection starves and cost stays bounded. It
 * stores each result in cloud_runs (kind='drift') and fires a
 * `cloud.drift.detected` webhook when NEW drift appears — a resource drifting
 * that was not drifting on the previous check (so a persistent, already-notified
 * drift does not re-alert every sweep).
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
 * Order connections least-recently-drift-checked first (never-checked → first),
 * pairing each with its last drift check so the sweep doesn't re-query it. This
 * is what guarantees every verified connection eventually gets swept instead of
 * an arbitrary subset starving forever. Priority comes from the DB each sweep,
 * so it survives restarts. Returns `[{ connection, prev }]`.
 */
async function prioritizeByOldestCheck(sb, connections) {
  const withPrev = await Promise.all(
    connections.map(async (connection) => ({
      connection,
      prev: await history.latestDrift(sb, connection.team_id, connection.id),
    })),
  );
  const checkedAt = (p) => (p && p.created_at ? Date.parse(p.created_at) : 0); // never checked ⇒ 0 ⇒ first
  return withPrev.sort((a, b) => checkedAt(a.prev) - checkedAt(b.prev));
}

/**
 * Run a drift check for one connection, store it, and notify on new drift.
 * `prev` (the connection's last drift check) may be supplied by the caller to
 * avoid a duplicate lookup; when omitted it is fetched here so the function is
 * usable standalone.
 * @returns {Promise<boolean>} true if a check actually ran (had a real deployment).
 */
async function checkConnection(sb, connection, prev) {
  const teamId = connection.team_id;
  const deployment = await history.latestApplied(sb, teamId, connection.id);
  if (!deployment || deployment.simulated) return false; // nothing real to compare against

  const cfg = cfgFor(connection);
  if (!process.env.AWS_ACCESS_KEY_ID || !cfg.stateBucket || !cfg.runnerProject) return false;

  if (prev === undefined) prev = await history.latestDrift(sb, teamId, connection.id);
  const plan = await runner.runDrift({ connection, hcl: deployment.hcl, ...cfg });
  await history.createRun(sb, teamId, {
    connectionId: connection.id, kind: 'drift', name: 'Drift check (scheduled)', status: 'planned', plan,
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
 * One sweep: check the least-recently-checked connections first, up to BATCH
 * *actual* checks (the real CodeBuild cost). Connections without a real
 * deployment return early and cheaply, so they don't consume the budget; the
 * rest rotate in on subsequent sweeps. Returns how many were checked.
 */
async function runDriftSweep(sb) {
  const connections = await fetchVerifiedConnections(sb);
  const prioritized = await prioritizeByOldestCheck(sb, connections);
  let checked = 0;
  for (const { connection, prev } of prioritized) {
    if (checked >= BATCH) break; // cap expensive checks per sweep, not cheap skips
    try {
      if (await checkConnection(sb, connection, prev)) checked += 1;
    } catch (err) {
      console.warn(`[drift] check failed for connection ${connection.id}:`, err.message);
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

module.exports = { startDriftWorker, runDriftSweep, checkConnection };
