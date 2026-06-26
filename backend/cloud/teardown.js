'use strict';

/**
 * backend/cloud/teardown.js
 *
 * CodeBuild runs are ephemeral — they self-terminate, and the project's
 * TimeoutInMinutes is the TTL backstop, so there is no long-lived compute to
 * reap. This is the explicit cancel for an in-flight build (user aborts / our
 * orchestrator gives up), so we don't leave a build burning the customer's
 * minutes.
 *
 * NOTE: needs live-AWS verification (shares the untested CodeBuild path).
 */

const { codebuild } = require('./runner');
const { assumeConnectRole } = require('./sts');

async function stopBuild({ connection, buildId }) {
  const { credentials } = await assumeConnectRole({
    roleArn: connection.role_arn,
    externalId: connection.external_id,
    region: connection.region,
  });
  return codebuild('StopBuild', { id: buildId }, credentials, connection.region);
}

module.exports = { stopBuild };
