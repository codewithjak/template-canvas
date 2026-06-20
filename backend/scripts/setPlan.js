'use strict';

/**
 * backend/scripts/setPlan.js
 *
 * One-off admin utility: grant a plan to a user's team by email. This is the
 * manual stand-in for the not-yet-built admin panel (see the plan/teams.plan
 * model in backend/usage.js). Because checkExportAllowed() reads teams.plan as
 * the single source of truth, flipping it here takes effect immediately — no
 * payment gateway involved.
 *
 * Usage:
 *   node scripts/setPlan.js <email> <free|pro|business>
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env (service
 * role → bypasses RLS so it can read/write across teams). The target user must
 * have signed up already (so their profile + personal team exist).
 */

require('dotenv').config();

const { getAdmin } = require('../supabaseAdmin');
const { PLANS } = require('../plans');

async function main() {
  const [, , emailArg, planArg] = process.argv;
  const email = (emailArg || '').trim().toLowerCase();
  const plan = (planArg || '').trim().toLowerCase();

  if (!email || !plan) {
    console.error('Usage: node scripts/setPlan.js <email> <free|pro|business>');
    process.exit(1);
  }
  if (!PLANS[plan]) {
    console.error(`Invalid plan "${plan}". Valid: ${Object.keys(PLANS).join(', ')}`);
    process.exit(1);
  }

  const sb = getAdmin();
  if (!sb) {
    console.error('Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing).');
    process.exit(1);
  }

  // 1. Find the user's profile by email.
  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('id, email, name')
    .ilike('email', email)
    .maybeSingle();
  if (profErr) throw profErr;
  if (!profile) {
    console.error(`No account found for ${email}. Ask them to sign up first, then re-run.`);
    process.exit(2);
  }

  // 2. Resolve their team (prefer the team they own).
  const { data: memberships, error: memErr } = await sb
    .from('memberships')
    .select('team_id, role')
    .eq('user_id', profile.id);
  if (memErr) throw memErr;
  if (!memberships?.length) {
    console.error(`No team membership found for ${email}.`);
    process.exit(2);
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

  console.log(`✓ ${email} (${profile.name || 'no name'})`);
  console.log(`  team:  ${updated.name} [${updated.id}]`);
  console.log(`  plan:  → ${updated.plan}`);
}

main().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
