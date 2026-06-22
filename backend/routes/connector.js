'use strict';

/**
 * routes/connector.js
 *
 * The connector-facing endpoints (Step 4 of WEBHOOK_CONNECTOR_ARCHITECTURE.md).
 * These are what an automation platform — Zapier, Make, n8n — calls; they are
 * platform-agnostic because all three follow the same REST-hook pattern:
 *
 *   GET    /v1/me                connection test (auth check + team identity)
 *   POST   /v1/hooks/subscribe   a trigger turned on  → register a hook URL
 *   POST   /v1/hooks/unsubscribe a trigger turned off → remove it
 *   GET    /v1/events/sample     example payload shown while building a Zap
 *
 * subscribe/unsubscribe are thin wrappers over the same webhook_endpoints rows
 * the dispatcher (webhooks/dispatch.js) delivers to — a connector subscription
 * is just an endpoint with source='connector'.
 *
 * Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');

const { httpError, sendError, requireApiTeam } = require('../lib/apiAuth');
const { KNOWN_EVENTS, isKnownEvent, sampleEvent } = require('../webhooks/events');
const { createEndpoint, deleteEndpoint } = require('../webhooks/endpoints');

const router = express.Router();

/** Read + validate a known event name from a value, or throw an httpError. */
function requireKnownEvent(value) {
  const event = String(value || '').trim();
  if (!isKnownEvent(event)) {
    throw httpError(400, `Unknown event "${event}". Known: ${KNOWN_EVENTS.join(', ')}.`);
  }
  return event;
}

/** Read + validate an http(s) URL, or throw an httpError. */
function requireHttpUrl(value) {
  const url = String(value || '').trim();
  if (!/^https?:\/\/.+/i.test(url)) throw httpError(400, '"url" must be a valid http(s) URL.');
  return url;
}

/** Most recent delivered payload for an event on this team, or null. */
async function latestDeliveryPayload(sb, teamId, event) {
  const { data: eps } = await sb.from('webhook_endpoints').select('id').eq('team_id', teamId);
  const ids = (eps || []).map((e) => e.id);
  if (ids.length === 0) return null;

  const { data } = await sb
    .from('webhook_deliveries')
    .select('payload')
    .in('endpoint_id', ids)
    .eq('event', event)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data && data.payload) || null;
}

// ── GET /v1/me ──────────────────────────────────────────────────────────────────
// The connection test every bridge runs when a user links their account.
router.get('/v1/me', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const { data, error } = await sb.from('teams').select('name, plan').eq('id', teamId).maybeSingle();
    if (error) throw error;
    return res.json({
      teamId,
      name: (data && data.name) || null,
      plan: (data && data.plan) || 'free',
      events: KNOWN_EVENTS,
    });
  } catch (err) {
    return sendError(res, '[v1/me]', err);
  }
});

// ── POST /v1/hooks/subscribe ──────────────────────────────────────────────────
// REST-hook subscribe: a connector turned a trigger on. Body: { url, event }.
router.post('/v1/hooks/subscribe', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const url   = requireHttpUrl(req.body && req.body.url);
    const event = requireKnownEvent(req.body && req.body.event);

    const { endpoint } = await createEndpoint(sb, { teamId, url, events: [event], source: 'connector' });
    // REST-hook convention: return the subscription id; the connector sends it
    // back to /v1/hooks/unsubscribe when the trigger is turned off.
    return res.status(201).json({ id: endpoint.id });
  } catch (err) {
    return sendError(res, '[v1/hooks/subscribe]', err);
  }
});

// ── POST /v1/hooks/unsubscribe ────────────────────────────────────────────────
// REST-hook unsubscribe. Body: { id }.
router.post('/v1/hooks/unsubscribe', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const id = String((req.body && req.body.id) || '').trim();
    if (!id) throw httpError(400, '"id" is required.');

    const removed = await deleteEndpoint(sb, teamId, id);
    if (!removed) throw httpError(404, 'Subscription not found.');
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, '[v1/hooks/unsubscribe]', err);
  }
});

// ── GET /v1/events/sample?event=… ─────────────────────────────────────────────
// Example payload for the connector's UI: the most recent real delivery if one
// exists, otherwise a synthetic sample of the same shape.
router.get('/v1/events/sample', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);
    const event = requireKnownEvent(req.query.event || 'document.generated');

    const recent = await latestDeliveryPayload(sb, teamId, event);
    return res.json({ event, live: Boolean(recent), sample: recent || sampleEvent(event) });
  } catch (err) {
    return sendError(res, '[v1/events/sample]', err);
  }
});

module.exports = router;
