'use strict';

/**
 * routes/cloudConnect.js
 *
 * Connect-account flow for the Visual Cloud Builder (P5). A team links an AWS
 * account by running our CloudFormation stack (infra/connect-account/stack.yaml)
 * with a generated ExternalId, then pasting back the Connect-Role ARN. We verify
 * the trust by assuming the role with the ExternalId.
 *
 *   POST   /v1/cloud/connections           begin → pending row + bootstrap params
 *   GET    /v1/cloud/connections           list this team's connections
 *   PATCH  /v1/cloud/connections/:id       save the Connect-Role ARN
 *   POST   /v1/cloud/connections/:id/verify  assume-role check → store account id
 *   DELETE /v1/cloud/connections/:id       remove
 *
 * We store only the role ARN + the ExternalId we generated — never the customer's
 * keys. Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const conns = require('../cloud/connections');
const { assumeConnectRole } = require('../cloud/sts');

const router = express.Router();

const ROLE_ARN_RE = /^arn:aws:iam::\d{12}:role\/.+/;
const platformAccountId = () => process.env.PLATFORM_AWS_ACCOUNT_ID || null;

// Begin: create a pending connection and return the bootstrap parameters.
router.post('/v1/cloud/connections', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const region = (req.body && req.body.region) || 'us-east-1';
    const conn = await conns.createConnection(sb, teamId, { provider: 'aws', region });
    res.status(201).json({
      connection: stripExternal(conn),
      bootstrap: {
        platformAccountId: platformAccountId(),
        externalId: conn.external_id,
        region,
        // The user launches infra/connect-account/stack.yaml with these params.
        parameters: { PlatformAccountId: platformAccountId(), ExternalId: conn.external_id },
      },
    });
  } catch (err) {
    sendError(res, '[cloud/connections create]', err);
  }
});

router.get('/v1/cloud/connections', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    res.json({ connections: await conns.listConnections(sb, teamId) });
  } catch (err) {
    sendError(res, '[cloud/connections list]', err);
  }
});

// Save the Connect-Role ARN from the stack output.
router.patch('/v1/cloud/connections/:id', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const roleArn = req.body && req.body.roleArn;
    if (!roleArn || !ROLE_ARN_RE.test(roleArn)) {
      throw httpError(400, 'A valid IAM role ARN is required.');
    }
    const conn = await conns.updateConnection(sb, teamId, req.params.id, {
      role_arn: roleArn,
      status: 'linked',
    });
    res.json({ connection: conn });
  } catch (err) {
    sendError(res, '[cloud/connections patch]', err);
  }
});

// Verify: assume the role with the ExternalId; store the discovered account id.
router.post('/v1/cloud/connections/:id/verify', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const c = await conns.getConnection(sb, teamId, req.params.id);
    if (!c) throw httpError(404, 'Connection not found.');
    if (!c.role_arn) throw httpError(400, 'Save the Connect-Role ARN before verifying.');

    try {
      const { accountId } = await assumeConnectRole({
        roleArn: c.role_arn,
        externalId: c.external_id,
        region: c.region,
      });
      const conn = await conns.updateConnection(sb, teamId, req.params.id, {
        account_id: accountId,
        status: 'verified',
      });
      res.json({ connection: conn, accountId });
    } catch (assumeErr) {
      await conns.updateConnection(sb, teamId, req.params.id, { status: 'error' }).catch(() => {});
      throw assumeErr;
    }
  } catch (err) {
    sendError(res, '[cloud/connections verify]', err);
  }
});

router.delete('/v1/cloud/connections/:id', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    await conns.deleteConnection(sb, teamId, req.params.id);
    res.status(204).end();
  } catch (err) {
    sendError(res, '[cloud/connections delete]', err);
  }
});

/** Never return the ExternalId to the client beyond the one-time begin response field. */
function stripExternal(row) {
  const { external_id, ...rest } = row;
  void external_id;
  return rest;
}

module.exports = router;
