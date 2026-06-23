'use strict';

/**
 * storage/s3Store.js
 *
 * S3 artifact backend (no AWS SDK). Uploads the finished bulk zip with a
 * presigned PUT and hands out presigned GET URLs for download. Upload is
 * resilient: on any failure it first HEAD-checks whether the object actually
 * landed ("found ⇒ done"), and only retries if it is not there.
 *
 * Interface (consumed by storage/artifactStore.js → index.js):
 *   isRemote: true
 *   put(jobId, { filePath, contentType })            -> Promise<void>  (throws if it ultimately fails)
 *   downloadTarget(jobId, { fileName, expiresInMs }) -> Promise<{ url, expiresAt }>
 *
 * createS3Store() takes its credentials/transport injected, so the logic is unit
 * testable without real AWS. fromEnv() wires the production transport + env.
 *
 * See S3_SETUP.md for bucket/IAM/lifecycle configuration.
 */

const fs = require('fs');
const https = require('https');
const { presignUrl } = require('./s3SigV4');

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 2000]; // between attempts 1→2 and 2→3
const UPLOAD_URL_TTL = 900;     // seconds; presigned PUT is used immediately
const HEAD_URL_TTL = 60;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (status) => status >= 200 && status < 300;

/** Strip characters that would break a Content-Disposition header value. */
function safeName(name) {
  return String(name || 'document.zip').replace(/["\r\n]/g, '');
}

/** Production HTTP transport: streams uploads, issues HEAD checks. */
function httpsTransport() {
  return {
    upload(url, filePath, contentType) {
      return new Promise((resolve, reject) => {
        const u = new URL(url);
        const headers = {
          'Content-Type':   contentType || 'application/octet-stream',
          'Content-Length': fs.statSync(filePath).size,
        };
        const req = https.request(
          { method: 'PUT', hostname: u.hostname, path: u.pathname + u.search, headers },
          (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); },
        );
        req.on('error', reject);
        fs.createReadStream(filePath).on('error', reject).pipe(req);
      });
    },
    head(url) {
      return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request(
          { method: 'HEAD', hostname: u.hostname, path: u.pathname + u.search },
          (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); },
        );
        req.on('error', reject);
        req.end();
      });
    },
  };
}

/**
 * @param {object} cfg
 * @param {string} cfg.region
 * @param {string} cfg.bucket
 * @param {string} [cfg.prefix='artifacts']
 * @param {{accessKeyId,secretAccessKey,sessionToken?}} cfg.credentials
 * @param {object} [cfg.transport]  injected for tests; defaults to real HTTPS
 */
function createS3Store(cfg) {
  const prefix    = (cfg.prefix || 'artifacts').replace(/\/+$/, '');
  const host      = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const transport = cfg.transport || httpsTransport();
  const creds     = cfg.credentials || {};

  const keyFor = (jobId) => `${prefix}/${jobId}.zip`;

  function sign(method, key, { expiresIn, query }) {
    return presignUrl({
      method, host, region: cfg.region, service: 's3', key,
      accessKeyId:     creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken:    creds.sessionToken,
      expiresIn, query,
    });
  }

  /** True if the object is already in the bucket. Never throws. */
  async function exists(key) {
    try {
      const { status } = await transport.head(sign('HEAD', key, { expiresIn: HEAD_URL_TTL }));
      return ok(status);
    } catch {
      return false;
    }
  }

  /** Upload with retry; "found ⇒ done" before each retry. Throws if it fails. */
  async function put(jobId, { filePath, contentType }) {
    const key = keyFor(jobId);
    let last = 0;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { status } = await transport.upload(
          sign('PUT', key, { expiresIn: UPLOAD_URL_TTL }), filePath, contentType,
        );
        last = status;
        if (ok(status)) return;
      } catch (err) {
        last = err && err.status ? err.status : 0;
      }

      // Failure → first check whether it actually landed; only retry if not.
      if (await exists(key)) return;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(BACKOFF_MS[attempt - 1]);
    }

    throw new Error(`S3 upload failed for ${key} after ${MAX_ATTEMPTS} attempts (last status ${last}).`);
  }

  /** Presigned GET URL + matching expiry, for the webhook payload / redirect. */
  async function downloadTarget(jobId, { fileName, expiresInMs }) {
    const expiresIn = Math.max(1, Math.floor(expiresInMs / 1000));
    const url = sign('GET', keyFor(jobId), {
      expiresIn,
      query: { 'response-content-disposition': `attachment; filename="${safeName(fileName)}"` },
    });
    return { url, expiresAt: new Date(Date.now() + expiresInMs).toISOString() };
  }

  return { isRemote: true, keyFor, exists, put, downloadTarget };
}

/** Build the store from environment configuration (see S3_SETUP.md). */
function fromEnv() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_ARTIFACT_BUCKET;
  if (!region || !bucket) {
    throw new Error('S3 artifact store requires AWS_REGION and S3_ARTIFACT_BUCKET.');
  }
  return createS3Store({
    region,
    bucket,
    prefix: process.env.S3_ARTIFACT_PREFIX || 'artifacts',
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken:    process.env.AWS_SESSION_TOKEN,
    },
  });
}

module.exports = { createS3Store, fromEnv };
