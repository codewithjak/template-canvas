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
const { parsePlanJson } = require('./planParser');

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

/**
 * Run a buildspec against the customer's account; return the uploaded result.
 * @returns {Promise<{ buildId: string, body: string }>}
 */
async function runBuild({ connection, hcl, buildspec: spec, stateBucket, lockTable, runnerProject }) {
  const region = connection.region;
  const { credentials } = await assumeConnectRole({
    roleArn: connection.role_arn,
    externalId: connection.external_id,
    region,
  });

  const key = `results/${connection.id}-${Date.now()}.out`;
  const host = `${stateBucket}.s3.${region}.amazonaws.com`;
  const putUrl = presignUrl({ method: 'PUT', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });
  const getUrl = presignUrl({ method: 'GET', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });

  const started = await codebuild('StartBuild', {
    projectName: runnerProject,
    buildspecOverride: spec,
    environmentVariablesOverride: [
      { name: 'TF_HCL_B64', value: Buffer.from(hcl).toString('base64'), type: 'PLAINTEXT' },
      { name: 'TF_STATE_BUCKET', value: stateBucket, type: 'PLAINTEXT' },
      { name: 'TF_STATE_KEY', value: `state/${connection.id}.tfstate`, type: 'PLAINTEXT' },
      { name: 'TF_LOCK_TABLE', value: lockTable, type: 'PLAINTEXT' },
      { name: 'TF_RESULT_URL', value: putUrl, type: 'PLAINTEXT' },
    ],
  }, credentials, region);

  const buildId = started.build && started.build.id;
  if (!buildId) throw new Error('CodeBuild did not return a build id.');

  for (let i = 0; i < 120; i += 1) {
    await sleep(5000);
    const got = await codebuild('BatchGetBuilds', { ids: [buildId] }, credentials, region);
    const b = (got.builds && got.builds[0]) || {};
    if (b.buildStatus && b.buildStatus !== 'IN_PROGRESS') break;
  }

  const res = await httpsRequest('GET', getUrl, {}, null);
  if (res.status !== 200) throw new Error('Result not available (build may have failed).');
  return { buildId, body: res.body };
}

async function runPlan(args) {
  const { body } = await runBuild({ ...args, buildspec: planBuildspec() });
  return parsePlanJson(body);
}

module.exports = { runBuild, runPlan, codebuild, httpsRequest, buildspec, planBuildspec };
