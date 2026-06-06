/**
 * classifyPlaceholders.ts
 *
 * Splits template placeholders into three buckets.
 *
 * BUCKET 1 — collection-scalar
 * ─────────────────────────────
 * The placeholder name matches a column in at least one collection.
 * These fields live OUTSIDE a table in the template but their values
 * come from a collection row (the driver row in bulk, first row in single).
 *
 *   Example: {{student_name}} outside a table when students is a collection.
 *
 *   Bulk  → auto-resolved per driver row. No mapping needed.
 *   Single→ resolved from the first row of the matched collection, OR
 *           from a user-supplied preview value.
 *
 * BUCKET 2 — already-resolved
 * ─────────────────────────────
 * The placeholder name matches a key already in ir.fields.
 * This happens when the file has a metadata sheet or scalar top-level fields.
 * Nothing for the user to do — it just works in both single and bulk.
 *
 * BUCKET 3 — true-metadata
 * ─────────────────────────────
 * Not a collection column, not in ir.fields.
 * This is a genuine document-level value that does not exist anywhere in the
 * data — school name, principal, report period, etc.
 *
 *   Single→ user types a value (used only in this export).
 *   Bulk  → user types a value in BulkExportPanel once; saved in template meta.
 */

import type { CanonicalDocument } from '../types/dataSource';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type PlaceholderBucket =
  | 'collection-scalar'   // matches a collection column → auto-resolved per row
  | 'already-resolved'    // already in ir.fields
  | 'true-metadata';      // not found anywhere → user must provide

export interface CollectionScalarInfo {
  placeholder:   string;
  collectionKey: string;   // which collection has this column
  columnName:    string;   // the actual column name (may differ in case)
}

export interface ClassificationResult {
  /** Flat placeholders whose values come from a collection column. */
  collectionScalars:  CollectionScalarInfo[];
  /** Placeholders already in ir.fields — fully auto-resolved. */
  alreadyResolved:    string[];
  /** Placeholders not found anywhere — user must supply the value. */
  trueMetadata:       string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Core
// ─────────────────────────────────────────────────────────────────────────────

export function classifyPlaceholders(
  placeholders: string[],
  ir:           CanonicalDocument,
): ClassificationResult {
  const result: ClassificationResult = {
    collectionScalars: [],
    alreadyResolved:   [],
    trueMetadata:      [],
  };

  if (placeholders.length === 0) return result;

  // Build case-insensitive lookup: column_name_lower → { collectionKey, originalCol }
  const colLookup = new Map<string, { collectionKey: string; columnName: string }>();
  for (const [collKey, coll] of Object.entries(ir.collections)) {
    const cols = coll.columns ?? Object.keys(coll.rows[0] ?? {});
    for (const col of cols) {
      const lower = col.toLowerCase();
      // First collection wins if multiple have the same column name
      if (!colLookup.has(lower)) {
        colLookup.set(lower, { collectionKey: collKey, columnName: col });
      }
    }
  }

  const fieldKeys = new Set(Object.keys(ir.fields).map(k => k.toLowerCase()));

  for (const ph of placeholders) {
    const key = ph.toLowerCase();

    if (fieldKeys.has(key)) {
      result.alreadyResolved.push(ph);
    } else if (colLookup.has(key)) {
      const { collectionKey, columnName } = colLookup.get(key)!;
      result.collectionScalars.push({ placeholder: ph, collectionKey, columnName });
    } else {
      result.trueMetadata.push(ph);
    }
  }

  return result;
}

/**
 * For the BulkExportPanel: further split collectionScalars by whether they
 * come from the selected driver collection or a different collection.
 */
export function splitCollectionScalars(
  scalars:    CollectionScalarInfo[],
  driverKey:  string,
): {
  fromDriver:  CollectionScalarInfo[];  // comes from driver → auto per row
  fromOther:   CollectionScalarInfo[];  // comes from non-driver collection
} {
  return {
    fromDriver: scalars.filter(s => s.collectionKey === driverKey),
    fromOther:  scalars.filter(s => s.collectionKey !== driverKey),
  };
}