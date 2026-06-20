/**
 * src/config/plans.ts
 *
 * Client mirror of the canonical plan definitions. Used for gating the UI,
 * rendering the pricing page, and shaping upgrade prompts.
 *
 * ⚠️  Keep in sync with the server source of truth: backend/plans.js
 *     (same plan ids, limits and capability flags). The SERVER enforces;
 *     this copy only decides what the UI shows/hides. Never trust it for
 *     security — a gated request is always re-checked server-side.
 */

export type PlanId = 'free' | 'pro' | 'business'

export type Capability =
  | 'cleanExport'
  | 'bulk'
  | 'zpl'
  | 'delivery'
  | 'api'
  | 'teams'
  | 'versionHistory'
  | 'cloudSync'

export interface PlanLimits {
  /** null = unlimited */
  maxTemplates: number | null
  maxExportsPerMonth: number | null
  maxBulkRowsPerJob: number | null
  /** Max members in a team (seats). 1 = personal team only. */
  maxMembers: number | null
}

export interface Plan {
  id: PlanId
  name: string
  /** Whole USD per month. */
  price: number
  /** One-line positioning shown on the pricing card. */
  tagline: string
  limits: PlanLimits
  capabilities: Record<Capability, boolean>
  /** Human-readable bullets for the pricing page (in display order). */
  features: string[]
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Design and try it out.',
    limits: { maxTemplates: 3, maxExportsPerMonth: 50, maxBulkRowsPerJob: 0, maxMembers: 1 },
    capabilities: {
      cleanExport: false,
      bulk: false,
      zpl: false,
      delivery: false,
      api: false,
      teams: false,
      versionHistory: false,
      cloudSync: false,
    },
    features: [
      'Full drag-and-drop canvas & element library',
      'Up to 3 saved templates',
      '50 PDF exports / month (watermarked)',
      'CSV / Excel / JSON data mapping',
    ],
  },

  pro: {
    id: 'pro',
    name: 'Pro',
    price: 15,
    tagline: 'For individuals shipping real work.',
    limits: { maxTemplates: null, maxExportsPerMonth: 2000, maxBulkRowsPerJob: 500, maxMembers: 1 },
    capabilities: {
      cleanExport: true,
      bulk: true,
      zpl: true,
      delivery: true,
      api: false,
      teams: false,
      versionHistory: true,
      cloudSync: true,
    },
    features: [
      'Everything in Free, plus:',
      'Unlimited templates',
      'Clean, watermark-free exports',
      '2,000 exports / month',
      'Bulk generation (up to 500 rows/job)',
      'ZPL / thermal label export',
      'Version history & cloud sync',
    ],
  },

  business: {
    id: 'business',
    name: 'Business',
    price: 49,
    tagline: 'For teams automating at scale.',
    limits: { maxTemplates: null, maxExportsPerMonth: 25000, maxBulkRowsPerJob: 5000, maxMembers: 5 },
    capabilities: {
      cleanExport: true,
      bulk: true,
      zpl: true,
      delivery: true,
      api: true,
      teams: true,
      versionHistory: true,
      cloudSync: true,
    },
    features: [
      'Everything in Pro, plus:',
      '25,000 exports / month',
      'Bulk generation (up to 5,000 rows/job)',
      'API access & programmatic ingestion',
      'Team workspaces, roles & invites (up to 5 members)',
      'Priority support',
    ],
  },
}

/** Ordered low → high. */
export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'business']

export function getPlan(planId: string | null | undefined): Plan {
  return PLANS[(planId as PlanId)] ?? PLANS.free
}

/** True if the plan grants the named capability. */
export function planAllows(planId: string | null | undefined, capability: Capability): boolean {
  return getPlan(planId).capabilities[capability]
}

/** Lowest-priced plan that grants `capability`, or null if none do. */
export function minPlanFor(capability: Capability): Plan | null {
  for (const id of PLAN_ORDER) {
    if (PLANS[id].capabilities[capability]) return PLANS[id]
  }
  return null
}
