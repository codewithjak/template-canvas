'use strict';

/**
 * delivery/mediaStore.js
 *
 * Stores a single rendered export artifact so a delivery channel that needs a
 * web-reachable file (WhatsApp media) can fetch it. Deliberately split in two:
 *
 *   putArtifact(artifact)          -> { key, contentType }   (stores, no URL)
 *   signedUrlFor(key, { ... })     -> { url, expiresAt }      (mints URL on demand)
 *
 * Why the split: a stored/returned signed URL would be a fetchable link that
 * lives for its whole TTL. Persisting only an opaque KEY, and minting a very
 * short-lived presigned GET only at the moment the provider fetches, keeps the
 * media unexposed during the recipient's 24-hour WhatsApp session window.
 * See WHATSAPP_DELIVERY_ARCHITECTURE.md §10 A1.
 *
 * This is independent of storage/s3Store.js (which is zip/bulk-scoped) and of
 * the cloud-builder presign path (which signs against the customer's bucket with
 * assumed-role credentials). It shares only the pure signer storage/s3SigV4.js.
 */

const crypto = require('crypto');
const https = require('https');
const { presignUrl } = require('../storage/s3SigV4');

const PUT_URL_TTL      = 900;             // seconds; presigned PUT used immediately
const DEFAULT_GET_TTL_MS = 5 * 60 * 1000; // signed GET lifetime — long enough to fetch, far under 24h

const ok = (status) => status >= 200 && status < 300;

/** File extension for an artifact, from its filename or content type. */
function extensionFor({ fileName, contentType }) {
  const fromName = String(fileName || '').match(/\.[a-z0-9]+$/i);
  if (fromName) return fromName[0].toLowerCase();
  if (contentType === 'application/pdf') return '.pdf';
  if (contentType === 'image/png')       return '.png';
  if (contentType === 'image/jpeg')      return '.jpg';
  return '';
}

/** Production HTTP transport: uploads a buffer with a presigned PUT. */
function httpsTransport() {
  return {
    upload(url, buffer, contentType) {
      return new Promise((resolve, reject) => {
        const u = new URL(url);
        const headers = {
          'Content-Type':   contentType || 'application/octet-stream',
          'Content-Length': buffer.length,
        };
        const req = https.request(
          { method: 'PUT', hostname: u.hostname, path: u.pathname + u.search, headers },
          (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); },
        );
        req.on('error', reject);
        req.end(buffer);
      });
    },
  };
}

/**
 * @param {object} cfg
 * @param {string} cfg.region
 * @param {string} cfg.bucket
 * @param {string} [cfg.prefix='whatsapp-media']
 * @param {{accessKeyId,secretAccessKey,sessionToken?}} cfg.credentials
 * @param {object} [cfg.transport]  injected for tests; defaults to real HTTPS
 */
function createMediaStore(cfg) {
  const prefix    = (cfg.prefix || 'whatsapp-media').replace(/\/+$/, '');
  const host      = `${cfg.bucket}.s3.${cfg.region}.amazonaws.com`;
  const transport = cfg.transport || httpsTransport();
  const creds     = cfg.credentials || {};

  function sign(method, key, { expiresIn }) {
    return presignUrl({
      method, host, region: cfg.region, service: 's3', key,
      accessKeyId:     creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken:    creds.sessionToken,
      expiresIn,
    });
  }

  /** A fresh, unguessable object key for one artifact. */
  function newKey(artifact) {
    return `${prefix}/${crypto.randomUUID()}${extensionFor(artifact)}`;
  }

  /**
   * Upload the artifact's buffer under a new key. Returns the KEY only — never a
   * URL. Content-Type is set here so the later signed GET serves it back.
   */
  async function putArtifact(artifact) {
    const key = newKey(artifact);
    const { status } = await transport.upload(
      sign('PUT', key, { expiresIn: PUT_URL_TTL }), artifact.buffer, artifact.contentType,
    );
    if (!ok(status)) {
      throw new Error(`Media upload failed for ${key} (status ${status}).`);
    }
    return { key, contentType: artifact.contentType };
  }

  /**
   * Mint a short-lived presigned GET for `key`, only when the provider is about
   * to fetch it. Not persisted; expires well within the 24h session window.
   */
  function signedUrlFor(key, { expiresInMs = DEFAULT_GET_TTL_MS } = {}) {
    const expiresIn = Math.max(1, Math.floor(expiresInMs / 1000));
    const url = sign('GET', key, { expiresIn });
    return { url, expiresAt: new Date(Date.now() + expiresInMs).toISOString() };
  }

  return { isRemote: true, newKey, putArtifact, signedUrlFor };
}

/** True when the media store has the region + bucket it needs. */
function isConfigured() {
  return Boolean(process.env.AWS_REGION && process.env.S3_MEDIA_BUCKET);
}

/** Build the store from environment configuration. */
function fromEnv() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.S3_MEDIA_BUCKET;
  if (!region || !bucket) {
    throw new Error('Media store requires AWS_REGION and S3_MEDIA_BUCKET.');
  }
  return createMediaStore({
    region,
    bucket,
    prefix: process.env.S3_MEDIA_PREFIX || 'whatsapp-media',
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken:    process.env.AWS_SESSION_TOKEN,
    },
  });
}

module.exports = { createMediaStore, fromEnv, isConfigured, extensionFor };
