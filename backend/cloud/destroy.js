'use strict';

/**
 * backend/cloud/destroy.js
 *
 * `terraform destroy` for a deployment (Phase 3 lifecycle). Tears down the infra
 * an applied deployment created, against its own state key, then the caller marks
 * the deployment destroyed. Shares the in-account CodeBuild runner with apply.
 *
 * NOTE: needs live-AWS verification (shares the untested CodeBuild path).
 */

const { runBuild, buildspec } = require('./runner');

function destroyBuildspec() {
  return buildspec([
    '      - terraform destroy -input=false -auto-approve -no-color',
    '      - echo "{}" > result.out',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ]);
}

/** @returns {Promise<{ destroyed: true }>} */
async function runDestroy({ connection, hcl, stateBucket, lockTable, runnerProject, stateKey }) {
  await runBuild({
    connection,
    hcl,
    buildspec: destroyBuildspec(),
    stateBucket,
    lockTable,
    runnerProject,
    stateKey,
  });
  return { destroyed: true };
}

module.exports = { runDestroy, destroyBuildspec };
