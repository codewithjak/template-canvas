'use strict';

/**
 * routes/webhooks.js
 *
 * Manage a team's outbound webhook endpoints (API-key authed):
 *
 *   POST   /v1/webhooks        register an endpoint  → returns the secret ONCE
 *   GET    /v1/webhooks        list endpoints        → never returns secrets
 *   DELETE /v1/webhooks/:id    remove an endpoint
 *
 * These rows are what webhooks/dispatch.js delivers to. Connector platforms
 * (Zapier REST Hooks, Step 4) ultimately call the same create/delete on the
 * user's behalf; this generic management surface also serves direct callers.
 *
 * Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');

const { httpError, sendError, requireApiTeam } = require('../lib/apiAuth');
const { KNOWN_EVENTS } = require('../webhooks/events');
const { createEndpoint, deleteEndpoint } = require('../webhooks/endpoints');
const { assertPublicUrl } = require('../webhooks/ssrfGuard');
const { listDeliveries, getDeliveryForTeam, DELIVERY_STATUSES } = require('../webhooks/deliveries');
const { deliverToEndpoint } = require('../webhooks/dispatch');

const router = express.Router();

/** Validate + normalise the create body, or throw an httpError. */
function parseEndpointInput(body) {
  const url = String((body && body.url) || '').trim();
  assertPublicUrl(url); // scheme + SSRF guard (rejects private/reserved targets)

  const events = Array.isArray(body && body.events) ? body.events : [];
  if (events.length === 0) {
    throw httpError(400, '"events" must list at least one event.');
  }
  const unknown = events.filter((e) => !KNOWN_EVENTS.includes(e));
  if (unknown.length) {
    throw httpError(400, `Unknown event(s): ${unknown.join(', ')}. Known: ${KNOWN_EVENTS.join(', ')}.`);
  }
  return { url, events };
}

/** Non-secret view of an endpoint row for list responses. */
function publicEndpoint(row) {
  return {
    id:         row.id,
    url:        row.url,
    events:     row.events,
    active:     row.active,
    created_at: row.created_at,
  };
}

// ── POST /v1/webhooks ─────────────────────────────────────────────────────────
router.post('/v1/webhooks', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const { url, events } = parseEndpointInput(req.body);

    const { endpoint, secret } = await createEndpoint(sb, { teamId, url, events, source: 'manual' });

    // The secret is returned ONLY here — store it to verify signatures.
    return res.status(201).json({ ...endpoint, secret });
  } catch (err) {
    return sendError(res, '[v1/webhooks:create]', err);
  }
});

// ── GET /v1/webhooks ────────────────────────────────────────────────────────────
router.get('/v1/webhooks', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const { data, error } = await sb
      .from('webhook_endpoints')
      .select('id, url, events, active, created_at')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return res.json({ endpoints: (data || []).map(publicEndpoint) });
  } catch (err) {
    return sendError(res, '[v1/webhooks:list]', err);
  }
});

// ── DELETE /v1/webhooks/:id ───────────────────────────────────────────────────
router.delete('/v1/webhooks/:id', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const removed = await deleteEndpoint(sb, teamId, req.params.id);
    if (!removed) throw httpError(404, 'Webhook endpoint not found.');
    return res.json({ ok: true, id: req.params.id });
  } catch (err) {
    return sendError(res, '[v1/webhooks:delete]', err);
  }
});

// ── GET /v1/webhooks/deliveries ───────────────────────────────────────────────
// The delivery audit log: recent attempts, newest first. Filter with
// ?endpointId=… and/or ?status=pending|success|failed|dead, ?limit=… (≤200).
router.get('/v1/webhooks/deliveries', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const { endpointId, status, limit } = req.query;
    if (status && !DELIVERY_STATUSES.includes(status)) {
      throw httpError(400, `Unknown status. Known: ${DELIVERY_STATUSES.join(', ')}.`);
    }
    const deliveries = await listDeliveries(sb, teamId, { endpointId, status, limit });
    return res.json({ deliveries });
  } catch (err) {
    return sendError(res, '[v1/webhooks:deliveries]', err);
  }
});

// ── POST /v1/webhooks/deliveries/:id/redeliver ────────────────────────────────
// Re-attempt a past delivery (e.g. a dead-lettered one). Records a NEW attempt
// row against the same endpoint; returns once the attempt completes.
router.post('/v1/webhooks/deliveries/:id/redeliver', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const found = await getDeliveryForTeam(sb, teamId, req.params.id);
    if (!found) throw httpError(404, 'Delivery not found.');
    await deliverToEndpoint(sb, found.endpoint, found.delivery.event, found.delivery.payload);
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, '[v1/webhooks:redeliver]', err);
  }
});

module.exports = router;
