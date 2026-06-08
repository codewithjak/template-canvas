'use strict';

/**
 * backend/analytics.js
 * Tamper-proof, server-side export tracking.
 *
 * The whole point of logging exports here (instead of in the browser) is
 * that the client cannot skip or forge it. So the team_id and user_id are
 * derived ONLY from the verified Supabase JWT and the database — never from
 * the request body. Inserts use the service-role key so they bypass RLS.
 *
 * If SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (e.g. local dev),
 * tracking quietly no-ops. logExportEvent never throws and is fire-and-forget,
 * so it can never delay or break a document download.
 */

const { createClient } = require('@supabase/supabase-js');

let admin = null;

function getAdmin() {
  if (admin) return admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // analytics disabled
  admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

function bearerToken(authHeader) {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? match[1] : null;
}

/**
 * Record a 'pdf_exported' event for whoever owns the supplied JWT.
 * @param {string|undefined} authHeader  The raw Authorization header.
 * @param {object} metadata              Extra context (format, mode, rows…).
 */
async function logExportEvent(authHeader, metadata = {}) {
  try {
    const sb = getAdmin();
    if (!sb) return; // not configured — skip silently

    const token = bearerToken(authHeader);
    if (!token) return; // anonymous / no token — nothing to attribute

    // 1. Verify the token → trusted user id.
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return;
    const userId = userData.user.id;

    // 2. Resolve the team server-side (one membership per user today).
    const { data: membership, error: memErr } = await sb
      .from('memberships')
      .select('team_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (memErr || !membership) return;

    // 3. Append the event (service role → bypasses RLS).
    await sb.from('analytics_events').insert({
      team_id: membership.team_id,
      user_id: userId,
      event_type: 'pdf_exported',
      metadata,
    });
  } catch (err) {
    console.warn('[analytics] export log failed:', err.message);
  }
}

module.exports = { logExportEvent };
