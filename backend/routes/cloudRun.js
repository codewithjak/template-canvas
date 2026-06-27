'use strict';

/**
 * routes/cloudRun.js
 *
 * Run a `terraform plan`/`apply` for a compiled blueprint (P6/P7), with durable
 * per-team run history (P8 — rows in cloud_runs, survive restarts).
 *
 *   POST /v1/cloud/runs          { connectionId?, hcl, name } → start a run
 *   GET  /v1/cloud/runs          recent runs for the team
 *   GET  /v1/cloud/runs/:id       poll status + plan/outputs
 *   POST /v1/cloud/runs/:id/apply approve the plan and apply it
 *
 * Real plan/apply runs in the customer's account via CodeBuild when a verified
 * connection + AWS env exist; otherwise a SIMULATED plan, so the flow is usable
 * without a cloud account.
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const conns = require('../cloud/connections');
const runner = require('../cloud/runner');
const { runApply } = require('../cloud/apply');
const { simulatePlanFromHcl } = require('../cloud/planSim');
const history = require('../cloud/runHistory');

const router = express.Router();

// Per-connection stack outputs, falling back to global env if not stored.
const cfgFor = (connection) => ({
  stateBucket: (connection && connection.state_bucket) || process.env.CLOUD_STATE_BUCKET,
  lockTable: (connection && connection.lock_table) || process.env.CLOUD_LOCK_TABLE,
  runnerProject: (connection && connection.runner_project) || process.env.CLOUD_RUNNER_PROJECT,
});

router.post('/v1/cloud/runs', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const { connectionId, hcl, name } = req.body || {};
    if (!hcl) throw httpError(400, 'Compiled HCL is required.');

    const connection = connectionId ? await conns.getConnection(sb, teamId, connectionId) : null;
    const cfg = cfgFor(connection);
    const canRunReal =
      connection && connection.status === 'verified'
      && process.env.AWS_ACCESS_KEY_ID && cfg.stateBucket && cfg.runnerProject;

    if (!canRunReal) {
      const plan = simulatePlanFromHcl(hcl);
      const row = await history.createRun(sb, teamId, { connectionId, name, hcl, status: 'planned', plan, simulated: true });
      return res.status(201).json({ runId: row.id, status: 'planned', plan, simulated: true });
    }

    const row = await history.createRun(sb, teamId, { connectionId, name, hcl, status: 'running' });
    res.status(202).json({ runId: row.id, status: 'running' });
    runPlanAsync(sb, teamId, row.id, connection, hcl, cfg);
  } catch (err) {
    sendError(res, '[cloud/runs create]', err);
  }
});

router.get('/v1/cloud/runs', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    res.json({ runs: await history.listRuns(sb, teamId) });
  } catch (err) {
    sendError(res, '[cloud/runs list]', err);
  }
});

router.get('/v1/cloud/runs/:id', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const r = await history.getRun(sb, teamId, req.params.id);
    if (!r) throw httpError(404, 'Run not found.');
    res.json({ runId: r.id, status: r.status, plan: r.plan, outputs: r.outputs, error: r.error, simulated: r.simulated });
  } catch (err) {
    sendError(res, '[cloud/runs get]', err);
  }
});

router.post('/v1/cloud/runs/:id/apply', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const r = await history.getRun(sb, teamId, req.params.id);
    if (!r) throw httpError(404, 'Run not found.');
    if (r.status !== 'planned') throw httpError(409, `Run is "${r.status}", not "planned".`);

    if (r.simulated) {
      await history.updateRun(sb, teamId, r.id, { status: 'applied', outputs: {} });
      return res.json({ runId: r.id, status: 'applied', outputs: {}, simulated: true });
    }

    const connection = await conns.getConnection(sb, teamId, r.connection_id);
    if (!connection) throw httpError(400, 'Connection missing.');

    await history.updateRun(sb, teamId, r.id, { status: 'applying' });
    res.status(202).json({ runId: r.id, status: 'applying' });
    runApplyAsync(sb, teamId, r, connection, cfgFor(connection));
  } catch (err) {
    sendError(res, '[cloud/runs apply]', err);
  }
});

async function runPlanAsync(sb, teamId, id, connection, hcl, cfg) {
  try {
    const plan = await runner.runPlan({ connection, hcl, ...cfg });
    await history.updateRun(sb, teamId, id, { status: 'planned', plan });
  } catch (e) {
    await history.updateRun(sb, teamId, id, { status: 'error', error: e.message });
  }
}

async function runApplyAsync(sb, teamId, run, connection, cfg) {
  try {
    const { outputs } = await runApply({ connection, hcl: run.hcl, ...cfg });
    await history.updateRun(sb, teamId, run.id, { status: 'applied', outputs });
  } catch (e) {
    await history.updateRun(sb, teamId, run.id, { status: 'error', error: e.message });
  }
}

module.exports = router;
