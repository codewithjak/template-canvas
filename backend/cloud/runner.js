'use strict';

/**
 * backend/cloud/runner.js
 *
 * Ephemeral in-account `terraform plan` (P6). Assumes the customer's Connect
 * role, presigns a results URL on their state bucket, launches the CodeBuild
 * runner with the compiled HCL, polls to completion, fetches the plan, and
 * parses it. The runner is theirs and disposable; we hold nothing.
 *
 * NOTE: the CodeBuild/STS path cannot be exercised without real AWS — it is
 * correct-by-construction and must be verified live. The route falls back to a
 * simulated plan (planSim.js) when no verified connection / credentials exist.
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

/** Buildspec: materialize the HCL, init the S3 backend, plan as JSON, upload it. */
function planBuildspec() {
  return [
    'version: 0.2',
    'phases:',
    '  build:',
    '    commands:',
    '      - echo "$TF_HCL_B64" | base64 -d > main.tf',
    '      - printf \'terraform {\\n  backend "s3" {}\\n}\\n\' > backend.tf',
    '      - terraform init -input=false'
      + ' -backend-config="bucket=$TF_STATE_BUCKET"'
      + ' -backend-config="key=$TF_STATE_KEY"'
      + ' -backend-config="region=$AWS_REGION"'
      + ' -backend-config="dynamodb_table=$TF_LOCK_TABLE"',
    '      - terraform plan -input=false -no-color -json > plan.ndjson || true',
    '      - curl -sS -X PUT --upload-file plan.ndjson "$TF_RESULT_URL"',
  ].join('\n');
}

const credFields = (c) => ({
  accessKeyId: c.accessKeyId,
  secretAccessKey: c.secretAccessKey,
  sessionToken: c.sessionToken,
});

/**
 * Run a real `terraform plan` in the customer's account.
 * @param {object} a
 * @param {object} a.connection  cloud_connections row (role_arn, external_id, region, id)
 * @param {string} a.hcl         compiled Terraform
 * @param {string} a.stateBucket
 * @param {string} a.lockTable
 * @param {string} a.runnerProject  CodeBuild project name
 */
async function runPlan({ connection, hcl, stateBucket, lockTable, runnerProject }) {
  const region = connection.region;
  const { credentials } = await assumeConnectRole({
    roleArn: connection.role_arn,
    externalId: connection.external_id,
    region,
  });

  const key = `results/plan-${connection.id}-${Date.now()}.ndjson`;
  const host = `${stateBucket}.s3.${region}.amazonaws.com`;
  const putUrl = presignUrl({ method: 'PUT', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });
  const getUrl = presignUrl({ method: 'GET', host, region, service: 's3', key, ...credFields(credentials), expiresIn: 3600 });

  const started = await codebuild('StartBuild', {
    projectName: runnerProject,
    buildspecOverride: planBuildspec(),
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

  // Poll to completion (up to ~5 min).
  for (let i = 0; i < 60; i += 1) {
    await sleep(5000);
    const got = await codebuild('BatchGetBuilds', { ids: [buildId] }, credentials, region);
    const b = (got.builds && got.builds[0]) || {};
    if (b.buildStatus && b.buildStatus !== 'IN_PROGRESS') break;
  }

  const res = await httpsRequest('GET', getUrl, {}, null);
  if (res.status !== 200) throw new Error('Plan output not available (build may have failed).');
  return parsePlanJson(res.body);
}

module.exports = { runPlan, planBuildspec };
