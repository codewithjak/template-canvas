'use strict';

/**
 * webhooks/signature.js
 *
 * Signing + verification for outbound webhooks, with replay protection.
 *
 * Scheme (Stripe-style): each delivery carries a timestamp, and the signature is
 * an HMAC-SHA256 over `${timestamp}.${rawBody}` — NOT the body alone. A receiver
 * recomputes the HMAC and also rejects deliveries whose timestamp is outside a
 * tolerance window, so a captured request can't be replayed later.
 *
 * Headers on each delivery:
 *   X-MapDoc-Timestamp: <unix seconds>
 *   X-MapDoc-Signature: sha256=<hex>     // HMAC over "<timestamp>.<rawBody>"
 *
 * `verify` is provided for our own tests and for any consumer running on this
 * codebase; external consumers re-implement the same three lines in their stack.
 */

const crypto = require('crypto');

// How far a delivery's timestamp may drift from "now" before it's rejected.
const DEFAULT_TOLERANCE_SEC = 300; // 5 minutes

/** Current unix time in seconds, as a string (the value put in the header). */
function now() {
  return Math.floor(Date.now() / 1000).toString();
}

/** HMAC-SHA256 over `${timestamp}.${body}`, formatted "sha256=<hex>". */
function sign(secret, timestamp, body) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Constant-time string compare that tolerates length mismatch. */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Verify a delivery's signature AND freshness.
 * @returns {boolean} true only if the timestamp is within tolerance and the
 *   signature matches HMAC(secret, `${timestamp}.${body}`).
 */
function verify(secret, timestamp, body, signature, toleranceSec = DEFAULT_TOLERANCE_SEC) {
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > toleranceSec) return false; // stale / replay
  return safeEqual(signature, sign(secret, String(timestamp), body));
}

module.exports = { sign, verify, now, DEFAULT_TOLERANCE_SEC };
