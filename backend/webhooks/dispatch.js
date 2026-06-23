'use strict';

/**
 * webhooks/dispatch.js
 *
 * Outbound webhook delivery with DURABLE retries.
 *
 * Each delivery is a row in webhook_deliveries that carries its own retry
 * schedule (`status` + `attempts` + `next_attempt_at`). A delivery is attempted
 * once inline (for low latency on the happy path); if it fails it is marked
 * `failed` with a future `next_attempt_at`, and a background worker
 * (`startRetryWorker`) re-attempts due deliveries on a timer. Because the
 * schedule lives in the database, retries survive process restarts — unlike an
 * in-memory `setTimeout`. After `MAX_ATTEMPTS` it becomes `dead` (recoverable
 * via the manual redeliver endpoint).
 *
 * `dispatchWebhook` is fire-and-forget: it never throws, so a webhook problem
 * can't break the request that triggered it. See WEBHOOK_CONNECTOR_ARCHITECTURE.md.
 *
 * NOTE: the worker has no cross-instance lock; on a single backend instance the
 * in-process `workerBusy` guard prevents overlap. Running multiple instances
 * would need a claim (e.g. SELECT … FOR UPDATE SKIP LOCKED) to avoid double-sends.
 */

const http = require('http');
const https = require('https');
const { getAdmin } = require('../supabaseAdmin');
const { guardedLookup } = require('./ssrfGuard');
const { sign, now } = require('./signature');

const MAX_ATTEMPTS      = parseInt(process.env.WEBHOOK_MAX_ATTEMPTS, 10) || 5;
const TIMEOUT_MS        = 10000;
const WORKER_INTERVAL_MS = parseInt(process.env.WEBHOOK_RETRY_INTERVAL_MS, 10) || 60000;
const WORKER_BATCH      = parseInt(process.env.WEBHOOK_RETRY_BATCH, 10) || 50;
// Delay (seconds) before the Nth retry: after attempt 1, 2, 3, 4 (capped).
const RETRY_BACKOFF_SEC = [60, 300, 900, 3600];
// A freshly-created delivery is leased this far ahead, so the worker won't grab
// it before its inline attempt — and WILL pick it up if the process crashes first.
const CLAIM_LEASE_SEC   = 60;

const isOk = (status) => status != null && status >= 200 && status < 300;
const backoffSec = (attempts) => RETRY_BACKOFF_SEC[Math.min(attempts - 1, RETRY_BACKOFF_SEC.length - 1)];

// ── Persistence helpers ─────────────────────────────────────────────────────────

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

/** Load one endpoint (for the worker, which only has a delivery's endpoint_id). */
async function loadEndpointById(sb, id) {
  try {
    const { data } = await sb
      .from('webhook_endpoints')
      .select('id, url, secret, events, active')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

/** Insert a pending delivery row; returns its id (or null if logging failed). */
async function openDelivery(sb, endpointId, event, payload) {
  try {
    const next = new Date(Date.now() + CLAIM_LEASE_SEC * 1000).toISOString();
    const { data, error } = await sb
      .from('webhook_deliveries')
      .insert({ endpoint_id: endpointId, event, payload, status: 'pending', attempts: 0, next_attempt_at: next })
      .select('id')
      .single();
    return error ? null : data.id;
  } catch {
    return null;
  }
}

/** Patch a delivery row. Best-effort; never throws. */
async function updateDelivery(sb, id, patch) {
  if (!id) return;
  try {
    await sb.from('webhook_deliveries').update(patch).eq('id', id);
  } catch {
    /* audit write failed — nothing else we can do */
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────────

/**
 * One signed POST with a timeout. Resolves the HTTP status, or null on error
 * (network failure, timeout, or an SSRF-blocked target — guardedLookup refuses
 * to resolve to a private/reserved address).
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
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ── Attempt + schedule ───────────────────────────────────────────────────────────

/**
 * Make ONE delivery attempt and persist the outcome:
 *   2xx                  → success (no further retries)
 *   fail, attempts < MAX → failed, with next_attempt_at = now + backoff
 *   fail, attempts ≥ MAX → dead
 *
 * @param {object} delivery { id, event, payload, attempts }  (attempts so far)
 * @returns {Promise<'success'|'failed'|'dead'>}
 */
async function attemptOnce(sb, delivery, endpoint) {
  const body      = JSON.stringify(delivery.payload);
  const timestamp = now();
  const status = await postOnce(endpoint.url, body, {
    'Content-Type':       'application/json',
    'X-MapDoc-Event':     delivery.event,
    'X-MapDoc-Timestamp': timestamp,
    'X-MapDoc-Signature': sign(endpoint.secret, timestamp, body),
    'X-MapDoc-Delivery':  delivery.id,
  });

  const attempts = (delivery.attempts || 0) + 1;
  const at = new Date().toISOString();

  if (isOk(status)) {
    await updateDelivery(sb, delivery.id, {
      status: 'success', attempts, response_code: status, last_attempt_at: at, next_attempt_at: null,
    });
    return 'success';
  }
  if (attempts >= MAX_ATTEMPTS) {
    await updateDelivery(sb, delivery.id, {
      status: 'dead', attempts, response_code: status, last_attempt_at: at, next_attempt_at: null,
    });
    return 'dead';
  }
  await updateDelivery(sb, delivery.id, {
    status: 'failed', attempts, response_code: status, last_attempt_at: at,
    next_attempt_at: new Date(Date.now() + backoffSec(attempts) * 1000).toISOString(),
  });
  return 'failed';
}

/** Create a delivery row and make its first attempt. Used by dispatch + redeliver/ping. */
async function startDelivery(sb, endpoint, event, payload) {
  const id = await openDelivery(sb, endpoint.id, event, payload);
  if (!id) return; // couldn't record it → don't send something we can't track/retry
  await attemptOnce(sb, { id, event, payload, attempts: 0 }, endpoint);
}

// ── Public: dispatch + worker ────────────────────────────────────────────────────

/**
 * Notify all of a team's subscribers of `event`. Fire-and-forget; never throws.
 */
async function dispatchWebhook(teamId, event, payload) {
  try {
    const sb = getAdmin();
    if (!sb) return;
    const subscribers = await loadSubscribers(sb, teamId, event);
    await Promise.all(subscribers.map((e) => startDelivery(sb, e, event, payload)));
  } catch (err) {
    console.warn('[webhooks] dispatch failed:', err.message);
  }
}

/** Deliveries that are due for a (re)attempt. */
async function fetchDueDeliveries(sb) {
  try {
    const { data, error } = await sb
      .from('webhook_deliveries')
      .select('id, endpoint_id, event, payload, attempts')
      .in('status', ['pending', 'failed'])
      .lte('next_attempt_at', new Date().toISOString())
      .lt('attempts', MAX_ATTEMPTS)
      .order('next_attempt_at', { ascending: true })
      .limit(WORKER_BATCH);
    return error ? [] : (data || []);
  } catch {
    return [];
  }
}

/** Re-attempt every due delivery once. Returns how many were processed. */
async function runDueRetries(sb) {
  const due = await fetchDueDeliveries(sb);
  for (const d of due) {
    const endpoint = await loadEndpointById(sb, d.endpoint_id);
    if (!endpoint) {
      await updateDelivery(sb, d.id, { status: 'dead', next_attempt_at: null, last_attempt_at: new Date().toISOString() });
      continue;
    }
    await attemptOnce(sb, d, endpoint);
  }
  return due.length;
}

let workerTimer = null;
let workerBusy = false;

/** Start the background retry sweeper (idempotent). Returns the timer. */
function startRetryWorker(intervalMs = WORKER_INTERVAL_MS) {
  if (workerTimer) return workerTimer;
  workerTimer = setInterval(async () => {
    if (workerBusy) return; // no overlap on a single instance
    workerBusy = true;
    try {
      const sb = getAdmin();
      if (sb) await runDueRetries(sb);
    } catch (err) {
      console.warn('[webhooks] retry worker error:', err.message);
    } finally {
      workerBusy = false;
    }
  }, intervalMs);
  if (workerTimer.unref) workerTimer.unref(); // don't keep the process alive for the timer
  return workerTimer;
}

module.exports = {
  dispatchWebhook,
  deliverToEndpoint: startDelivery, // redeliver / ping (records a fresh attempt, then durable retries)
  runDueRetries,
  startRetryWorker,
};
