'use strict';

/**
 * backend/admin/users.js  [ADMIN PANEL — isolated feature]
 *
 * Cross-tenant account listing for the admin panel. Uses the service-role
 * client (bypasses RLS) so it can see every profile, not just the caller's own.
 *
 * For each account we surface its "primary" team — the one it owns, falling
 * back to its earliest membership — and that team's plan, which is what the
 * grant-plan action targets.
 */

const { getAdmin } = require('../supabaseAdmin');

/**
 * @returns {Promise<Array<{
 *   id, email, name, createdAt,
 *   teamId, teamName, plan, role
 * }>>}  Newest signups first.
 */
async function listAllUsers() {
  const sb = getAdmin();
  if (!sb) {
    const e = new Error('Server not configured for Supabase.');
    e.status = 503;
    throw e;
  }

  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, email, name, created_at, deleted, deleted_at, memberships(team_id, role, teams(name, plan))')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (profiles || []).map(p => {
    const ms = p.memberships || [];
    const primary = ms.find(m => m.role === 'owner') || ms[0] || null;
    return {
      id: p.id,
      email: p.email,
      name: p.name || null,
      createdAt: p.created_at,
      teamId: primary?.team_id || null,
      teamName: primary?.teams?.name || null,
      plan: primary?.teams?.plan || 'free',
      role: primary?.role || null,
      deleted: !!p.deleted,
      deletedAt: p.deleted_at || null,
    };
  });
}

module.exports = { listAllUsers };
