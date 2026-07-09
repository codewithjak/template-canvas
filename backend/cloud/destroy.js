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
  const { pending } = await runBuild({
    connection,
    hcl,
    buildspec: destroyBuildspec(),
    stateBucket,
    lockTable,
    runnerProject,
    stateKey,
  });
  // Destroy is a lifecycle op, not a reconciled run — it must confirm completion or
  // fail. If the build outlived the inline poll, surface that rather than reporting a
  // teardown that hasn't finished.
  if (pending) throw new Error('Destroy did not complete within the wait window; check the build and retry.');
  return { destroyed: true };
}

module.exports = { runDestroy, destroyBuildspec };
