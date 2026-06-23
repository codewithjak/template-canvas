'use strict';

/**
 * webhooks/dispatch.js
 *
 * Outbound webhook delivery. Given a team + event + payload, notify every
 * active endpoint that subscribed to the event:
 *
 *   - sign the body (HMAC-SHA256) so the receiver can verify authenticity,
 *   - POST it with a short timeout,
 *   - retry with backoff, and
 *   - record every attempt in webhook_deliveries (the audit/reliability log).
 *
 * `dispatchWebhook` is fire-and-forget by contract: it never throws and never
 * rejects, so callers can invoke it without awaiting and a webhook problem can
 * never break the request that triggered it. See
 * WEBHOOK_CONNECTOR_ARCHITECTURE.md, Step 3.
 */

const http = require('http');
const https = require('https');
const { getAdmin } = require('../supabaseAdmin');
const { guardedLookup } = require('./ssrfGuard');
const { sign, now } = require('./signature');

const MAX_ATTEMPTS  = 3;
const TIMEOUT_MS    = 10000;
const BACKOFF_MS    = [1000, 3000]; // waits between attempts 1→2 and 2→3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Active endpoints for a team that subscribed to `event`. Never throws → []. */
async function loadSubscribers(sb, teamId, event) {
  try {
    const { data, error } = await sb
      .from('webhook_endpoints')
      .select('id, url, secret, events')
      .eq('team_id', teamId)
      .eq('active', true);
    if (error || !data) return [];
    return data.filter((e) => Array.isArray(e.events) && e.events.includes(event));
  } catch {
    return [];
  }
}

/** Insert a pending delivery row; returns its id (or null if logging failed). */
async function openDelivery(sb, endpointId, event, payload) {
  try {
    const { data, error } = await sb
      .from('webhook_deliveries')
      .insert({ endpoint_id: endpointId, event, payload, status: 'pending' })
      .select('id')
      .single();
    return error ? null : data.id;
  } catch {
    return null;
  }
}

/** Patch a delivery row with the outcome. Best-effort; never throws. */
async function closeDelivery(sb, id, patch) {
  if (!id) return;
  try {
    await sb.from('webhook_deliveries').update(patch).eq('id', id);
  } catch {
    /* audit write failed — nothing else we can do */
  }
}

/**
 * One signed POST with a timeout. Resolves the HTTP status, or null on error
 * (network failure, timeout, or an SSRF-blocked target — guardedLookup refuses
 * to resolve to a private/reserved address, so the request can only ever reach
 * a public IP).
 */
function postOnce(urlString, body, headers) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(urlString);
    } catch {
      return resolve(null);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return resolve(null);

    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        method:   'POST',
        hostname: u.hostname,
        port:     u.port || (u.protocol === 'https:' ? 443 : 80),
        path:     u.pathname + u.search,
        headers:  { ...headers, 'Content-Length': Buffer.byteLength(body) },
        lookup:   guardedLookup, // SSRF: only resolves to public addresses
      },
      (res) => {
        res.resume(); // drain so the socket can close
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

/** True for a 2xx HTTP status. */
const isOk = (status) => status != null && status >= 200 && status < 300;

/**
 * Deliver one event to one endpoint: sign, then attempt up to MAX_ATTEMPTS with
 * backoff, updating the audit row as it goes. Resolves when done; never throws.
 */
async function deliver(sb, endpoint, event, payload) {
  const body       = JSON.stringify(payload);
  const timestamp  = now();
  const deliveryId = await openDelivery(sb, endpoint.id, event, payload);
  const headers    = {
    'Content-Type':       'application/json',
    'X-MapDoc-Event':     event,
    'X-MapDoc-Timestamp': timestamp,
    // Signature covers "<timestamp>.<body>" → receivers reject stale/replayed deliveries.
    'X-MapDoc-Signature': sign(endpoint.secret, timestamp, body),
    // Stable per-delivery id → receivers can dedupe (idempotency key).
    'X-MapDoc-Delivery':  deliveryId || '',
  };

  let lastStatus = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastStatus = await postOnce(endpoint.url, body, headers);

    if (isOk(lastStatus)) {
      await closeDelivery(sb, deliveryId, {
        status: 'success', attempts: attempt,
        response_code: lastStatus, last_attempt_at: new Date().toISOString(),
      });
      return;
    }

    const backoff = BACKOFF_MS[attempt - 1];
    if (attempt < MAX_ATTEMPTS && backoff) await sleep(backoff);
  }

  // Exhausted every attempt → dead-letter.
  await closeDelivery(sb, deliveryId, {
    status: 'dead', attempts: MAX_ATTEMPTS,
    response_code: lastStatus, last_attempt_at: new Date().toISOString(),
  });
}

/**
 * Notify all of a team's subscribers of `event`. Fire-and-forget: resolves once
 * every endpoint has been attempted, but never throws — safe to call without
 * awaiting.
 *
 * @param {string} teamId
 * @param {string} event    e.g. 'document.generated'
 * @param {object} payload  JSON-serialisable event body
 */
async function dispatchWebhook(teamId, event, payload) {
  try {
    const sb = getAdmin();
    if (!sb) return;
    const subscribers = await loadSubscribers(sb, teamId, event);
    await Promise.all(subscribers.map((e) => deliver(sb, e, event, payload)));
  } catch (err) {
    console.warn('[webhooks] dispatch failed:', err.message);
  }
}

// `deliverToEndpoint` is the single-endpoint delivery (records a fresh attempt
// row). Exposed for manual redelivery (routes/webhooks.js).
module.exports = { dispatchWebhook, deliverToEndpoint: deliver };
