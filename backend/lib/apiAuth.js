'use strict';

/**
 * lib/apiAuth.js
 *
 * Shared helpers for the API-key-authed `/v1/*` routes that the connector layer
 * uses (generate, webhooks, …). Extracted so each router stays small and they
 * all authenticate identically.
 *
 * NOTE: the app's own `/v1/ingest` (routes/teamApi.js) still inlines the same
 * sequence — folding it onto requireApiTeam is a tracked follow-up in
 * API_GENERATE_REFACTOR_NOTES.md; this module is the home it should move to.
 */

const { getAdmin } = require('../supabaseAdmin');
const { extractApiKey, resolveTeamFromApiKey, resolveTeamFromJwt } = require('../apiKeys');
const { planAllows } = require('../plans');
const { getTeamPlan } = require('../usage');

/** A thrown error that carries the HTTP status the route should return. */
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Map a thrown error to a JSON response; log only true server faults (5xx). */
function sendError(res, tag, err) {
  const status = err.status || 500;
  if (status >= 500) console.error(tag, err);
  return res.status(status).json({ error: err.message || 'Request failed.' });
}

/**
 * Resolve { teamId, sb } from the request's API key, or throw an httpError.
 * Enforces the Business `api` capability live on every call (a key issued on
 * Business then downgraded must stop working).
 */
async function requireApiTeam(req) {
  const rawKey = extractApiKey(req);
  if (!rawKey) throw httpError(401, 'API key required (X-API-Key header).');

  const teamId = await resolveTeamFromApiKey(rawKey);
  if (!teamId) throw httpError(403, 'Invalid or revoked API key.');

  if (!planAllows(await getTeamPlan(teamId), 'api')) {
    throw httpError(403, 'API access requires the Business plan.');
  }

  const sb = getAdmin();
  if (!sb) throw httpError(503, 'Server not configured for Supabase.');
  return { teamId, sb };
}

/**
 * Resolve { teamId, sb } from EITHER a tc_live API key (connectors / curl) OR a
 * Supabase JWT (the signed-in user managing webhooks in the settings UI). Both
 * paths still require the Business `api` capability. Used by the webhook
 * management router so the same endpoints serve the UI and external callers.
 */
async function requireTeam(req) {
  let teamId = null;

  const rawKey = extractApiKey(req); // X-API-Key or "Bearer tc_live_…"
  if (rawKey) {
    teamId = await resolveTeamFromApiKey(rawKey);
    if (!teamId) throw httpError(403, 'Invalid or revoked API key.');
  } else {
    const ctx = await resolveTeamFromJwt(req.headers.authorization); // Supabase JWT
    if (!ctx) throw httpError(401, 'Authentication required.');
    teamId = ctx.teamId;
  }

  if (!planAllows(await getTeamPlan(teamId), 'api')) {
    throw httpError(403, 'API access requires the Business plan.');
  }

  const sb = getAdmin();
  if (!sb) throw httpError(503, 'Server not configured for Supabase.');
  return { teamId, sb };
}

module.exports = { httpError, sendError, requireApiTeam, requireTeam };
