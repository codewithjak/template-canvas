'use strict';

/**
 * backend/admin/setPlan.js  [ADMIN PANEL — isolated feature]
 *
 * Grant a plan to an account's team by email. This is a deliberate, self-
 * contained copy of the logic in backend/scripts/setPlan.js — NOT a shared
 * refactor — so that removing backend/admin/ leaves the CLI script untouched.
 *
 * teams.plan is the single source of truth the rest of the backend enforces
 * against, so flipping it here takes effect immediately (no billing involved).
 */

const { getAdmin } = require('../supabaseAdmin');
const { PLANS } = require('../plans');

function httpError(message, status) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Set the plan on the team owned by `email`'s account.
 * @returns {Promise<{ email, plan, team: { id, name, plan } }>}
 */
async function setPlanForEmail(rawEmail, rawPlan) {
  const email = String(rawEmail || '').trim().toLowerCase();
  const plan = String(rawPlan || '').trim().toLowerCase();

  if (!email || !email.includes('@')) throw httpError('A valid email is required.', 400);
  if (!PLANS[plan]) {
    throw httpError(`Invalid plan "${plan}". Valid: ${Object.keys(PLANS).join(', ')}`, 400);
  }

  const sb = getAdmin();
  if (!sb) throw httpError('Server not configured for Supabase.', 503);

  // 1. Find the account by email.
  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('id, email, name')
    .ilike('email', email)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!profile) {
    throw httpError(`No account found for ${email}. They must sign up first.`, 404);
  }

  // 2. Resolve their team (prefer the one they own).
  const { data: memberships, error: memErr } = await sb
    .from('memberships')
    .select('team_id, role')
    .eq('user_id', profile.id);
  if (memErr) throw memErr;
  if (!memberships?.length) {
    throw httpError(`No team membership found for ${email}.`, 409);
  }
  const owner = memberships.find(m => m.role === 'owner') || memberships[0];

  // 3. Flip the plan.
  const { data: updated, error: updErr } = await sb
    .from('teams')
    .update({ plan })
    .eq('id', owner.team_id)
    .select('id, name, plan')
    .single();
  if (updErr) throw updErr;

  return { email: profile.email, plan, team: updated };
}

module.exports = { setPlanForEmail };
