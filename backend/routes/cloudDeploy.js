'use strict';

/**
 * routes/cloudDeploy.js
 *
 * Container workload deploy, Path 2 "cloud runner" (the default;
 * CLOUD_LOCAL_AGENT_ARCHITECTURE.md §7). Two steps so the CLI never holds a cloud
 * credential:
 *   POST /v1/cloud/deploy         { deploymentId }  → presigned source-upload URL
 *   POST /v1/cloud/deploy/:id/run { imageTag? }     → build+push+deploy in-account
 *
 * The CLI uploads the app source to the presigned URL (a one-shot link, not a
 * credential), then triggers the run; the in-account runner builds the image,
 * pushes to the deployment's ECR repo, and rolls the ECS service. Real when a
 * verified connection + a Docker-capable deploy project exist; otherwise SIMULATED.
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const conns = require('../cloud/connections');
const deps = require('../cloud/deployments');
const history = require('../cloud/runHistory');
const { deployTargets, presignSourceUpload, runDeploy } = require('../cloud/deploy');

const router = express.Router();

const cfgFor = (c) => ({
  stateBucket: (c && c.state_bucket) || process.env.CLOUD_STATE_BUCKET,
  // A Docker-capable build project (the terraform runner can't build images).
  deployProject: (c && c.deploy_project) || process.env.CLOUD_DEPLOY_PROJECT,
});

async function loadBlueprint(sb, teamId, templateId) {
  if (!templateId) return null;
  const { data } = await sb.from('templates').select('body_json').eq('team_id', teamId).eq('id', templateId).maybeSingle();
  return data ? data.body_json : null;
}

router.post('/v1/cloud/deploy', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const { deploymentId } = req.body || {};
    if (!deploymentId) throw httpError(400, 'deploymentId is required.');

    const deployment = await deps.getDeployment(sb, teamId, deploymentId);
    if (!deployment) throw httpError(404, 'Deployment not found.');

    const targets = deployTargets(await loadBlueprint(sb, teamId, deployment.template_id));
    if (!targets) throw httpError(400, 'This deployment is not a container app (needs an ECR repo + ECS service).');

    const connection = await conns.getConnection(sb, teamId, deployment.connection_id);
    const cfg = cfgFor(connection);
    const canRunReal = connection && connection.status === 'verified'
      && process.env.AWS_ACCESS_KEY_ID && cfg.stateBucket && cfg.deployProject;

    if (!canRunReal) {
      const row = await history.createRun(sb, teamId, {
        connectionId: connection ? connection.id : null, deploymentId, kind: 'deploy', name: 'Deploy',
        status: 'applied', simulated: true, plan: { targets }, outputs: { image: `${targets.ecrRepo}:latest (simulated)` },
      });
      return res.status(201).json({ deployRunId: row.id, targets, simulated: true, status: 'applied' });
    }

    const { putUrl, getUrl } = await presignSourceUpload({ connection, bucket: cfg.stateBucket });
    const row = await history.createRun(sb, teamId, {
      connectionId: connection.id, deploymentId, kind: 'deploy', name: 'Deploy', status: 'staging',
      plan: { targets, sourceGetUrl: getUrl },
    });
    res.status(201).json({ deployRunId: row.id, uploadUrl: putUrl, targets });
  } catch (err) {
    sendError(res, '[cloud/deploy prepare]', err);
  }
});

router.post('/v1/cloud/deploy/:id/run', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const r = await history.getRun(sb, teamId, req.params.id);
    if (!r || r.kind !== 'deploy') throw httpError(404, 'Deploy not found.');
    if (r.status !== 'staging') throw httpError(409, `Deploy is "${r.status}", not "staging".`);

    const connection = await conns.getConnection(sb, teamId, r.connection_id);
    if (!connection) throw httpError(400, 'Connection missing.');

    await history.updateRun(sb, teamId, r.id, { status: 'applying' });
    res.status(202).json({ deployRunId: r.id, status: 'applying' });
    runDeployAsync(sb, teamId, r, connection, (req.body && req.body.imageTag) || 'latest');
  } catch (err) {
    sendError(res, '[cloud/deploy run]', err);
  }
});

async function runDeployAsync(sb, teamId, run, connection, imageTag) {
  const cfg = cfgFor(connection);
  const plan = run.plan || {};
  try {
    const { image } = await runDeploy({
      connection, deployProject: cfg.deployProject, stateBucket: cfg.stateBucket,
      sourceUrl: plan.sourceGetUrl, targets: plan.targets, imageTag,
      execRoleArn: process.env.CLOUD_ECS_EXEC_ROLE_ARN,
    });
    await history.updateRun(sb, teamId, run.id, { status: 'applied', outputs: { image } });
  } catch (e) {
    await history.updateRun(sb, teamId, run.id, { status: 'error', error: e.message });
  }
}

module.exports = router;
