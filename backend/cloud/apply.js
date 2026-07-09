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
 * Keep only NON-sensitive terraform outputs. `terraform output -json` includes the
 * VALUES of outputs a config marked `sensitive` (a generated password, a token) —
 * those must never land in Mapdoc's DB; secrets stay in the customer's account
 * (CLOUD_BUILDER_TRUST_ARCHITECTURE.md). We drop such outputs entirely (name AND
 * value), keeping the safe endpoints/ARNs the canvas shows. Shape is preserved for
 * every kept entry, so the UI is unaffected.
 */
function nonSensitiveOutputs(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [name, o] of Object.entries(raw)) {
    // `terraform output -json` wraps each output as { value, type, sensitive }.
    if (o && typeof o === 'object' && o.sensitive === true) continue;
    out[name] = o;
  }
  return out;
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
  // Filter sensitive outputs at capture, so a secret value never reaches the DB.
  try { outputs = nonSensitiveOutputs(JSON.parse(body)); } catch { /* output may be empty on no-op */ }
  return { outputs };
}

module.exports = { runApply, applyBuildspec, nonSensitiveOutputs };
