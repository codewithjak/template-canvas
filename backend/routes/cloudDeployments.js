'use strict';

/**
 * routes/cloudDeployments.js
 *
 * Deployment lifecycle (CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md, Phase 3): the
 * visible per-account registry of live infras, plus rename and destroy.
 *
 *   GET   /v1/cloud/deployments?connectionId=   list a connection's deployments
 *   PATCH /v1/cloud/deployments/:id             rename
 *   POST  /v1/cloud/deployments/:id/destroy     terraform destroy → mark destroyed
 *
 * Destroy runs in the customer's account via CodeBuild against the deployment's
 * own state key when a verified connection + AWS env + a real applied deployment
 * exist; otherwise it just marks the deployment destroyed (simulated), so the
 * flow is usable without cloud.
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const conns = require('../cloud/connections');
const deps = require('../cloud/deployments');
const history = require('../cloud/runHistory');
const { runDestroy } = require('../cloud/destroy');

const router = express.Router();

const cfgFor = (connection) => ({
  stateBucket: (connection && connection.state_bucket) || process.env.CLOUD_STATE_BUCKET,
  lockTable: (connection && connection.lock_table) || process.env.CLOUD_LOCK_TABLE,
  runnerProject: (connection && connection.runner_project) || process.env.CLOUD_RUNNER_PROJECT,
});

router.get('/v1/cloud/deployments', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const { connectionId } = req.query;
    if (!connectionId) throw httpError(400, 'connectionId is required.');
    res.json({ deployments: await deps.listByConnection(sb, teamId, connectionId) });
  } catch (err) {
    sendError(res, '[cloud/deployments list]', err);
  }
});

router.patch('/v1/cloud/deployments/:id', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const name = (req.body && req.body.name || '').trim();
    if (!name) throw httpError(400, 'name is required.');
    const dep = await deps.getDeployment(sb, teamId, req.params.id);
    if (!dep) throw httpError(404, 'Deployment not found.');
    res.json({ deployment: await deps.updateDeployment(sb, teamId, dep.id, { name }) });
  } catch (err) {
    sendError(res, '[cloud/deployments rename]', err);
  }
});

router.post('/v1/cloud/deployments/:id/destroy', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const dep = await deps.getDeployment(sb, teamId, req.params.id);
    if (!dep) throw httpError(404, 'Deployment not found.');
    if (dep.status === 'destroyed') throw httpError(409, 'Deployment already destroyed.');

    const connection = await conns.getConnection(sb, teamId, dep.connection_id);
    const applied = await history.latestAppliedForDeployment(sb, teamId, dep.id);
    const cfg = cfgFor(connection);
    const canRunReal =
      connection && connection.status === 'verified'
      && process.env.AWS_ACCESS_KEY_ID && cfg.stateBucket && cfg.runnerProject
      && applied && !applied.simulated;

    if (!canRunReal) {
      // Nothing real is standing (simulated or never applied): just retire it.
      const updated = await deps.updateDeployment(sb, teamId, dep.id, { status: 'destroyed' });
      return res.json({ deployment: updated, simulated: true });
    }

    res.status(202).json({ deploymentId: dep.id, status: 'destroying' });
    destroyAsync(sb, teamId, dep, connection, applied.hcl, cfg);
  } catch (err) {
    sendError(res, '[cloud/deployments destroy]', err);
  }
});

async function destroyAsync(sb, teamId, dep, connection, hcl, cfg) {
  const stateKey = deps.stateKeyFor(dep);
  // A 'destroy'-kind run kept distinct from applies (status 'destroyed', not
  // 'applied') so it never masquerades as the deployment's latest apply.
  const row = await history.createRun(sb, teamId, {
    connectionId: connection.id, deploymentId: dep.id, kind: 'destroy', name: 'Destroy', hcl, status: 'applying',
  });
  try {
    await runDestroy({ connection, hcl, ...cfg, stateKey });
    await history.updateRun(sb, teamId, row.id, { status: 'destroyed' });
    await deps.updateDeployment(sb, teamId, dep.id, { status: 'destroyed', last_run_id: row.id });
  } catch (e) {
    await history.updateRun(sb, teamId, row.id, { status: 'error', error: e.message });
  }
}

module.exports = router;
