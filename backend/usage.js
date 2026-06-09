'use strict';

/**
 * backend/usage.js
 *
 * Plan limits + usage derivation. Usage is NOT stored in a separate counter
 * table — it is derived from the existing append-only analytics_events log so
 * there is nothing to keep in sync.
 *
 * IMPORTANT billing nuance: a bulk export writes ONE analytics_events row with
 * metadata.rows = N (see backend/index.js logExportEvent calls), not N rows.
 * So per-PDF usage = SUM(metadata.rows), NOT COUNT(*). getMonthlyExportCount
 * sums accordingly; a single export with no rows counts as 1.
 *
 * Limits live here as plain constants keyed on teams.plan. No new plans table
 * is required for the MVP; promote to a table later if pricing gets richer.
 */

const { getAdmin } = require('./supabaseAdmin');

// null = unlimited. Tune freely — these are not load-bearing elsewhere.
const PLAN_LIMITS = {
  free: { maxTemplates: 3,    maxExportsPerMonth: 50 },
  pro:  { maxTemplates: 100,  maxExportsPerMonth: 5000 },
  scale:{ maxTemplates: null, maxExportsPerMonth: 100000 },
};

function getPlanLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function monthStartIso(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

async function getTeamPlan(teamId) {
  const sb = getAdmin();
  if (!sb) return 'free';
  const { data } = await sb.from('teams').select('plan').eq('id', teamId).maybeSingle();
  return data?.plan || 'free';
}

/** PDFs exported this calendar month (UTC). Sums metadata.rows for bulk. */
async function getMonthlyExportCount(teamId) {
  const sb = getAdmin();
  if (!sb) return 0;
  const { data, error } = await sb
    .from('analytics_events')
    .select('metadata')
    .eq('team_id', teamId)
    .eq('event_type', 'pdf_exported')
    .gte('created_at', monthStartIso());
  if (error || !data) return 0;

  let total = 0;
  for (const ev of data) {
    const rows = Number(ev.metadata?.rows);
    total += Number.isFinite(rows) && rows > 0 ? rows : 1;
  }
  return total;
}

async function getTemplateCount(teamId) {
  const sb = getAdmin();
  if (!sb) return 0;
  const { count, error } = await sb
    .from('templates')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId);
  if (error) return 0;
  return count || 0;
}

async function getUsageSummary(teamId) {
  const [plan, exportsThisMonth, templates] = await Promise.all([
    getTeamPlan(teamId),
    getMonthlyExportCount(teamId),
    getTemplateCount(teamId),
  ]);
  const limits = getPlanLimits(plan);
  return {
    plan,
    templates:        { used: templates,        limit: limits.maxTemplates },
    exportsThisMonth: { used: exportsThisMonth,  limit: limits.maxExportsPerMonth },
  };
}

module.exports = {
  getPlanLimits,
  getTeamPlan,
  getMonthlyExportCount,
  getTemplateCount,
  getUsageSummary,
};
