'use strict';

/**
 * backend/admin/deleteUser.js  [ADMIN PANEL — isolated feature]
 *
 * Soft-delete a member: the profile record is retained with deleted = true, and
 * the auth user is banned so they're locked out (reversible via restoreUser).
 *
 * Team disposition: if the member OWNS a SHARED team (more than one member),
 * the whole team is deleted (cascade removes its templates, bindings, analytics,
 * API keys and webhooks, plus every membership). Solo teams and non-owner
 * memberships are left intact — true soft-delete.
 *
 * Guards: cannot delete a platform admin (ADMIN_EMAILS) or yourself.
 */

const { getAdmin } = require('../supabaseAdmin');
const { adminEmails } = require('./middleware');

const BAN_DURATION = '876000h'; // ~100 years ≈ permanent lockout (reversible)

function httpError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function softDeleteUser(userId, actingUserId) {
  const sb = getAdmin();
  if (!sb) throw httpError('Server not configured for Supabase.', 503);
  if (userId === actingUserId) throw httpError('You cannot delete your own admin account.', 400);

  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, email, deleted')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw httpError('Account not found.', 404);

  if (profile.email && adminEmails().includes(profile.email.toLowerCase())) {
    throw httpError('Cannot delete a platform admin account.', 403);
  }

  // Delete shared teams this member owns (cascade clears their content + members).
  const { data: memberships, error: memErr } = await sb
    .from('memberships')
    .select('team_id, role')
    .eq('user_id', userId);
  if (memErr) throw memErr;

  const deletedTeams = [];
  for (const m of memberships || []) {
    if (m.role !== 'owner') continue;
    const { count } = await sb
      .from('memberships')
      .select('user_id', { count: 'exact', head: true })
      .eq('team_id', m.team_id);
    if ((count || 0) > 1) {
      const { error: delErr } = await sb.from('teams').delete().eq('id', m.team_id);
      if (delErr) throw delErr;
      deletedTeams.push(m.team_id);
    }
  }

  // Flag the profile (record retained).
  const { error: upErr } = await sb
    .from('profiles')
    .update({ deleted: true, deleted_at: new Date().toISOString() })
    .eq('id', userId);
  if (upErr) throw upErr;

  // Revoke access at the auth layer (best-effort; reversible via restore).
  try {
    await sb.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
  } catch (e) {
    console.warn('[admin/delete] auth ban failed:', e.message);
  }

  console.warn(`[admin] soft-deleted ${profile.email} (${userId}); deleted teams: ${deletedTeams.join(', ') || 'none'}`);
  return { id: userId, email: profile.email, deletedTeams };
}

async function restoreUser(userId) {
  const sb = getAdmin();
  if (!sb) throw httpError('Server not configured for Supabase.', 503);

  const { data: profile, error } = await sb
    .from('profiles')
    .update({ deleted: false, deleted_at: null })
    .eq('id', userId)
    .select('id, email')
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw httpError('Account not found.', 404);

  try {
    await sb.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  } catch (e) {
    console.warn('[admin/restore] auth unban failed:', e.message);
  }

  console.warn(`[admin] restored ${profile.email} (${userId})`);
  return { id: userId, email: profile.email };
}

module.exports = { softDeleteUser, restoreUser };
