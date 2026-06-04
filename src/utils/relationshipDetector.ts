/**
 * relationshipDetector.ts  (v2 — confidence-scored)
 *
 * Three-layer relationship detection that now emits a confidence score
 * for every detected relationship instead of a binary found/not-found signal.
 *
 * CONFIDENCE COMPUTATION
 * ──────────────────────
 * Layer 1 (explicit-key — exact shared column name):
 *   base               = 0.90
 *   + 0.05 if driverUniquenessRatio >= 0.95   (near-unique PK)
 *   + 0.05 if fkCoverageRatio >= 0.95          (almost all child rows match)
 *   cap at 0.99 (1.0 reserved for user-defined)
 *
 * Layer 2 (value-intersection):
 *   confidence = intersectionScore * 0.85
 *   → range 0.00–0.85 (never reaches auto-commit threshold)
 *
 * user-defined: always 1.0
 *
 * CHANGES FROM v1
 * ────────────────
 * - Every RelatedCollection now carries confidence + detectedBy + explanation
 * - ScopingRule shape matches RuntimeDataStructure.ScopingRule
 * - buildRelationshipMap() returns ScoredRelationshipMap for use by
 *   RelationshipReview and the guided builder
 * - All existing exports kept for backward compatibility
 */

import type { CanonicalDocument } from '../types/dataSource';
import type { ScopingRule, ScopingDetectedBy } from '../types/runtimeDataStructure';
import { CONFIDENCE } from '../types/runtimeDataStructure';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface RelatedCollection {
  collectionKey:    string;
  foreignKey:       string;
  primaryKey:       string;
  avgRowsPerParent: number;
  detectionLayer:   1 | 2;
  /** 0–1 confidence score. New in v2. */
  confidence:       number;
  /** Which detection method produced this relationship. New in v2. */
  detectedBy:       ScopingDetectedBy;
  /** Human-readable explanation for the review UI. New in v2. */
  explanation:      string;
}

export interface CollectionRelationships {
  driverCollection:    string;
  relatedCollections:  RelatedCollection[];
  rowCount:            number;
  unlinkedCollections: string[];
}

export interface RelationshipMap {
  [driverCollectionKey: string]: CollectionRelationships;
}

/**
 * Metadata about the scored relationship map.
 */
export interface ScoredRelationshipMeta {
  hasAutoCommit:  boolean;  // any relationship >= AUTO_COMMIT threshold
  hasSuggest:     boolean;  // any in SUGGEST range
  hasUncertain:   boolean;  // any below SUGGEST threshold
  needsReview:    boolean;  // hasSuggest || hasUncertain
}

/**
 * Richer map that also surfaces whether any relationship needs user review.
 * Consumed by RelationshipReview and IntentCapturePanel.
 */
export type ScoredRelationshipMap = RelationshipMap & {
  _meta: ScoredRelationshipMeta;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_CHILD_MULTIPLIER = 1.5;

const GENERIC_COLUMN_NAMES = new Set([
  'name', 'title', 'label', 'description', 'type', 'category',
  'status', 'notes', 'comments', 'remarks', 'code', 'tag',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function getColumns(rows: Row[]): Set<string> {
  const cols = new Set<string>();
  for (const row of rows) Object.keys(row).forEach(k => cols.add(k));
  return cols;
}

function uniquenessRatio(rows: Row[], col: string): number {
  if (rows.length === 0) return 1;
  return new Set(rows.map(r => String(r[col] ?? ''))).size / rows.length;
}

function fkCoverageRatio(
  parentRows: Row[], childRows: Row[], pkCol: string, fkCol: string,
): number {
  if (childRows.length === 0) return 1;
  const parentKeys = new Set(parentRows.map(r => String(r[pkCol] ?? '')));
  const fkValues   = childRows.map(r => String(r[fkCol] ?? ''));
  return fkValues.filter(v => parentKeys.has(v)).length / fkValues.length;
}

function sharedColumnNames(collections: CanonicalDocument['collections']): string[] {
  const count: Record<string, number> = {};
  for (const coll of Object.values(collections)) {
    for (const col of getColumns(coll.rows)) {
      count[col] = (count[col] ?? 0) + 1;
    }
  }
  return Object.entries(count)
    .filter(([, n]) => n >= 2)
    .map(([c]) => c)
    .sort();
}

/**
 * Compute Layer 1 confidence from two quality signals.
 *
 *   base = 0.90
 *   + 0.05 if driverRatio >= 0.95
 *   + 0.05 if coverage >= 0.95
 *   capped at 0.99 (1.0 reserved for user-defined)
 */
function layer1Confidence(driverRatio: number, coverage: number): number {
  let score = 0.90;
  if (driverRatio >= 0.95) score += 0.05;
  if (coverage    >= 0.95) score += 0.05;
  return Math.min(score, 0.99);
}

/**
 * Layer 2 confidence = intersectionScore × 0.85
 * Never reaches the AUTO_COMMIT threshold — always requires one-click approval.
 */
function layer2Confidence(intersectionScore: number): number {
  return intersectionScore * 0.85;
}

interface Layer2Match {
  parentCol:         string;
  childCol:          string;
  intersectionScore: number;
}

function findValueIntersection(
  parentRows:            Row[],
  childRows:             Row[],
  parentCols:            Set<string>,
  childCols:             Set<string>,
  alreadyFoundChildCols: Set<string>,
): Layer2Match | null {
  const parentSample = parentRows.slice(0, 200);
  const childSample  = childRows.slice(0, 200);

  let best: (Layer2Match & { score: number }) | null = null;

  for (const pc of parentCols) {
    if (GENERIC_COLUMN_NAMES.has(pc.toLowerCase())) continue;
    const parentVals = new Set(parentSample.map(r => String(r[pc] ?? '')));
    if (parentVals.size < 2) continue;

    for (const cc of childCols) {
      if (alreadyFoundChildCols.has(cc)) continue;
      if (pc === cc) continue;
      if (GENERIC_COLUMN_NAMES.has(cc.toLowerCase())) continue;

      const childVals = childSample.map(r => String(r[cc] ?? ''));
      const matches   = childVals.filter(v => parentVals.has(v)).length;
      const score     = childVals.length > 0 ? matches / childVals.length : 0;

      const parentRatio = uniquenessRatio(parentRows, pc);
      if (score >= 0.8 && parentRatio >= 0.8) {
        if (!best || score > best.score) {
          best = { parentCol: pc, childCol: cc, intersectionScore: score, score };
        }
      }
    }
  }

  return best ? { parentCol: best.parentCol, childCol: best.childCol, intersectionScore: best.intersectionScore } : null;
}

function buildExplanation(
  layer:        1 | 2,
  joinCol:      string,
  fkCol:        string,
  driverRatio:  number,
  coverage:     number,
  confidence:   number,
): string {
  if (layer === 1) {
    const pct = Math.round(coverage * 100);
    return `Shared column "${joinCol}" — ${pct}% of child rows match a driver value (uniqueness ${Math.round(driverRatio * 100)}%).`;
  }
  return `Value overlap: "${joinCol}" in driver matches "${fkCol}" in child (${Math.round(confidence / 0.85 * 100)}% overlap).`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core detection
// ─────────────────────────────────────────────────────────────────────────────

function detectRelatedForDriver(
  driverKey:   string,
  driverRows:  Row[],
  collections: CanonicalDocument['collections'],
  sharedCols:  string[],
): { related: RelatedCollection[]; unlinked: string[] } {
  const related:  RelatedCollection[] = [];
  const unlinked: string[]            = [];
  const driverColSet   = getColumns(driverRows);
  const foundChildCols = new Set<string>();

  for (const [childKey, child] of Object.entries(collections)) {
    if (childKey === driverKey)    continue;
    if (child.rows.length === 0)   continue;

    if (child.rows.length < driverRows.length * MIN_CHILD_MULTIPLIER) {
      unlinked.push(childKey);
      continue;
    }

    // ── Layer 1: exact shared column name ─────────────────────────────────
    let foundInLayer1 = false;
    for (const joinCol of sharedCols) {
      if (!driverColSet.has(joinCol)) continue;
      const driverRatio = uniquenessRatio(driverRows, joinCol);
      if (driverRatio < 0.8) continue;
      if (!getColumns(child.rows).has(joinCol)) continue;
      const childRatio = uniquenessRatio(child.rows, joinCol);
      if (childRatio >= driverRatio) continue;
      const coverage = fkCoverageRatio(driverRows, child.rows, joinCol, joinCol);
      if (coverage < 0.8) continue;
      if (related.some(r => r.collectionKey === childKey)) continue;

      const conf = layer1Confidence(driverRatio, coverage);
      const uniqueParentVals = new Set(driverRows.map(r => String(r[joinCol] ?? ''))).size;

      related.push({
        collectionKey:    childKey,
        foreignKey:       joinCol,
        primaryKey:       joinCol,
        avgRowsPerParent: uniqueParentVals > 0
          ? Math.round((child.rows.length / uniqueParentVals) * 10) / 10 : 0,
        detectionLayer:   1,
        confidence:       conf,
        detectedBy:       'explicit-key',
        explanation:      buildExplanation(1, joinCol, joinCol, driverRatio, coverage, conf),
      });
      foundChildCols.add(joinCol);
      foundInLayer1 = true;
      break;
    }
    if (foundInLayer1) continue;

    // ── Layer 2: value intersection ───────────────────────────────────────
    const childColSet = getColumns(child.rows);
    const match = findValueIntersection(
      driverRows, child.rows, driverColSet, childColSet, foundChildCols,
    );

    if (match) {
      const conf             = layer2Confidence(match.intersectionScore);
      const uniqueParentVals = new Set(
        driverRows.map(r => String(r[match.parentCol] ?? '')),
      ).size;
      related.push({
        collectionKey:    childKey,
        foreignKey:       match.childCol,
        primaryKey:       match.parentCol,
        avgRowsPerParent: uniqueParentVals > 0
          ? Math.round((child.rows.length / uniqueParentVals) * 10) / 10 : 0,
        detectionLayer:   2,
        confidence:       conf,
        detectedBy:       'value-intersection',
        explanation:      buildExplanation(2, match.parentCol, match.childCol, 0, match.intersectionScore, conf),
      });
    } else {
      unlinked.push(childKey);
    }
  }

  return {
    related:  related.sort((a, b) => b.avgRowsPerParent - a.avgRowsPerParent),
    unlinked,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export function detectRelationships(ir: CanonicalDocument): RelationshipMap {
  const { collections } = ir;
  const keys            = Object.keys(collections);
  const map: RelationshipMap = {};

  if (keys.length === 0) return map;

  if (keys.length === 1) {
    const [k, c] = Object.entries(collections)[0];
    map[k] = {
      driverCollection:    k,
      relatedCollections:  [],
      unlinkedCollections: [],
      rowCount:            c.rows.length,
    };
    return map;
  }

  const sharedCols = sharedColumnNames(collections);

  for (const [collKey, coll] of Object.entries(collections)) {
    if (coll.rows.length === 0) continue;
    const { related, unlinked } = detectRelatedForDriver(
      collKey, coll.rows, collections, sharedCols,
    );
    map[collKey] = {
      driverCollection:    collKey,
      relatedCollections:  related,
      unlinkedCollections: unlinked,
      rowCount:            coll.rows.length,
    };
  }

  return map;
}

/**
 * Returns the relationship map augmented with _meta flags for the review UI.
 */
export function detectRelationshipsScored(ir: CanonicalDocument): ScoredRelationshipMap {
  const base = detectRelationships(ir);
  let hasAutoCommit = false;
  let hasSuggest    = false;
  let hasUncertain  = false;

  for (const rel of Object.values(base)) {
    for (const r of rel.relatedCollections) {
      if (r.confidence >= CONFIDENCE.AUTO_COMMIT)  hasAutoCommit = true;
      else if (r.confidence >= CONFIDENCE.SUGGEST) hasSuggest    = true;
      else                                         hasUncertain  = true;
    }
  }

  return {
    ...base,
    _meta: {
      hasAutoCommit,
      hasSuggest,
      hasUncertain,
      needsReview: hasSuggest || hasUncertain,
    },
  } as ScoredRelationshipMap;
}

export function buildRelatedCollectionsConfig(
  driverKey:     string,
  relationships: RelationshipMap,
): Record<string, { filterColumn: string; driverRowField: string }> {
  const rel = relationships[driverKey];
  if (!rel) return {};
  return Object.fromEntries(
    rel.relatedCollections.map(r => [
      r.collectionKey,
      { filterColumn: r.foreignKey, driverRowField: r.primaryKey },
    ]),
  );
}

/**
 * Convert detected relationships into ScopingRules for RuntimeDataStructure.
 */
export function toScopingRules(
  relationships: RelationshipMap,
  driverKey:     string,
): Record<string, ScopingRule> {
  const rel = relationships[driverKey];
  if (!rel) return {};
  const out: Record<string, ScopingRule> = {};
  for (const r of rel.relatedCollections) {
    out[r.collectionKey] = {
      filterColumn:   r.foreignKey,
      driverRowField: r.primaryKey,
      confidence:     r.confidence,
      detectedBy:     r.detectedBy,
      explanation:    r.explanation,
    };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata sheet helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

export const METADATA_SHEET_NAMES = new Set([
  'metadata', 'settings', 'config', 'global', 'constants', 'info', 'header',
]);

export function isMetadataSheet(rows: Record<string, unknown>[], sheetName: string): boolean {
  if (METADATA_SHEET_NAMES.has(sheetName.trim().toLowerCase())) return true;
  if (rows.length === 0 || rows.length > 100) return false;
  const cols = Object.keys(rows[0]);
  if (cols.length !== 2) return false;
  const firstColVals = rows.map(r => String(r[cols[0]] ?? ''));
  return new Set(firstColVals).size === rows.length;
}

export function metadataSheetToFields(rows: Record<string, unknown>[]): Record<string, string> {
  if (rows.length === 0) return {};
  const cols = Object.keys(rows[0]);
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = String(row[cols[0]] ?? '').trim();
    if (key) out[key] = String(row[cols[1]] ?? '');
  }
  return out;
}