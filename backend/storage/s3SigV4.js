'use strict';

/**
 * storage/s3SigV4.js
 *
 * AWS Signature Version 4 — query-string ("presigned URL") signing for S3,
 * implemented with Node's `crypto` only (no AWS SDK). Pure and deterministic:
 * no network, no clock dependency unless you let it default `date`. This is the
 * one security-sensitive piece, so it is isolated here and unit-tested against
 * AWS's documented known-answer vector.
 *
 * Presigned PUT/GET/HEAD all use the UNSIGNED-PAYLOAD content hash and sign only
 * the `host` header, which is what lets a plain HTTP client (or a browser
 * following a redirect) use the URL with no extra headers.
 */

const crypto = require('crypto');

/** SHA-256 hex digest of a string/buffer. */
function sha256hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** HMAC-SHA256, returning a Buffer so keys can be chained. */
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/** Derive the SigV4 signing key for (date, region, service). */
function signingKey(secret, dateStamp, region, service) {
  const kDate    = hmac(`AWS4${secret}`, dateStamp);
  const kRegion  = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

/** RFC-3986 encoding (encodeURIComponent plus the chars it leaves out). */
function enc(str) {
  return encodeURIComponent(String(str)).replace(/[!*'()]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Encode an object key as a canonical URI path, preserving "/". */
function encPath(key) {
  return '/' + String(key).split('/').map(enc).join('/');
}

/** Date → "YYYYMMDDTHHMMSSZ". */
function toAmzDate(d) {
  return d.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Build a presigned S3 URL.
 *
 * @param {object} o
 * @param {string} o.method       'GET' | 'PUT' | 'HEAD'
 * @param {string} o.host         e.g. 'bucket.s3.us-east-1.amazonaws.com'
 * @param {string} o.region
 * @param {string} [o.service='s3']
 * @param {string} o.key          object key (no leading slash)
 * @param {string} o.accessKeyId
 * @param {string} o.secretAccessKey
 * @param {string} [o.sessionToken]
 * @param {number} o.expiresIn    seconds the URL stays valid
 * @param {object} [o.query]      extra signed query params (e.g. response-content-disposition)
 * @param {Date|string} [o.date]  signing time (defaults to now)
 * @returns {string} the fully signed URL
 */
function presignUrl(o) {
  const service = o.service || 's3';
  const d = o.date instanceof Date ? o.date : (o.date ? new Date(o.date) : new Date());
  const amzDate   = toAmzDate(d);
  const dateStamp = amzDate.slice(0, 8);
  const scope     = `${dateStamp}/${o.region}/${service}/aws4_request`;

  const params = {
    'X-Amz-Algorithm':     'AWS4-HMAC-SHA256',
    'X-Amz-Credential':    `${o.accessKeyId}/${scope}`,
    'X-Amz-Date':          amzDate,
    'X-Amz-Expires':       String(o.expiresIn),
    'X-Amz-SignedHeaders': 'host',
    ...(o.sessionToken ? { 'X-Amz-Security-Token': o.sessionToken } : {}),
    ...(o.query || {}),
  };

  const canonicalQuery = Object.keys(params).sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join('&');
  const canonicalUri = encPath(o.key);

  const canonicalRequest = [
    o.method,
    canonicalUri,
    canonicalQuery,
    `host:${o.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const signature = hmac(
    signingKey(o.secretAccessKey, dateStamp, o.region, service),
    stringToSign,
  ).toString('hex');

  return `https://${o.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

module.exports = { presignUrl, toAmzDate };
