'use strict';

/**
 * backend/cloud/sts.js
 *
 * STS AssumeRole for verifying / using a customer's Connect role. Uses a proper
 * header-signed POST (the AWS Query protocol), NOT the S3 presigned-URL style,
 * so the signature matches what STS expects. No AWS SDK.
 *
 * NOTE: exercise against a real account; signing bugs surface as
 * SignatureDoesNotMatch.
 */

const https = require('https');
const { signPost } = require('./awsSigv4');

function platformCreds() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };
}

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { method: 'POST', hostname: u.hostname, path: u.pathname, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Read a single flat XML field (STS responses are simple, no XML dep needed). */
function xmlField(body, tag) {
  const m = String(body).match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}

/**
 * Assume the customer's Connect role with the ExternalId.
 * @returns {Promise<{ accountId: string|null, assumedRoleArn: string, credentials: object }>}
 */
async function assumeConnectRole({ roleArn, externalId, region = 'us-east-1' }) {
  const creds = platformCreds();
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    const e = new Error('Platform AWS credentials are not configured.');
    e.code = 'NO_AWS_CREDS';
    e.status = 503;
    throw e;
  }

  const body = new URLSearchParams({
    Action: 'AssumeRole',
    Version: '2011-06-15',
    RoleArn: roleArn,
    RoleSessionName: 'mapdoc-connect-verify',
    ExternalId: externalId,
    DurationSeconds: '900',
  }).toString();

  const { url, headers } = signPost({
    service: 'sts',
    region,
    contentType: 'application/x-www-form-urlencoded; charset=utf-8',
    body,
    creds,
  });

  const res = await httpsPost(url, headers, body);
  if (res.status !== 200) {
    const e = new Error(xmlField(res.body, 'Message') || `STS AssumeRole failed (${res.status}).`);
    e.code = 'ASSUME_FAILED';
    e.status = 400;
    throw e;
  }

  const assumedRoleArn = xmlField(res.body, 'Arn') || ''; // arn:aws:sts::ACCOUNT:assumed-role/...
  const accountId = assumedRoleArn.split(':')[4] || null;
  const credentials = {
    accessKeyId: xmlField(res.body, 'AccessKeyId'),
    secretAccessKey: xmlField(res.body, 'SecretAccessKey'),
    sessionToken: xmlField(res.body, 'SessionToken'),
    expiration: xmlField(res.body, 'Expiration'),
  };
  return { accountId, assumedRoleArn, credentials };
}

module.exports = { assumeConnectRole };
