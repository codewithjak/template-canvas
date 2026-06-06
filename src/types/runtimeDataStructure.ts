/**
 * runtimeDataStructure.ts
 *
 * Central schema for the runtime data layer.
 * Replaces ad-hoc CanonicalDocument passing across component boundaries.
 *
 * DESIGN PRINCIPLES
 * ──────────────────
 * 1. Parsing output (source, fields, collections) is immutable after creation.
 * 2. Relationships carry a confidence score — never silently committed.
 * 3. ExecutionPlan is the single source of truth for how bulk runs.
 * 4. RenderContext is what the renderer receives — flat, scoped, no relational knowledge.
 *
 * MIGRATION
 * ──────────
 * toRuntimeDataStructure() wraps an existing CanonicalDocument so all existing
 * call sites keep working while the new structure is adopted incrementally.
 */

import type { CanonicalDocument } from './dataSource';

// ─────────────────────────────────────────────────────────────────────────────
// Confidence tiers — never use magic numbers
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIDENCE = {
  /** Auto-commit — show green badge, user can override but no blocking. */
  AUTO_COMMIT:   0.95,
  /** Suggest — one-click approval required before proceeding. */
  SUGGEST:       0.70,
  /** Uncertain — must go through guided flow. */
  UNCERTAIN:     0.40,
  /** No relationship — user starts from scratch. */
  NONE:          0.00,
} as const;

export type ConfidenceTier =
  | 'auto'      // ≥ 0.95
  | 'suggest'   // 0.70–0.94
  | 'uncertain' // 0.40–0.69
  | 'none';     // < 0.40

export function getConfidenceTier(score: number): ConfidenceTier {
  if (score >= CONFIDENCE.AUTO_COMMIT) return 'auto';
  if (score >= CONFIDENCE.SUGGEST)     return 'suggest';
  if (score >= CONFIDENCE.UNCERTAIN)   return 'uncertain';
  return 'none';
}

export function getConfidenceLabel(tier: ConfidenceTier): string {
  switch (tier) {
    case 'auto':      return 'High confidence';
    case 'suggest':   return 'Likely match';
    case 'uncertain': return 'Uncertain';
    case 'none':      return 'No match found';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload intent — captured before the file lands
// ─────────────────────────────────────────────────────────────────────────────

export type UploadIntent =
  | 'flat'       // Each row is a separate document — skip relationship detection
  | 'relational' // Data has related sheets — run detection + review flow
  | 'unknown';   // Not yet captured (pre-upload state)

// ─────────────────────────────────────────────────────────────────────────────
// Collection role — assigned after relationship resolution
// ─────────────────────────────────────────────────────────────────────────────

export type CollectionRole =
  | 'driver'     // Drives document generation (one document per row)
  | 'related'    // Scoped per driver row via FK
  | 'standalone' // Independent — not linked to driver
  | 'metadata';  // Single-row metadata sheet

// ─────────────────────────────────────────────────────────────────────────────
// Scoping rule — how a related collection is filtered per driver row
// ─────────────────────────────────────────────────────────────────────────────

export type ScopingDetectedBy =
  | 'explicit-key'        // Layer 1: exact shared column name, high uniqueness
  | 'value-intersection'  // Layer 2: value overlap across non-generic columns
  | 'user-defined';       // User explicitly set via guided flow

export interface ScopingRule {
  /** Column in the related collection used as the FK. */
  filterColumn:   string;
  /** Column in the driver row used as the PK to match against. */
  driverRowField: string;
  /**
   * Confidence score 0–1.
   * Computed from detection signals — never a magic number.
   *
   * Signal composition:
   *   Layer 1 (explicit-key):
   *     base = 0.90
   *     + 0.05 if driverUniquenessRatio >= 0.95
   *     + 0.05 if fkCoverageRatio >= 0.95
   *     → range 0.90–1.00 (capped at 1.0 before user-defined)
   *
   *   Layer 2 (value-intersection):
   *     base = intersectionScore * 0.85
   *     → range 0.00–0.85
   *
   *   user-defined: always 1.0
   */
  confidence:     number;
  detectedBy:     ScopingDetectedBy;
  /**
   * Human-readable explanation of why this relationship was detected.
   * Shown in the RelationshipReview UI.
   */
  explanation?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime collection
// ─────────────────────────────────────────────────────────────────────────────

export interface RuntimeCollection {
  rows:      Record<string, unknown>[];
  columns:   string[];
  role:      CollectionRole;
  totalRows: number;
  /** Scoping rule that links this collection to its driver. Present when role === 'related'. */
  scopingRule?: ScopingRule;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution plan
// ─────────────────────────────────────────────────────────────────────────────

export type ExecutionMode =
  | 'single'           // One document
  | 'flat-bulk'        // N documents, one per row, no relationship scoping
  | 'relational-bulk'  // N documents, one per driver record, related collections scoped
  | 'grouped'          // M documents where M < N, one per unique value of groupByColumn
  | 'merged';          // One document containing all records (full report)

export interface ExecutionPlan {
  mode:          ExecutionMode;
  driverKey:     string | null;
  /** Present when mode === 'grouped'. */
  groupByColumn?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relationship approval state — tracks what the user has done
// ─────────────────────────────────────────────────────────────────────────────

export type RelationshipApprovalState =
  | 'pending'   // Not yet reviewed
  | 'approved'  // User approved (or auto-committed)
  | 'rejected'  // User rejected — collection treated as standalone
  | 'edited';   // User changed the FK/PK columns

// ─────────────────────────────────────────────────────────────────────────────
// Central RuntimeDataStructure
// ─────────────────────────────────────────────────────────────────────────────

export interface RuntimeDataStructure {
  /**
   * Stable extraction output — frozen after parsing.
   * Never mutated after creation.
   */
  source: {
    fileName:  string;
    warnings:  string[];
    parsedAt:  string; // ISO timestamp
  };

  /**
   * Flat scalar fields — true metadata only.
   * Collection-scalar values NEVER live here.
   */
  fields: Record<string, string>;

  /**
   * Collections with their resolved roles and scoping rules.
   */
  collections: Record<string, RuntimeCollection>;

  /**
   * How the template should execute against this data.
   */
  executionPlan: ExecutionPlan;

  /**
   * User's stated intent before upload.
   * Persists with the structure so the guided flow has context.
   */
  uploadIntent: UploadIntent;

  /**
   * Approval state for each relationship.
   * Key is the related collection key.
   * Only present when uploadIntent === 'relational'.
   */
  relationshipApprovals?: Record<string, RelationshipApprovalState>;
}

// ─────────────────────────────────────────────────────────────────────────────
// RenderContext — what the renderer receives
// Completely flat — no relational knowledge, no collection roles
// ─────────────────────────────────────────────────────────────────────────────

export interface RenderContext {
  /** All scalar fields available for {{placeholder}} substitution. */
  fields:      Record<string, string>;
  /** Collections available for table rendering, already scoped to this record. */
  collections: Record<string, { rows: Record<string, unknown>[]; columns: string[] }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRenderContext — the single place where scoping happens
// Works identically client-side and can be called server-side
// ─────────────────────────────────────────────────────────────────────────────

export function buildRenderContext(
  rds:      RuntimeDataStructure,
  rowIndex: number,
): RenderContext {
  const { driverKey } = rds.executionPlan;

  // Static template — no driver collection
  if (!driverKey || !rds.collections[driverKey]) {
    return {
      fields:      { ...rds.fields },
      collections: Object.fromEntries(
        Object.entries(rds.collections).map(([k, c]) => [
          k,
          { rows: c.rows, columns: c.columns },
        ]),
      ),
    };
  }

  const driverColl = rds.collections[driverKey];
  const safeIndex  = Math.min(rowIndex, driverColl.rows.length - 1);
  const driverRow  = driverColl.rows[safeIndex] ?? {};

  // Promote driver row columns to fields
  const fields: Record<string, string> = { ...rds.fields };
  for (const [k, v] of Object.entries(driverRow)) {
    fields[k] = String(v ?? '');
  }

  // Scope related collections by FK
  const collections: RenderContext['collections'] = {};

  for (const [collKey, coll] of Object.entries(rds.collections)) {
    if (collKey === driverKey) continue;

    if (coll.role === 'related' && coll.scopingRule) {
      const { filterColumn, driverRowField } = coll.scopingRule;
      const matchValue = String(driverRow[driverRowField] ?? '');
      const scoped     = coll.rows.filter(
        r => String(r[filterColumn] ?? '') === matchValue,
      );
      collections[collKey] = { rows: scoped, columns: coll.columns };
    } else {
      // standalone / metadata — pass through unscoped
      collections[collKey] = { rows: coll.rows, columns: coll.columns };
    }
  }

  return { fields, collections };
}

// ─────────────────────────────────────────────────────────────────────────────
// Migration adapter — wraps CanonicalDocument without breaking existing code
// ─────────────────────────────────────────────────────────────────────────────

export function toRuntimeDataStructure(
  ir:            CanonicalDocument,
  intent:        UploadIntent = 'unknown',
  executionMode: ExecutionMode = 'single',
  driverKey?:    string,
): RuntimeDataStructure {
  const collKeys = Object.keys(ir.collections);

  const collections: Record<string, RuntimeCollection> = {};
  for (const [k, c] of Object.entries(ir.collections)) {
    const cols = c.columns ?? Object.keys(c.rows[0] ?? {});
    collections[k] = {
      rows:      c.rows,
      columns:   cols,
      role:      k === (driverKey ?? collKeys[0]) ? 'driver' : 'standalone',
      totalRows: c.rows.length,
    };
  }

  return {
    source: {
      fileName: ir.source?.fileName  ?? 'unknown',
      warnings: ir.source?.warnings  ?? [],
      parsedAt: new Date().toISOString(),
    },
    fields:      ir.fields ?? {},
    collections,
    executionPlan: {
      mode:      executionMode,
      driverKey: driverKey ?? collKeys[0] ?? null,
    },
    uploadIntent: intent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant assertions — used in tests
// ─────────────────────────────────────────────────────────────────────────────

export function assertRdsInvariants(rds: RuntimeDataStructure): string[] {
  const violations: string[] = [];

  // fields must not contain collection-column values
  for (const [collKey, coll] of Object.entries(rds.collections)) {
    for (const col of coll.columns) {
      if (col in rds.fields) {
        violations.push(
          `Invariant violated: rds.fields["${col}"] shadows collection "${collKey}" column.`,
        );
      }
    }
  }

  // every related collection must have a scoping rule
  for (const [collKey, coll] of Object.entries(rds.collections)) {
    if (coll.role === 'related' && !coll.scopingRule) {
      violations.push(
        `Invariant violated: collection "${collKey}" has role "related" but no scopingRule.`,
      );
    }
  }

  // confidence must be 0–1
  for (const [collKey, coll] of Object.entries(rds.collections)) {
    if (coll.scopingRule) {
      const c = coll.scopingRule.confidence;
      if (c < 0 || c > 1) {
        violations.push(
          `Invariant violated: collection "${collKey}" scopingRule.confidence ${c} is outside [0,1].`,
        );
      }
    }
  }

  return violations;
}