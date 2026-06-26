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
const { runApply } = require('../cloud/apply');
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
      runs.set(runId, { status: 'planned', plan, teamId, simulated: true, name, hcl, connectionId });
      return res.status(201).json({ runId, status: 'planned', plan, simulated: true });
    }

    runs.set(runId, { status: 'running', teamId, name, hcl, connectionId });
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
    res.json({
      runId: req.params.id,
      status: r.status,
      plan: r.plan,
      outputs: r.outputs,
      error: r.error,
      simulated: r.simulated,
    });
  } catch (err) {
    sendError(res, '[cloud/runs get]', err);
  }
});

// Approve the plan and apply it (the human-in-the-loop gate).
router.post('/v1/cloud/runs/:id/apply', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const r = runs.get(req.params.id);
    if (!r || r.teamId !== teamId) throw httpError(404, 'Run not found.');
    if (r.status !== 'planned') throw httpError(409, `Run is "${r.status}", not "planned".`);

    if (r.simulated) {
      runs.set(req.params.id, { ...r, status: 'applied', outputs: {} });
      return res.json({ runId: req.params.id, status: 'applied', outputs: {}, simulated: true });
    }

    const connection = await conns.getConnection(sb, teamId, r.connectionId);
    if (!connection) throw httpError(400, 'Connection missing.');

    runs.set(req.params.id, { ...r, status: 'applying' });
    res.status(202).json({ runId: req.params.id, status: 'applying' });
    runApplyAsync(req.params.id, connection, r, cfgFromEnv());
  } catch (err) {
    sendError(res, '[cloud/runs apply]', err);
  }
});

async function runPlanAsync(runId, connection, hcl, cfg, teamId, name) {
  const base = runs.get(runId) || { teamId, name, hcl, connectionId: connection.id };
  try {
    const plan = await runner.runPlan({ connection, hcl, ...cfg });
    runs.set(runId, { ...base, status: 'planned', plan });
  } catch (e) {
    runs.set(runId, { ...base, status: 'error', error: e.message });
  }
}

async function runApplyAsync(runId, connection, run, cfg) {
  try {
    const { outputs } = await runApply({ connection, hcl: run.hcl, ...cfg });
    runs.set(runId, { ...run, status: 'applied', outputs });
  } catch (e) {
    runs.set(runId, { ...run, status: 'error', error: e.message });
  }
}

module.exports = router;
