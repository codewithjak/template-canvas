'use strict';

/**
 * backend/cloud/runner.js
 *
 * Ephemeral in-account Terraform runs (P6 plan, P7 apply). Generic `runBuild`
 * assumes the customer's Connect role, presigns a result URL on their state
 * bucket, launches the CodeBuild runner with a buildspec, polls to completion,
 * and returns the uploaded result. plan/apply differ only by buildspec.
 *
 * The runner is the customer's and disposable; we hold nothing. CodeBuild builds
 * self-terminate (the project's TimeoutInMinutes is the TTL backstop).
 *
 * NOTE: the CodeBuild/STS path cannot be exercised without real AWS — it is
 * correct-by-construction and must be verified live.
 */

const https = require('https');

const { assumeConnectRole } = require('./sts');
const { signJsonPost } = require('./awsSigv4');
const { presignUrl } = require('../storage/s3SigV4');
const { parsePlanJson, parseDriftJson } = require('./planParser');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpsRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { method, hostname: u.hostname, path: u.pathname + u.search, headers: headers || {} },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function codebuild(action, payload, creds, region) {
  const json = JSON.stringify(payload);
  const { url, headers } = signJsonPost({
    service: 'codebuild',
    region,
    target: `CodeBuild_20161006.${action}`,
    body: json,
    creds,
  });
  const res = await httpsRequest('POST', url, headers, json);
  if (res.status !== 200) throw new Error(`CodeBuild ${action} failed (${res.status}): ${res.body}`);
  return JSON.parse(res.body);
}

const credFields = (c) => ({
  accessKeyId: c.accessKeyId,
  secretAccessKey: c.secretAccessKey,
  sessionToken: c.sessionToken,
});

/** Shared buildspec preamble: HCL → main.tf, S3 backend, terraform init. */
function backendInitLines() {
  return [
    '      - echo "$TF_HCL_B64" | base64 -d > main.tf',
    '      - printf \'terraform {\\n  backend "s3" {}\\n}\\n\' > backend.tf',
    '      - terraform init -input=false'
      + ' -backend-config="bucket=$TF_STATE_BUCKET"'
      + ' -backend-config="key=$TF_STATE_KEY"'
      + ' -backend-config="region=$AWS_REGION"'
      + ' -backend-config="dynamodb_table=$TF_LOCK_TABLE"',
  ];
}

/** Wrap command lines in a CodeBuild buildspec. */
function buildspec(commands) {
  return ['version: 0.2', 'phases:', '  build:', '    commands:', ...backendInitLines(), ...commands].join('\n');
}

function planBuildspec() {
  return buildspec([
    '      - terraform plan -input=false -no-color -json > result.out || true',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ]);
}

// Inline poll window: 120 × 5s = 600s. A build slower than this is left
// non-terminal for the reconciler sweep (never falsely marked error).
const POLL_INTERVAL_MS = 5000;
const POLL_MAX = 120;

/** A CodeBuild build is terminal once it reports any status other than IN_PROGRESS. */
function isTerminal(status) {
  return Boolean(status) && status !== 'IN_PROGRESS';
}

/**
 * Start a build and return its durable handle — NO polling. The caller persists
 * the handle (immediately, per CLOUD_RUN_RECONCILIATION_ARCHITECTURE.md §6) so the
 * run is recoverable even if this process dies before the build finishes.
 * @returns {Promise<{ buildId: string, region: string, resultKey: string }>}
 */
async function startBuild({ credentials, connection, hcl, buildspec: spec, stateBucket, lockTable, runnerProject, stateKey }) {
  const region = connection.region;
  const resultKey = `results/${connection.id}-${Date.now()}.out`;
  const host = `${stateBucket}.s3.${region}.amazonaws.com`;
  const putUrl = presignUrl({ method: 'PUT', host, region, service: 's3', key: resultKey, ...credFields(credentials), expiresIn: 3600 });

  // One state key per deployment (isolates many infras in one account). Falls
  // back to the legacy per-connection key only when no deployment is supplied.
  const tfStateKey = stateKey || `state/${connection.id}.tfstate`;

  const started = await codebuild('StartBuild', {
    projectName: runnerProject,
    buildspecOverride: spec,
    environmentVariablesOverride: [
      { name: 'TF_HCL_B64', value: Buffer.from(hcl).toString('base64'), type: 'PLAINTEXT' },
      { name: 'TF_STATE_BUCKET', value: stateBucket, type: 'PLAINTEXT' },
      { name: 'TF_STATE_KEY', value: tfStateKey, type: 'PLAINTEXT' },
      { name: 'TF_LOCK_TABLE', value: lockTable, type: 'PLAINTEXT' },
      { name: 'TF_RESULT_URL', value: putUrl, type: 'PLAINTEXT' },
    ],
  }, credentials, region);

  const buildId = started.build && started.build.id;
  if (!buildId) throw new Error('CodeBuild did not return a build id.');
  return { buildId, region, resultKey };
}

/**
 * Resolve a build from its durable handle: ask CodeBuild its status and, once
 * terminal, fetch the result the buildspec uploaded. DB-free — the caller (inline
 * poll or the Phase 2 sweep) decides what to persist. Idempotent and safe to call
 * repeatedly.
 *   { pending: true }                still IN_PROGRESS — resolve again later
 *   { buildStatus, body }            terminal + result fetched
 *   { buildStatus, missing: true }   terminal but no result uploaded (real failure)
 *
 * `credentials` is optional: the inline poll passes its assume (900s covers the 600s
 * window); the sweep omits it and we assume fresh, so resolution isn't bound by the
 * original run's credential lifetime (why the sweep can finish a build the poll left).
 */
async function resolveBuild({ connection, stateBucket, buildId, region, resultKey, credentials }) {
  const creds = credentials
    || (await assumeConnectRole({ roleArn: connection.role_arn, externalId: connection.external_id, region })).credentials;
  const got = await codebuild('BatchGetBuilds', { ids: [buildId] }, creds, region);
  const b = (got.builds && got.builds[0]) || {};
  if (!isTerminal(b.buildStatus)) return { pending: true };

  const host = `${stateBucket}.s3.${region}.amazonaws.com`;
  const getUrl = presignUrl({ method: 'GET', host, region, service: 's3', key: resultKey, ...credFields(creds), expiresIn: 900 });
  const res = await httpsRequest('GET', getUrl, {}, null);
  // Terminal but no result object = the build broke before uploading — a real error,
  // distinct from "still running" (which returns pending above, never an error).
  if (res.status !== 200) return { buildStatus: b.buildStatus, missing: true };
  return { buildStatus: b.buildStatus, body: res.body };
}

/**
 * Run a buildspec against the customer's account. Assumes the Connect role once,
 * starts the build, hands the durable handle to `onStarted` (which persists it),
 * then inline-polls to completion.
 *   { buildId, body }       resolved within the inline window
 *   { buildId, pending }    still running at the window's end — NOT an error; the run
 *                           stays non-terminal for the reconciler sweep to finish.
 */
async function runBuild({ connection, hcl, buildspec: spec, stateBucket, lockTable, runnerProject, stateKey, onStarted }) {
  const region = connection.region;
  const { credentials } = await assumeConnectRole({
    roleArn: connection.role_arn,
    externalId: connection.external_id,
    region,
  });

  const handle = await startBuild({ credentials, connection, hcl, buildspec: spec, stateBucket, lockTable, runnerProject, stateKey });
  if (onStarted) await onStarted(handle);

  for (let i = 0; i < POLL_MAX; i += 1) {
    await sleep(POLL_INTERVAL_MS);
    const r = await resolveBuild({ connection, stateBucket, ...handle, credentials });
    if (r.pending) continue;
    if (r.missing) throw new Error('Result not available (build may have failed).');
    return { buildId: handle.buildId, body: r.body };
  }
  return { buildId: handle.buildId, pending: true };
}

async function runPlan(args) {
  const { body, pending } = await runBuild({ ...args, buildspec: planBuildspec() });
  if (pending) return { pending: true };
  return { plan: parsePlanJson(body) };
}

/**
 * Drift check: `plan -refresh-only -json` refreshes state from the live account
 * and reports only out-of-band changes (no config-driven changes). Same runner,
 * same parser — the diff is interpreted as a health signal, not a proposal.
 */
function driftBuildspec() {
  return buildspec([
    '      - terraform plan -input=false -refresh-only -no-color -json > result.out || true',
    '      - curl -sS -X PUT --upload-file result.out "$TF_RESULT_URL"',
  ]);
}

async function runDrift(args) {
  const { body, pending } = await runBuild({ ...args, buildspec: driftBuildspec() });
  if (pending) return { pending: true };
  return { plan: parseDriftJson(body) };
}

module.exports = {
  runBuild, startBuild, resolveBuild, isTerminal, runPlan, runDrift,
  codebuild, httpsRequest, buildspec, planBuildspec, driftBuildspec,
};
