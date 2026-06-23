'use strict';

/**
 * routes/webhooks.js
 *
 * Manage a team's outbound webhook endpoints. Dual-authed via `requireTeam`:
 * the signed-in user (Supabase JWT, from the settings UI) OR a tc_live API key
 * (curl / external callers). Both require the Business `api` capability.
 *
 *   POST   /v1/webhooks            register an endpoint → returns the secret ONCE
 *   GET    /v1/webhooks            list endpoints       → never returns secrets
 *   PATCH  /v1/webhooks/:id        pause/resume (active)
 *   DELETE /v1/webhooks/:id        remove an endpoint
 *   POST   /v1/webhooks/:id/rotate-secret | /ping
 *   GET    /v1/webhooks/deliveries           audit log
 *   POST   /v1/webhooks/deliveries/:id/redeliver
 *
 * These rows are what webhooks/dispatch.js delivers to.
 *
 * Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');

const { httpError, sendError, requireTeam } = require('../lib/apiAuth');
const { KNOWN_EVENTS } = require('../webhooks/events');
const { createEndpoint, deleteEndpoint, getEndpoint, rotateSecret, setActive } = require('../webhooks/endpoints');
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
    const { teamId, sb } = await requireTeam(req);
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
    const { teamId, sb } = await requireTeam(req);
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
    const { teamId, sb } = await requireTeam(req);
    const removed = await deleteEndpoint(sb, teamId, req.params.id);
    if (!removed) throw httpError(404, 'Webhook endpoint not found.');
    return res.json({ ok: true, id: req.params.id });
  } catch (err) {
    return sendError(res, '[v1/webhooks:delete]', err);
  }
});

// ── PATCH /v1/webhooks/:id ────────────────────────────────────────────────────
// Pause/resume an endpoint. Body: { active: boolean }. A paused endpoint is
// skipped by dispatch but can still be ping-tested.
router.patch('/v1/webhooks/:id', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const active = req.body && req.body.active;
    if (typeof active !== 'boolean') throw httpError(400, '"active" (boolean) is required.');
    const updated = await setActive(sb, teamId, req.params.id, active);
    if (!updated) throw httpError(404, 'Webhook endpoint not found.');
    return res.json(publicEndpoint(updated));
  } catch (err) {
    return sendError(res, '[v1/webhooks:update]', err);
  }
});

// ── POST /v1/webhooks/:id/rotate-secret ───────────────────────────────────────
// Mint a new signing secret. Returned ONCE; the old secret stops working.
router.post('/v1/webhooks/:id/rotate-secret', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const secret = await rotateSecret(sb, teamId, req.params.id);
    if (!secret) throw httpError(404, 'Webhook endpoint not found.');
    return res.json({ id: req.params.id, secret });
  } catch (err) {
    return sendError(res, '[v1/webhooks:rotate]', err);
  }
});

// ── POST /v1/webhooks/:id/ping ────────────────────────────────────────────────
// Send a signed `webhook.test` event to verify connectivity. Works on paused
// endpoints too; the attempt is recorded in the delivery log like any other.
router.post('/v1/webhooks/:id/ping', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
    const endpoint = await getEndpoint(sb, teamId, req.params.id);
    if (!endpoint) throw httpError(404, 'Webhook endpoint not found.');
    await deliverToEndpoint(sb, endpoint, 'webhook.test', {
      event:     'webhook.test',
      teamId,
      endpointId: endpoint.id,
      message:   'MapDoc webhook test event',
      createdAt: new Date().toISOString(),
    });
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, '[v1/webhooks:ping]', err);
  }
});

// ── GET /v1/webhooks/deliveries ───────────────────────────────────────────────
// The delivery audit log: recent attempts, newest first. Filter with
// ?endpointId=… and/or ?status=pending|success|failed|dead, ?limit=… (≤200).
router.get('/v1/webhooks/deliveries', async (req, res) => {
  try {
    const { teamId, sb } = await requireTeam(req);
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
    const { teamId, sb } = await requireTeam(req);
    const found = await getDeliveryForTeam(sb, teamId, req.params.id);
    if (!found) throw httpError(404, 'Delivery not found.');
    await deliverToEndpoint(sb, found.endpoint, found.delivery.event, found.delivery.payload);
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, '[v1/webhooks:redeliver]', err);
  }
});

module.exports = router;
