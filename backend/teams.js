'use strict';

/**
 * backend/teams.js
 *
 * Team membership management: members, invites and seats. Mirrors the
 * apiKeys.js pattern — everything runs through the service-role client
 * (getAdmin) because memberships RLS only exposes a user's own row, and seat /
 * role enforcement must happen server-side.
 *
 * Seats come from the plan (backend/plans.js → limits.maxMembers). Business = 5,
 * everyone else = 1. A null limit means unlimited.
 *
 * Errors thrown here may carry a `.status` so the route can map them to the
 * right HTTP code; anything without one is treated as a 500.
 */

const crypto = require('crypto');
const { getAdmin } = require('./supabaseAdmin');
const { getPlanLimits } = require('./plans');

const INVITE_TTL_DAYS = 7;
// Roles an invite may grant. 'owner' is never handed out via invite.
const INVITABLE_ROLES = ['admin', 'member', 'viewer'];

function httpError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** Seat limit for the team's current plan. null = unlimited. */
async function getTeamMaxMembers(sb, teamId) {
  const { data } = await sb.from('teams').select('plan').eq('id', teamId).maybeSingle();
  return getPlanLimits(data?.plan || 'free').maxMembers;
}

async function countMembers(sb, teamId) {
  const { count } = await sb
    .from('memberships')
    .select('user_id', { count: 'exact', head: true })
    .eq('team_id', teamId);
  return count || 0;
}

/** Outstanding invites = not accepted and not expired. */
function filterPending(rows) {
  const now = Date.now();
  return (rows || []).filter(
    r => !r.accepted_at && (!r.expires_at || new Date(r.expires_at).getTime() > now),
  );
}

async function getPendingInvites(sb, teamId) {
  const { data } = await sb
    .from('invites')
    .select('id, email, role, created_at, expires_at, accepted_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  return filterPending(data);
}

/** Team + members + pending invites + seat summary for the management UI. */
async function listTeam(teamId) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const [{ data: team }, { data: memberRows }, pending, maxMembers] = await Promise.all([
    sb.from('teams').select('id, name, plan').eq('id', teamId).maybeSingle(),
    sb.from('memberships')
      .select('user_id, role, created_at, profiles(name, email)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: true }),
    getPendingInvites(sb, teamId),
    getTeamMaxMembers(sb, teamId),
  ]);

  const members = (memberRows || []).map(m => ({
    user_id:    m.user_id,
    role:       m.role,
    created_at: m.created_at,
    name:       m.profiles?.name || null,
    email:      m.profiles?.email || null,
  }));

  return {
    team,
    members,
    invites: pending.map(i => ({
      id: i.id, email: i.email, role: i.role,
      created_at: i.created_at, expires_at: i.expires_at,
    })),
    seats: { used: members.length, pending: pending.length, limit: maxMembers },
  };
}

/**
 * Create a pending invite. Rejects duplicates (existing member or pending
 * invite for the same email) and enforces the seat cap (members + outstanding
 * invites must stay below the limit). Returns the row INCLUDING its token so
 * the caller can build the accept link.
 */
async function createInvite(teamId, rawEmail, rawRole, invitedBy) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const email = String(rawEmail || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw httpError('A valid email is required.', 400);
  const role = INVITABLE_ROLES.includes(rawRole) ? rawRole : 'member';

  const { data: memberRows } = await sb
    .from('memberships')
    .select('profiles(email)')
    .eq('team_id', teamId);
  const memberEmails = (memberRows || []).map(m => (m.profiles?.email || '').toLowerCase());
  if (memberEmails.includes(email)) throw httpError('That person is already a team member.', 409);

  const pending = await getPendingInvites(sb, teamId);
  if (pending.some(i => i.email.toLowerCase() === email)) {
    throw httpError('An invite is already pending for that email.', 409);
  }

  const maxMembers = await getTeamMaxMembers(sb, teamId);
  const used = await countMembers(sb, teamId);
  if (maxMembers != null && used + pending.length >= maxMembers) {
    throw httpError(
      `All ${maxMembers} seats are in use. Remove a member or revoke a pending invite to add someone new.`,
      403,
    );
  }

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString();
  const { data, error } = await sb
    .from('invites')
    .insert({ team_id: teamId, email, role, token, invited_by: invitedBy, expires_at: expiresAt })
    .select('id, email, role, expires_at, token')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function revokeInvite(teamId, inviteId) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');
  const { error } = await sb.from('invites').delete().eq('team_id', teamId).eq('id', inviteId);
  if (error) throw error;
}

/** Remove a member. Refuses to strip a team of its last owner. */
async function removeMember(teamId, userId) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const { data: owners } = await sb
    .from('memberships').select('user_id').eq('team_id', teamId).eq('role', 'owner');
  const isOwner = (owners || []).some(o => o.user_id === userId);
  if (isOwner && (owners || []).length <= 1) {
    throw httpError('You cannot remove the last owner of a team.', 400);
  }

  const { error } = await sb.from('memberships').delete().eq('team_id', teamId).eq('user_id', userId);
  if (error) throw error;

  // If the removed user was scoped to this team, clear it so they fall back to
  // another team on their next request.
  sb.from('profiles').update({ active_team_id: null })
    .eq('id', userId).eq('active_team_id', teamId)
    .then(() => {}, () => {});
}

/** Non-secret invite details for the acceptance screen. null = unknown token. */
async function lookupInvite(token) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const { data } = await sb
    .from('invites')
    .select('email, role, expires_at, accepted_at, teams(name)')
    .eq('token', token)
    .maybeSingle();
  if (!data) return null;

  const expired = data.expires_at && new Date(data.expires_at).getTime() < Date.now();
  return {
    email:    data.email,
    role:     data.role,
    teamName: data.teams?.name || 'a team',
    accepted: !!data.accepted_at,
    expired:  !!expired,
  };
}

/**
 * Accept an invite: validate it, require the signed-in user's email to match,
 * enforce the seat cap, then add the membership and scope the user to the new
 * team. Idempotent if the user is already a member.
 */
async function acceptInvite(userId, userEmail, token) {
  const sb = getAdmin();
  if (!sb) throw new Error('Server not configured for Supabase.');

  const { data: invite } = await sb
    .from('invites')
    .select('id, team_id, email, role, expires_at, accepted_at')
    .eq('token', token)
    .maybeSingle();
  if (!invite) throw httpError('This invite link is invalid.', 404);
  if (invite.accepted_at) throw httpError('This invite has already been used.', 409);
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    throw httpError('This invite has expired. Ask for a new one.', 410);
  }
  if ((userEmail || '').toLowerCase() !== invite.email.toLowerCase()) {
    throw httpError('This invite was sent to a different email address.', 403);
  }

  const { data: existing } = await sb
    .from('memberships').select('user_id')
    .eq('team_id', invite.team_id).eq('user_id', userId).maybeSingle();

  if (!existing) {
    const maxMembers = await getTeamMaxMembers(sb, invite.team_id);
    const used = await countMembers(sb, invite.team_id);
    if (maxMembers != null && used >= maxMembers) {
      throw httpError('This team has no seats available. Ask an admin to free one up.', 403);
    }
    const { error: insErr } = await sb
      .from('memberships').insert({ user_id: userId, team_id: invite.team_id, role: invite.role });
    if (insErr) throw insErr;
  }

  await sb.from('invites').update({ accepted_at: new Date().toISOString() }).eq('id', invite.id);
  await sb.from('profiles').update({ active_team_id: invite.team_id }).eq('id', userId);

  return { teamId: invite.team_id };
}

module.exports = {
  listTeam,
  createInvite,
  revokeInvite,
  removeMember,
  lookupInvite,
  acceptInvite,
};
