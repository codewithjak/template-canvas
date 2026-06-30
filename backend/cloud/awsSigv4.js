'use strict';

/**
 * backend/cloud/awsSigv4.js
 *
 * SigV4 Authorization-header signing for AWS POST APIs. Header-based (not the S3
 * presigned-URL style), with a real payload hash, so it works for the STS Query
 * protocol (form-encoded) and the CodeBuild JSON protocol. No AWS SDK.
 *
 * NOTE: verify against live AWS — signing bugs surface as SignatureDoesNotMatch.
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
 * Sign a POST to "https://{host}/" with header-based SigV4.
 * @param {object} o
 * @param {string} o.service       e.g. 'sts' | 'codebuild'
 * @param {string} o.region
 * @param {string} o.contentType   e.g. 'application/x-www-form-urlencoded; charset=utf-8'
 * @param {string} o.body          the request body (hashed for the signature)
 * @param {object} o.creds         { accessKeyId, secretAccessKey, sessionToken? }
 * @param {string} [o.target]      X-Amz-Target (JSON protocol services)
 * @param {string} [o.host]
 * @returns {{ url: string, headers: object }}
 */
function signPost(o) {
  const host = o.host || `${o.service}.${o.region}.amazonaws.com`;
  const now = new Date();
  const dateStr = amzDate(now);
  const dateStamp = dateStr.slice(0, 8);
  const payloadHash = sha256hex(o.body);

  const headers = {
    'content-type': o.contentType,
    host,
    'x-amz-date': dateStr,
    ...(o.target ? { 'x-amz-target': o.target } : {}),
    ...(o.creds.sessionToken ? { 'x-amz-security-token': o.creds.sessionToken } : {}),
  };

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const scope = `${dateStamp}/${o.region}/${o.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dateStr, scope, sha256hex(canonicalRequest)].join('\n');
  const signature = hmac(signingKey(o.creds.secretAccessKey, dateStamp, o.region, o.service), stringToSign).toString('hex');

  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${o.creds.accessKeyId}/${scope}, `
    + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: `https://${host}/`, headers };
}

/** Convenience wrapper for AWS JSON-protocol services (CodeBuild). */
function signJsonPost({ service, region, target, body, creds, host }) {
  return signPost({ service, region, host, target, body, creds, contentType: 'application/x-amz-json-1.1' });
}

module.exports = { signPost, signJsonPost };
