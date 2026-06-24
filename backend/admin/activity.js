'use strict';

/**
 * backend/admin/activity.js  [ADMIN PANEL — isolated feature]
 *
 * Read-only activity for a single member: their profile + primary team, a
 * recent timeline from analytics_events, all-time counts per event type, and
 * their team's template count. Service-role client (bypasses RLS).
 */

const { getAdmin } = require('../supabaseAdmin');

const EVENT_TYPES = ['login', 'template_created', 'pdf_exported', 'ai_build'];

function httpError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function getUserActivity(userId) {
  const sb = getAdmin();
  if (!sb) throw httpError('Server not configured for Supabase.', 503);

  const { data: profile, error } = await sb
    .from('profiles')
    .select('id, email, name, created_at, deleted, deleted_at, memberships(team_id, role, teams(name, plan))')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) throw httpError('Account not found.', 404);

  const memberships = profile.memberships || [];
  const primary = memberships.find(m => m.role === 'owner') || memberships[0] || null;
  const teamId = primary?.team_id || null;

  // Recent timeline (newest first).
  const { data: events } = await sb
    .from('analytics_events')
    .select('event_type, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  // All-time counts per event type.
  const counts = {};
  await Promise.all(EVENT_TYPES.map(async (t) => {
    const { count } = await sb
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', t);
    counts[t] = count || 0;
  }));

  // Template count for their primary team.
  let templateCount = 0;
  if (teamId) {
    const { count } = await sb
      .from('templates')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);
    templateCount = count || 0;
  }

  const recent = events || [];
  return {
    user: {
      id: profile.id,
      email: profile.email,
      name: profile.name || null,
      createdAt: profile.created_at,
      deleted: !!profile.deleted,
      deletedAt: profile.deleted_at || null,
    },
    team: primary ? { id: teamId, name: primary.teams?.name || null, plan: primary.teams?.plan || 'free', role: primary.role } : null,
    summary: { counts, templateCount, lastActiveAt: recent[0]?.created_at || null },
    events: recent,
  };
}

module.exports = { getUserActivity };
