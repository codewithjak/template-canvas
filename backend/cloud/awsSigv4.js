'use strict';

/**
 * backend/cloud/awsSigv4.js
 *
 * SigV4 Authorization-header signing for AWS JSON-protocol POST APIs (CodeBuild).
 * Companion to storage/s3SigV4.js (which presigns query-string GET/PUT). No AWS
 * SDK — matches the project convention.
 *
 * NOTE: cannot be exercised here (no AWS) — verify against a live API.
 */

const crypto = require('crypto');

const sha256hex = (d) => crypto.createHash('sha256').update(d, 'utf8').digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();

function signingKey(secret, dateStamp, region, service) {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

const amzDate = (d) => d.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');

/**
 * Sign a JSON POST to "https://{host}/" with X-Amz-Target.
 * @returns {{ url: string, headers: object }}
 */
function signJsonPost({ service, region, target, body, creds, host }) {
  const h = host || `${service}.${region}.amazonaws.com`;
  const now = new Date();
  const dateStr = amzDate(now);
  const dateStamp = dateStr.slice(0, 8);
  const payloadHash = sha256hex(body);

  const headers = {
    'content-type': 'application/x-amz-json-1.1',
    host: h,
    'x-amz-date': dateStr,
    'x-amz-target': target,
    ...(creds.sessionToken ? { 'x-amz-security-token': creds.sessionToken } : {}),
  };

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dateStr, scope, sha256hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(creds.secretAccessKey, dateStamp, region, service), stringToSign).toString('hex');

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, `
    + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: `https://${h}/`, headers };
}

module.exports = { signJsonPost };
