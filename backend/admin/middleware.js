'use strict';

/**
 * backend/admin/middleware.js  [ADMIN PANEL — isolated feature]
 *
 * Platform-admin gate. Verifies the caller's Supabase JWT (reusing the same
 * resolver the team routes use) and checks their email against the ADMIN_EMAILS
 * allow-list. This is the ONLY security boundary for the admin panel — the
 * frontend guard is cosmetic.
 *
 * Self-contained: depends only on the stable apiKeys resolver (read-only).
 * Delete backend/admin/ and the feature is gone.
 */

const { resolveTeamFromJwt } = require('../apiKeys');

/** Parsed, lower-cased ADMIN_EMAILS allow-list. Empty = nobody is admin. */
function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Resolve the caller and confirm they are a platform admin.
 *
 * @returns {Promise<{ ok: true, userId: string, userEmail: string }
 *                  | { ok: false, status: number }>}
 *   ok:false carries 401 (not signed in) or 403 (signed in, not an admin).
 */
async function resolveAdmin(authHeader) {
  const ctx = await resolveTeamFromJwt(authHeader);
  if (!ctx) return { ok: false, status: 401 };

  const email = (ctx.userEmail || '').toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, userId: ctx.userId, userEmail: ctx.userEmail };
}

module.exports = { resolveAdmin, adminEmails };
