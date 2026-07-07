'use strict';

/**
 * routes/cloudDrift.js
 *
 * Drift detection (CLOUD_DRIFT_ARCHITECTURE.md, Phase 1). A drift check is a
 * `terraform plan -refresh-only` against the connection's DEPLOYMENT (its last
 * applied run's HCL + durable S3 state), interpreted as a health signal:
 *   empty diff  → in sync
 *   non-empty   → drift (the parsed diff IS the drift)
 *
 *   POST /v1/cloud/drift               { connectionId } → start a drift check
 *   GET  /v1/cloud/drift/:connectionId                  → latest drift result
 *
 * Reuses the runner, the plan parser, and the run-history table (kind='drift').
 * Real when a verified connection + AWS env exist; otherwise SIMULATED as "in
 * sync" (no way to observe real drift without a real account), so the flow is
 * usable without cloud.
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const conns = require('../cloud/connections');
const deps = require('../cloud/deployments');
const runner = require('../cloud/runner');
const history = require('../cloud/runHistory');

const router = express.Router();

const IN_SYNC = { summary: { add: 0, change: 0, destroy: 0 }, resources: [] };

// Per-connection stack outputs, falling back to global env (mirrors cloudRun).
const cfgFor = (connection) => ({
  stateBucket: (connection && connection.state_bucket) || process.env.CLOUD_STATE_BUCKET,
  lockTable: (connection && connection.lock_table) || process.env.CLOUD_LOCK_TABLE,
  runnerProject: (connection && connection.runner_project) || process.env.CLOUD_RUNNER_PROJECT,
});

router.post('/v1/cloud/drift', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const { connectionId, deploymentId, templateId } = req.body || {};
    if (!connectionId && !deploymentId) throw httpError(400, 'connectionId or deploymentId is required.');

    // Resolve the target infra: an explicit deployment, or the (connection,
    // template) identity (templateId omitted ⇒ the connection's default).
    const deployment = deploymentId
      ? await deps.getDeployment(sb, teamId, deploymentId)
      : await deps.findByIdentity(sb, teamId, connectionId, templateId || null);
    if (!deployment) throw httpError(404, 'Deployment not found — apply this infra first.');

    const connection = await conns.getConnection(sb, teamId, deployment.connection_id);
    if (!connection) throw httpError(404, 'Connection not found.');

    // A drift check needs an applied deployment: nothing applied ⇒ nothing to compare to.
    const applied = await history.latestAppliedForDeployment(sb, teamId, deployment.id);
    if (!applied) throw httpError(409, 'No deployment for this infra yet — apply a plan first.');

    const cfg = cfgFor(connection);
    const stateKey = deps.stateKeyFor(deployment);
    const canRunReal =
      connection.status === 'verified'
      && process.env.AWS_ACCESS_KEY_ID && cfg.stateBucket && cfg.runnerProject
      && !applied.simulated;

    const base = { connectionId: connection.id, deploymentId: deployment.id };
    if (!canRunReal) {
      const row = await history.createRun(sb, teamId, {
        ...base, kind: 'drift', name: 'Drift check', status: 'planned', plan: IN_SYNC, simulated: true,
      });
      return res.status(201).json({ runId: row.id, ...base, status: 'planned', plan: IN_SYNC, simulated: true });
    }

    const row = await history.createRun(sb, teamId, {
      ...base, kind: 'drift', name: 'Drift check', status: 'running',
    });
    res.status(202).json({ runId: row.id, ...base, status: 'running' });
    runDriftAsync(sb, teamId, row.id, connection, applied.hcl, cfg, stateKey);
  } catch (err) {
    sendError(res, '[cloud/drift start]', err);
  }
});

router.get('/v1/cloud/drift/:connectionId', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const { deploymentId } = req.query;
    const r = deploymentId
      ? await history.latestDriftForDeployment(sb, teamId, deploymentId)
      : await history.latestDrift(sb, teamId, req.params.connectionId);
    if (!r) return res.json({ connectionId: req.params.connectionId, deploymentId: deploymentId || null, status: 'none' });
    res.json({
      runId: r.id,
      connectionId: req.params.connectionId,
      deploymentId: r.deployment_id || deploymentId || null,
      status: r.status,
      plan: r.plan,
      error: r.error,
      simulated: r.simulated,
      checkedAt: r.created_at,
    });
  } catch (err) {
    sendError(res, '[cloud/drift get]', err);
  }
});

async function runDriftAsync(sb, teamId, id, connection, hcl, cfg, stateKey) {
  try {
    const plan = await runner.runDrift({ connection, hcl, ...cfg, stateKey });
    await history.updateRun(sb, teamId, id, { status: 'planned', plan });
  } catch (e) {
    await history.updateRun(sb, teamId, id, { status: 'error', error: e.message });
  }
}

module.exports = router;
