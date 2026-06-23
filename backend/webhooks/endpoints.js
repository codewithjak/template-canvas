'use strict';

/**
 * webhooks/endpoints.js
 *
 * Shared persistence for outbound webhook endpoints, used by both the manual
 * management router (routes/webhooks.js) and the connector REST-hook router
 * (routes/connector.js). Keeps secret generation and the tenant-scoped
 * create/delete in one place so the two surfaces can't drift.
 */

const crypto = require('crypto');

const SECRET_PREFIX = 'whsec_';

/** A fresh signing secret; surface it to the caller exactly once. */
function generateSecret() {
  return SECRET_PREFIX + crypto.randomBytes(24).toString('hex');
}

/**
 * Register an endpoint for a team. Mints a secret and inserts the row.
 * @returns {Promise<{ endpoint: object, secret: string }>}
 */
async function createEndpoint(sb, { teamId, url, events, source = 'manual' }) {
  const secret = generateSecret();
  const { data, error } = await sb
    .from('webhook_endpoints')
    .insert({ team_id: teamId, url, events, secret, source, active: true })
    .select('id, url, events, active, created_at')
    .single();
  if (error) throw error;
  return { endpoint: data, secret };
}

/**
 * Delete one of a team's endpoints. Scoped by team_id so a key can only remove
 * its own. Resolves true when a row was deleted, false when nothing matched.
 */
async function deleteEndpoint(sb, teamId, id) {
  const { data, error } = await sb
    .from('webhook_endpoints')
    .delete()
    .eq('id', id)
    .eq('team_id', teamId)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/**
 * Fetch one of a team's endpoints (including `secret`, for signing a test ping).
 * Tenant-scoped; returns the row or null. Callers must not leak `secret`.
 */
async function getEndpoint(sb, teamId, id) {
  const { data } = await sb
    .from('webhook_endpoints')
    .select('id, team_id, url, secret, events, active, created_at')
    .eq('id', id)
    .eq('team_id', teamId)
    .maybeSingle();
  return data || null;
}

/**
 * Mint a new signing secret for an endpoint. Returns the new secret (surface it
 * once), or null when the endpoint isn't found for the team.
 */
async function rotateSecret(sb, teamId, id) {
  const secret = generateSecret();
  const { data, error } = await sb
    .from('webhook_endpoints')
    .update({ secret })
    .eq('id', id)
    .eq('team_id', teamId)
    .select('id');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0 ? secret : null;
}

/**
 * Pause/resume an endpoint by toggling `active` (dispatch only loads active
 * ones). Returns the updated public row, or null when not found for the team.
 */
async function setActive(sb, teamId, id, active) {
  const { data, error } = await sb
    .from('webhook_endpoints')
    .update({ active })
    .eq('id', id)
    .eq('team_id', teamId)
    .select('id, url, events, active, created_at');
  if (error) throw error;
  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

module.exports = {
  generateSecret, createEndpoint, deleteEndpoint, getEndpoint, rotateSecret, setActive,
};
