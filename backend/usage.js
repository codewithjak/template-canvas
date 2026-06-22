'use strict';

/**
 * backend/usage.js
 *
 * Plan limits + usage derivation + export entitlement checks. Usage is NOT
 * stored in a separate counter table — it is derived from the existing
 * append-only analytics_events log so there is nothing to keep in sync.
 *
 * IMPORTANT billing nuance: a bulk export writes ONE analytics_events row with
 * metadata.rows = N (see backend/index.js logExportEvent calls), not N rows.
 * So per-PDF usage = SUM(metadata.rows), NOT COUNT(*). getMonthlyExportCount
 * sums accordingly; a single export with no rows counts as 1.
 *
 * Plan limits + capabilities now live in backend/plans.js (shared definition,
 * mirrored on the client at src/config/plans.ts).
 */

const { getAdmin } = require('./supabaseAdmin');
const {
  getPlan,
  getPlanLimits,
  planAllows,
  minPlanFor,
} = require('./plans');
const { resolveTeamFromJwt } = require('./apiKeys');

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

/** AI PDF→template rebuilds this calendar month (UTC). One event = one build. */
async function getMonthlyAiBuildCount(teamId) {
  const sb = getAdmin();
  if (!sb) return 0;
  const { count, error } = await sb
    .from('analytics_events')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('event_type', 'ai_build')
    .gte('created_at', monthStartIso());
  if (error) return 0;
  return count || 0;
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
  const [plan, exportsThisMonth, templates, aiBuildsThisMonth] = await Promise.all([
    getTeamPlan(teamId),
    getMonthlyExportCount(teamId),
    getTemplateCount(teamId),
    getMonthlyAiBuildCount(teamId),
  ]);
  const limits = getPlanLimits(plan);
  return {
    plan,
    capabilities:      getPlan(plan).capabilities,
    templates:         { used: templates,         limit: limits.maxTemplates },
    exportsThisMonth:  { used: exportsThisMonth,   limit: limits.maxExportsPerMonth },
    aiBuildsThisMonth: { used: aiBuildsThisMonth,  limit: limits.maxAiBuildsPerMonth },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export entitlement guard
//
// Called by the three generate endpoints BEFORE doing any rendering work.
// Resolves the team from the verified JWT, then checks capability + monthly
// cap. Returns a plain result the route can act on:
//
//   { allowed: true,  plan, teamId, watermark }
//   { allowed: false, status, error }
//
// Degrades OPEN when Supabase isn't configured (local dev), mirroring
// analytics' fire-and-forget philosophy — a misconfigured server should never
// block every export. When configured, an unauthenticated request is rejected.
// ─────────────────────────────────────────────────────────────────────────────

const UPGRADE_LABEL = {
  bulk:     'Bulk generation',
  zpl:      'ZPL / label export',
  delivery: 'Email delivery',
  api:      'API access',
};

/** Build a 403 result describing the lowest plan that unlocks a capability. */
function capabilityError(cap) {
  const min      = minPlanFor(cap);
  const planName = min ? getPlan(min).name : 'a paid';
  return {
    allowed: false,
    status:  403,
    error:   `${UPGRADE_LABEL[cap]} requires the ${planName} plan. Upgrade to unlock it.`,
  };
}

/**
 * Core entitlement evaluation for an ALREADY-RESOLVED team + plan (no auth
 * resolution, no Supabase config check). Shared by both the JWT path
 * (checkExportAllowed) and the API-key path (checkExportAllowedForTeam) so the
 * two enforce identically. Result shape:
 *   { allowed: true,  plan, teamId, watermark }
 *   { allowed: false, status, error }
 */
async function evaluateExportEntitlement({ teamId, plan, mode = 'single', rows = 1, format = 'pdf', delivery = false }) {
  const limits    = getPlanLimits(plan);
  const isBulk    = mode === 'bulk' || mode === 'bulk_async';
  const requested = Math.max(1, Number(rows) || 1);

  // 1. Capability gates ──────────────────────────────────────────────
  if (format === 'zpl' && !planAllows(plan, 'zpl')) return capabilityError('zpl');
  if (isBulk && !planAllows(plan, 'bulk'))          return capabilityError('bulk');
  if (delivery && !planAllows(plan, 'delivery'))    return capabilityError('delivery');

  // 2. Per-job row ceiling (bulk only) ───────────────────────────────
  if (isBulk && limits.maxBulkRowsPerJob != null && requested > limits.maxBulkRowsPerJob) {
    return {
      allowed: false,
      status:  403,
      error:   `This job has ${requested} rows, above your plan's limit of ${limits.maxBulkRowsPerJob} per job. Upgrade for larger batches.`,
    };
  }

  // 3. Monthly export cap ────────────────────────────────────────────
  if (limits.maxExportsPerMonth != null) {
    const used = await getMonthlyExportCount(teamId);
    if (used + requested > limits.maxExportsPerMonth) {
      const remaining = Math.max(0, limits.maxExportsPerMonth - used);
      return {
        allowed: false,
        status:  402,
        error:   `Monthly export limit reached (${limits.maxExportsPerMonth}). ` +
                 `${remaining} remaining this month — upgrade to continue exporting.`,
      };
    }
  }

  return {
    allowed:   true,
    plan,
    teamId,
    // Free tier (anything lacking cleanExport) gets a watermark stamped on PDF
    // output. ZPL is gated off for those plans, so PDF-only stamping is fine.
    watermark: !planAllows(plan, 'cleanExport'),
  };
}

/**
 * Export guard for the BROWSER path: resolves the team from the verified JWT,
 * then evaluates entitlement. Degrades OPEN when Supabase is unconfigured.
 */
async function checkExportAllowed({ authHeader, mode = 'single', rows = 1, format = 'pdf', delivery = false }) {
  const sb = getAdmin();
  if (!sb) {
    // Not configured for Supabase (e.g. local dev) — cannot resolve a plan,
    // so don't block. Watermark defaults to off in this mode.
    return { allowed: true, plan: 'free', teamId: null, watermark: false, unmetered: true };
  }

  const ctx = await resolveTeamFromJwt(authHeader);
  if (!ctx) {
    return { allowed: false, status: 401, error: 'Sign in to export documents.' };
  }

  const plan = await getTeamPlan(ctx.teamId);
  return evaluateExportEntitlement({ teamId: ctx.teamId, plan, mode, rows, format, delivery });
}

/**
 * Export guard for the API-KEY path: the team is already trusted (resolved from
 * the key), so resolve its plan and evaluate. Used by /v1/generate.
 */
async function checkExportAllowedForTeam({ teamId, mode = 'single', rows = 1, format = 'pdf', delivery = false }) {
  const plan = await getTeamPlan(teamId);
  return evaluateExportEntitlement({ teamId, plan, mode, rows, format, delivery });
}

// ─────────────────────────────────────────────────────────────────────────────
// AI-build entitlement guard
//
// Called by /pdf-structure (the mandatory, billable LLM tokenization step) BEFORE
// doing any model work. The AI rebuild is metered, not capability-gated: every
// plan gets a monthly quota (free tier = a small taste), so this only enforces the
// per-month ceiling. Degrades OPEN when Supabase isn't configured (local dev),
// mirroring checkExportAllowed.
// ─────────────────────────────────────────────────────────────────────────────

async function checkAiBuildAllowed({ authHeader }) {
  const sb = getAdmin();
  if (!sb) {
    // Not configured for Supabase (local dev) — cannot resolve a plan, so don't block.
    return { allowed: true, plan: 'free', teamId: null, unmetered: true };
  }

  const ctx = await resolveTeamFromJwt(authHeader);
  if (!ctx) {
    return { allowed: false, status: 401, error: 'Sign in to rebuild PDFs with AI.' };
  }

  const plan   = await getTeamPlan(ctx.teamId);
  const limits = getPlanLimits(plan);

  if (limits.maxAiBuildsPerMonth != null) {
    const used = await getMonthlyAiBuildCount(ctx.teamId);
    if (used >= limits.maxAiBuildsPerMonth) {
      const planName = getPlan(plan).name;
      return {
        allowed: false,
        status:  402,
        error:   `Monthly AI rebuild limit reached (${limits.maxAiBuildsPerMonth} on the ${planName} plan). ` +
                 `Upgrade for more AI rebuilds.`,
      };
    }
  }

  return { allowed: true, plan, teamId: ctx.teamId };
}

module.exports = {
  getPlanLimits,
  getTeamPlan,
  getMonthlyExportCount,
  getMonthlyAiBuildCount,
  getTemplateCount,
  getUsageSummary,
  evaluateExportEntitlement,
  checkExportAllowed,
  checkExportAllowedForTeam,
  checkAiBuildAllowed,
};
