'use strict';

/**
 * backend/apiKeys.js
 *
 * Per-team inbound API keys. One key per team (enforced by the team_id PK on
 * public.team_api_keys). The raw key is shown to the user exactly once at
 * issue time; only its sha-256 hash is stored, so it can never be retrieved
 * again — losing it means rotating.
 *
 * Two auth directions live here:
 *   resolveTeamFromJwt   — the BROWSER managing its key (verified Supabase JWT)
 *   resolveTeamFromApiKey— an EXTERNAL system pushing data (the API key itself)
 *
 * Both resolve a trusted team_id server-side via the service-role client;
 * nothing is taken from the request body.
 */

const crypto = require('crypto');
const { getAdmin } = require('./supabaseAdmin');

const KEY_PREFIX = 'tc_live_';
// Display prefix length: "tc_live_" + 6 chars of the secret, enough to
// recognise a key in a list without revealing it.
const DISPLAY_LEN = KEY_PREFIX.length + 6;

function generateRawKey() {
  return KEY_PREFIX + crypto.randomBytes(24).toString('hex'); // 48 hex chars of entropy
}

function hashKey(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function displayPrefix(raw) {
  return String(raw).slice(0, DISPLAY_LEN);
}

/** Pull the API key from X-API-Key, or an Authorization: Bearer tc_live_… header. */
function extractApiKey(req) {
  const header = req.headers['x-api-key'];
  if (header) return String(header).trim();
  const auth = req.headers.authorization;
  const m = /^Bearer\s+(tc_live_[A-Za-z0-9]+)$/i.exec(auth || '');
  return m ? m[1] : null;
}

function bearerToken(authHeader) {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m ? m[1] : null;
}

/**
 * Resolve { teamId, userId, userEmail, role } from a verified user JWT — for the
 * ACTIVE team. A user may belong to several teams (once invites are accepted),
 * so we honour profiles.active_team_id when it still points at a team they
 * belong to, and otherwise fall back deterministically (owner role first, then
 * earliest joined) and back-fill the choice so it stays stable.
 *
 * Used by every JWT-authenticated backend endpoint. Returns null when
 * unauthenticated or the user has no membership at all.
 */
async function resolveTeamFromJwt(authHeader) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).');

  const token = bearerToken(authHeader);
  if (!token) return null;

  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) return null;
  const userId = userData.user.id;
  const userEmail = userData.user.email || null;

  const { data: memberships, error: memErr } = await sb
    .from('memberships')
    .select('team_id, role, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (memErr || !memberships || memberships.length === 0) return null;

  const { data: profile } = await sb
    .from('profiles')
    .select('active_team_id')
    .eq('id', userId)
    .maybeSingle();

  let active = memberships.find(m => m.team_id === profile?.active_team_id);
  if (!active) {
    active = memberships.find(m => m.role === 'owner') || memberships[0];
    // Best-effort back-fill; never block the request on it.
    sb.from('profiles').update({ active_team_id: active.team_id }).eq('id', userId)
      .then(() => {}, () => {});
  }

  return { teamId: active.team_id, userId, userEmail, role: active.role };
}

/**
 * Issue (or rotate) the single key for a team. Upserts on team_id, so calling
 * it again replaces the previous key and clears any revoked_at.
 * Returns the raw key — surface it to the user ONCE.
 */
async function issueKeyForTeam(teamId) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const raw = generateRawKey();
  const { error } = await sb.from('team_api_keys').upsert(
    {
      team_id:    teamId,
      key_hash:   hashKey(raw),
      key_prefix: displayPrefix(raw),
      created_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: 'team_id' },
  );
  if (error) throw error;
  return raw;
}

/** Non-secret metadata for the UI. Never returns key_hash. */
async function getKeyMeta(teamId) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const { data, error } = await sb
    .from('team_api_keys')
    .select('key_prefix, created_at, last_used_at, revoked_at')
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function revokeKeyForTeam(teamId) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const { error } = await sb
    .from('team_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('team_id', teamId);
  if (error) throw error;
}

/**
 * Resolve a trusted team_id from an inbound API key (external system → /v1/ingest).
 * Returns null for unknown or revoked keys. Best-effort stamps last_used_at.
 */
async function resolveTeamFromApiKey(rawKey) {
  if (!rawKey) return null;
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const { data, error } = await sb
    .from('team_api_keys')
    .select('team_id, revoked_at')
    .eq('key_hash', hashKey(rawKey))
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;

  // Fire-and-forget usage stamp; never block ingest on it.
  sb.from('team_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('team_id', data.team_id)
    .then(() => {}, () => {});

  return data.team_id;
}

module.exports = {
  extractApiKey,
  resolveTeamFromJwt,
  // Alias: same active-team resolver, named for team-management call sites.
  resolveActiveTeam: resolveTeamFromJwt,
  resolveTeamFromApiKey,
  issueKeyForTeam,
  getKeyMeta,
  revokeKeyForTeam,
};
