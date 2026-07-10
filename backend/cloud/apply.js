'use strict';

/**
 * backend/cloud/apply.js
 *
 * `terraform apply` in the customer's account (P7), after a human approved the
 * plan. Captures `terraform output -json` as the result, so endpoints/ARNs are
 * persisted before the runner self-terminates.
 *
 * NOTE: needs live-AWS verification (shares the untested CodeBuild path).
 */

const { runBuild, buildspec } = require('./runner');

function applyBuildspec() {
  return buildspec([
    '      - terraform apply -input=false -auto-approve -no-color',
    '      - terraform output -json > result.out',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ]);
}

/**
 * @returns {Promise<{ outputs: object } | { pending: true }>}  terraform outputs
 * (endpoints, ARNs…), or `pending` when the apply outlived the inline poll — the run
 * stays non-terminal for the reconciler, never falsely errored.
 */
async function runApply({ connection, hcl, stateBucket, lockTable, runnerProject, stateKey, onStarted }) {
  const { body, pending } = await runBuild({
    connection,
    hcl,
    buildspec: applyBuildspec(),
    stateBucket,
    lockTable,
    runnerProject,
    stateKey,
    onStarted,
  });
  if (pending) return { pending: true };
  let outputs = {};
  try { outputs = JSON.parse(body); } catch { /* output may be empty on no-op */ }
  return { outputs };
}

module.exports = { runApply, applyBuildspec };
