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
 *
 * Path 1 "deploy from here" (opt-in): the CLI builds/pushes the image itself with
 * a SHORT-LIVED, tightly-SCOPED credential from
 *   POST /v1/cloud/deploy/:id/credentials  → { credentials, registry, targets }
 * (source never leaves the machine; only the built image reaches ECR).
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const conns = require('../cloud/connections');
const deps = require('../cloud/deployments');
const history = require('../cloud/runHistory');
const { assumeScopedRole } = require('../cloud/sts');
const { deployTargets, deploySessionPolicy, presignSourceUpload, runDeploy } = require('../cloud/deploy');

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
    if (!targets) throw httpError(400, 'No deployable workload found (needs ECS, a Lambda, or S3 + CloudFront).');

    const connection = await conns.getConnection(sb, teamId, deployment.connection_id);
    const cfg = cfgFor(connection);
    const canRunReal = connection && connection.status === 'verified'
      && process.env.AWS_ACCESS_KEY_ID && cfg.stateBucket && cfg.deployProject;

    if (!canRunReal) {
      const row = await history.createRun(sb, teamId, {
        connectionId: connection ? connection.id : null, deploymentId, kind: 'deploy', name: 'Deploy',
        status: 'applied', simulated: true, plan: { targets }, outputs: { deployed: targets.kind, simulated: true },
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

// Latest deploy status for the (connection, template) deployment — for the canvas
// pill, alongside drift. Resolves the deployment the same way the drift GET does.
router.get('/v1/cloud/deploy/status/:connectionId', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const { connectionId } = req.params;
    const { templateId } = req.query;
    const deployment = await deps.findByIdentity(sb, teamId, connectionId, templateId || null);
    if (!deployment) return res.json({ connectionId, status: 'none' });
    const r = await history.latestDeployForDeployment(sb, teamId, deployment.id);
    if (!r) return res.json({ connectionId, deploymentId: deployment.id, status: 'none' });
    res.json({
      deployRunId: r.id,
      connectionId,
      deploymentId: deployment.id,
      status: r.status,
      result: r.outputs || null,
      error: r.error,
      simulated: r.simulated,
      deployedAt: r.created_at,
    });
  } catch (err) {
    sendError(res, '[cloud/deploy status]', err);
  }
});

// Path 1 "deploy from here": mint a short-lived, tightly-scoped credential for the
// CLI to build the image locally and push it + roll the service itself. Source
// never leaves the machine. Only for container deployments.
router.post('/v1/cloud/deploy/:deploymentId/credentials', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const deployment = await deps.getDeployment(sb, teamId, req.params.deploymentId);
    if (!deployment) throw httpError(404, 'Deployment not found.');

    const targets = deployTargets(await loadBlueprint(sb, teamId, deployment.template_id));
    if (!targets || targets.kind !== 'container') throw httpError(400, 'Local image deploy is only for container apps (ECR + ECS).');

    const connection = await conns.getConnection(sb, teamId, deployment.connection_id);
    if (!connection || connection.status !== 'verified') throw httpError(409, 'A verified connection is required.');
    const deployRoleArn = connection.deploy_role_arn || process.env.CLOUD_DEPLOY_ROLE_ARN;
    if (!deployRoleArn) throw httpError(503, 'This connection has no deploy role configured.');

    const region = connection.region;
    // Resolve the account id (for the ARNs in the session policy), then re-assume
    // the deploy role scoped down to exactly this repo + service.
    const first = await assumeScopedRole({ roleArn: deployRoleArn, externalId: connection.external_id, region, durationSeconds: 900 });
    const accountId = first.accountId;
    const policy = deploySessionPolicy(targets, accountId, region);
    const scoped = await assumeScopedRole({ roleArn: deployRoleArn, externalId: connection.external_id, region, policy, durationSeconds: 3600 });

    await history.createRun(sb, teamId, {
      connectionId: connection.id, deploymentId: deployment.id, kind: 'deploy', name: 'Deploy (from CLI)',
      status: 'applying', plan: { targets, local: true },
    });

    res.json({
      region,
      registry: `${accountId}.dkr.ecr.${region}.amazonaws.com`,
      targets,
      credentials: {
        accessKeyId: scoped.credentials.accessKeyId,
        secretAccessKey: scoped.credentials.secretAccessKey,
        sessionToken: scoped.credentials.sessionToken,
        expiration: scoped.credentials.expiration,
      },
    });
  } catch (err) {
    sendError(res, '[cloud/deploy credentials]', err);
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
    const { result } = await runDeploy({
      connection, deployProject: cfg.deployProject, stateBucket: cfg.stateBucket,
      sourceUrl: plan.sourceGetUrl, targets: plan.targets, imageTag,
    });
    await history.updateRun(sb, teamId, run.id, { status: 'applied', outputs: result });
  } catch (e) {
    await history.updateRun(sb, teamId, run.id, { status: 'error', error: e.message });
  }
}

module.exports = router;
