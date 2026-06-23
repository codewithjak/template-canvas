'use strict';

/**
 * webhooks/deliveries.js
 *
 * Tenant-scoped reads of the webhook_deliveries audit log — the data behind the
 * delivery-visibility API (GET /v1/webhooks/deliveries) and manual redelivery.
 *
 * webhook_deliveries has no team_id of its own (it references an endpoint), so
 * scoping goes through the team's endpoints: a caller can only ever see/redeliver
 * deliveries belonging to endpoints their team owns.
 */

const DELIVERY_STATUSES = ['pending', 'success', 'failed', 'dead'];

/** Ids of every endpoint a team owns. */
async function teamEndpointIds(sb, teamId) {
  const { data } = await sb.from('webhook_endpoints').select('id').eq('team_id', teamId);
  return (data || []).map((e) => e.id);
}

/**
 * Recent deliveries for a team, newest first. Optionally narrowed to one of the
 * team's endpoints and/or a status. An endpointId the team does not own yields
 * an empty result (never another team's data).
 */
async function listDeliveries(sb, teamId, { endpointId, status, limit } = {}) {
  const owned = await teamEndpointIds(sb, teamId);
  const ids = endpointId ? (owned.includes(endpointId) ? [endpointId] : []) : owned;
  if (ids.length === 0) return [];

  const cap = Math.min(Math.max(1, parseInt(limit, 10) || 50), 200);
  let q = sb
    .from('webhook_deliveries')
    .select('id, endpoint_id, event, status, attempts, response_code, last_attempt_at, created_at, payload')
    .in('endpoint_id', ids)
    .order('created_at', { ascending: false })
    .limit(cap);
  if (status) q = q.eq('status', status);

  const { data } = await q;
  return data || [];
}

/**
 * Fetch one delivery plus its endpoint, but only if the endpoint belongs to the
 * team. Returns { delivery, endpoint } or null. The endpoint includes `secret`
 * (for signing on redelivery) — callers must not leak it to clients.
 */
async function getDeliveryForTeam(sb, teamId, deliveryId) {
  const { data: delivery } = await sb
    .from('webhook_deliveries')
    .select('id, endpoint_id, event, payload')
    .eq('id', deliveryId)
    .maybeSingle();
  if (!delivery) return null;

  const { data: endpoint } = await sb
    .from('webhook_endpoints')
    .select('id, url, secret, events, team_id, active')
    .eq('id', delivery.endpoint_id)
    .maybeSingle();
  if (!endpoint || endpoint.team_id !== teamId) return null;

  return { delivery, endpoint };
}

module.exports = { DELIVERY_STATUSES, listDeliveries, getDeliveryForTeam };
