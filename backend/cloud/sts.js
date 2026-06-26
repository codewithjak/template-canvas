'use strict';

/**
 * backend/cloud/sts.js
 *
 * STS AssumeRole for verifying a customer's Connect role — using the project's
 * own SigV4 signer (storage/s3SigV4.js), NOT the AWS SDK, to match the no-SDK
 * convention in s3Store.js.
 *
 * We presign a GET to the regional STS endpoint for Action=AssumeRole with the
 * ExternalId, fetch it, and read the account id out of the returned ARN. This
 * proves the cross-account trust is wired correctly.
 *
 * NOTE: cannot be exercised without real platform AWS credentials + a real
 * customer account — verify against AWS in a live environment.
 */

const https = require('https');
const { presignUrl } = require('../storage/s3SigV4');

function platformCreds() {
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  };
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

/** Read a single flat XML field (STS responses are simple, no XML dep needed). */
function xmlField(body, tag) {
  const m = String(body).match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1] : null;
}

/**
 * Assume the customer's Connect role with the ExternalId.
 * @returns {Promise<{ accountId: string|null, assumedRoleArn: string }>}
 */
async function assumeConnectRole({ roleArn, externalId, region = 'us-east-1' }) {
  const creds = platformCreds();
  if (!creds.accessKeyId || !creds.secretAccessKey) {
    const e = new Error('Platform AWS credentials are not configured.');
    e.code = 'NO_AWS_CREDS';
    e.status = 503;
    throw e;
  }

  const host = `sts.${region}.amazonaws.com`;
  const url = presignUrl({
    method: 'GET',
    host,
    region,
    service: 'sts',
    key: '', // canonical URI '/'
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken,
    expiresIn: 60,
    query: {
      Action: 'AssumeRole',
      Version: '2011-06-15',
      RoleArn: roleArn,
      RoleSessionName: 'mapdoc-connect-verify',
      ExternalId: externalId,
      DurationSeconds: '900',
    },
  });

  const { status, body } = await httpGet(url);
  if (status !== 200) {
    const e = new Error(xmlField(body, 'Message') || `STS AssumeRole failed (${status}).`);
    e.code = 'ASSUME_FAILED';
    e.status = 400;
    throw e;
  }

  const assumedRoleArn = xmlField(body, 'Arn') || ''; // arn:aws:sts::ACCOUNT:assumed-role/...
  const accountId = assumedRoleArn.split(':')[4] || null;
  return { accountId, assumedRoleArn };
}

module.exports = { assumeConnectRole };
