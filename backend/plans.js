'use strict';

/**
 * backend/plans.js
 *
 * Canonical plan definitions for the server (limits + capabilities + price).
 * This is the SINGLE SOURCE OF TRUTH the backend enforces against.
 *
 * ⚠️  Keep in sync with the client mirror: src/config/plans.ts
 *     (same plan ids, limits and capability flags — different language only).
 *
 * Enforcement points:
 *   • backend/index.js  → export endpoints (caps + bulk/zpl capability + watermark)
 *   • backend/index.js  → /v1/keys, /v1/ingest (api capability)
 *   • backend/usage.js  → usage derivation + summaries
 *
 * Pricing is in whole USD/month. `null` limit = unlimited.
 */

/**
 * @typedef {'free'|'pro'|'business'} PlanId
 */

const PLANS = {
  free: {
    id:    'free',
    name:  'Free',
    price: 0,
    limits: {
      maxTemplates:      3,
      maxExportsPerMonth: 50,
      maxBulkRowsPerJob:  0, // bulk disabled entirely on free
      maxMembers:         1, // personal team only — no invites
    },
    capabilities: {
      cleanExport:    false, // free exports are watermarked
      bulk:           false,
      zpl:            false,
      api:            false,
      teams:          false,
      versionHistory: false,
      cloudSync:      false,
    },
  },

  pro: {
    id:    'pro',
    name:  'Pro',
    price: 15,
    limits: {
      maxTemplates:      null,
      maxExportsPerMonth: 2000,
      maxBulkRowsPerJob:  500,
      maxMembers:         1, // teams capability is Business-only
    },
    capabilities: {
      cleanExport:    true,
      bulk:           true,
      zpl:            true,
      api:            false,
      teams:          false,
      versionHistory: true,
      cloudSync:      true,
    },
  },

  business: {
    id:    'business',
    name:  'Business',
    price: 49,
    limits: {
      maxTemplates:      null,
      maxExportsPerMonth: 25000,
      maxBulkRowsPerJob:  5000,
      maxMembers:         5, // 1 owner + up to 4 invited members
    },
    capabilities: {
      cleanExport:    true,
      bulk:           true,
      zpl:            true,
      api:            true,
      teams:          true,
      versionHistory: true,
      cloudSync:      true,
    },
  },
};

/** Ordered low → high; used for "minimum plan that unlocks X" messaging. */
const PLAN_ORDER = ['free', 'pro', 'business'];

/** Resolve a plan definition, defaulting unknown/legacy values to free. */
function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

function getPlanLimits(planId) {
  return getPlan(planId).limits;
}

function getPlanCapabilities(planId) {
  return getPlan(planId).capabilities;
}

/** True if the plan grants the named capability. */
function planAllows(planId, capability) {
  return !!getPlan(planId).capabilities[capability];
}

/** Lowest-priced plan id that grants `capability`, or null if none do. */
function minPlanFor(capability) {
  for (const id of PLAN_ORDER) {
    if (planAllows(id, capability)) return id;
  }
  return null;
}

module.exports = {
  PLANS,
  PLAN_ORDER,
  getPlan,
  getPlanLimits,
  getPlanCapabilities,
  planAllows,
  minPlanFor,
};
