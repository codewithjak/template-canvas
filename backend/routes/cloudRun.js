'use strict';

/**
 * routes/cloudRun.js
 *
 * Run a `terraform plan` for a compiled blueprint (P6).
 *
 *   POST /v1/cloud/runs        { connectionId?, hcl, name } → start a run
 *   GET  /v1/cloud/runs/:id    poll status + plan diff
 *
 * If a verified connection + platform AWS credentials exist, this assumes the
 * Connect role and runs a REAL plan via CodeBuild in the customer's account
 * (async). Otherwise it returns a SIMULATED plan immediately, so the flow is
 * usable without a cloud account. Run state is in-memory (durability is P8).
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const conns = require('../cloud/connections');
const runner = require('../cloud/runner');
const { simulatePlanFromHcl } = require('../cloud/planSim');

const router = express.Router();
const runs = new Map(); // runId → { status, plan, error, teamId, simulated, name }

const cfgFromEnv = () => ({
  stateBucket: process.env.CLOUD_STATE_BUCKET,
  lockTable: process.env.CLOUD_LOCK_TABLE,
  runnerProject: process.env.CLOUD_RUNNER_PROJECT,
});

router.post('/v1/cloud/runs', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const { connectionId, hcl, name } = req.body || {};
    if (!hcl) throw httpError(400, 'Compiled HCL is required.');

    const runId = `run-${Date.now()}`;
    const connection = connectionId ? await conns.getConnection(sb, teamId, connectionId) : null;
    const cfg = cfgFromEnv();
    const canRunReal =
      connection && connection.status === 'verified'
      && process.env.AWS_ACCESS_KEY_ID && cfg.stateBucket && cfg.runnerProject;

    if (!canRunReal) {
      const plan = simulatePlanFromHcl(hcl);
      runs.set(runId, { status: 'planned', plan, teamId, simulated: true, name });
      return res.status(201).json({ runId, status: 'planned', plan, simulated: true });
    }

    runs.set(runId, { status: 'running', teamId, name });
    res.status(202).json({ runId, status: 'running' });

    // Fire the real plan asynchronously; the client polls GET /:id.
    runPlanAsync(runId, connection, hcl, cfg, teamId, name);
  } catch (err) {
    sendError(res, '[cloud/runs create]', err);
  }
});

router.get('/v1/cloud/runs/:id', async (req, res) => {
  try {
    const { teamId } = await requireTeam(req);
    const r = runs.get(req.params.id);
    if (!r || r.teamId !== teamId) throw httpError(404, 'Run not found.');
    res.json({ runId: req.params.id, status: r.status, plan: r.plan, error: r.error, simulated: r.simulated });
  } catch (err) {
    sendError(res, '[cloud/runs get]', err);
  }
});

async function runPlanAsync(runId, connection, hcl, cfg, teamId, name) {
  try {
    const plan = await runner.runPlan({ connection, hcl, ...cfg });
    runs.set(runId, { status: 'planned', plan, teamId, name });
  } catch (e) {
    runs.set(runId, { status: 'error', error: e.message, teamId, name });
  }
}

module.exports = router;
