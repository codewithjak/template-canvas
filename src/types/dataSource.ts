/**
 * src/types/dataSource.ts
 *
 * Single source of truth for all data-source types.
 * Mirrors the backend CanonicalDocument IR exactly.
 * No legacy aliases. No ParsedDataSource. No BoundData.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core IR  (mirrors backend/types/canonicalDocument.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One named collection of tabular rows.
 * `columns` is the ordered header list.
 * Every row object has those same keys with string values.
 */
export interface Collection {
  columns: string[];
  rows:    Record<string, string>[];
}

export type DataSourceType = 'excel' | 'csv' | 'json' | 'api';

export interface DataSourceMeta {
  type:      DataSourceType;
  fileName?: string;
  sheets?:   string[];   // Excel only
  warnings?: string[];   // non-fatal parse warnings — surface in the UI
}

/**
 * The one IR type that every backend parser returns and every
 * frontend consumer reads.
 *
 *   fields      — flat key→value scalars, all strings, dot-notation keys
 *   collections — named tabular datasets
 *   source      — provenance / debug info
 */
export interface CanonicalDocument {
  fields:      Record<string, string>;
  collections: Record<string, Collection>;
  source?:     DataSourceMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component / hook state
// ─────────────────────────────────────────────────────────────────────────────

export type DataSourceStatus = 'idle' | 'parsing' | 'ready' | 'error';

export interface DataSourceState {
  status:    DataSourceStatus;
  ir:        CanonicalDocument | null;
  error?:    string;
  fileName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Binding / validation
// ─────────────────────────────────────────────────────────────────────────────

export interface MissingField {
  placeholder: string;  // token in template:  {{company_name}}
  resolvedKey: string;  // key that was looked up: company.name
}

export interface MissingCollection {
  elementId:     string;
  collectionKey: string;
}

export interface BindingValidationResult {
  valid:               boolean;
  missingFields:       MissingField[];
  missingCollections:  MissingCollection[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping alias types
// ─────────────────────────────────────────────────────────────────────────────

/** template placeholder → ir.fields key */
export type FieldMapping = Record<string, string>;

/** collectionKey → { cell-binding-path → collection-row-key } */
export type CollectionMappings = Record<string, Record<string, string>>;

/** tableElementId → collectionKey in ir.collections */
export type TableCollectionBindings = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Upload-UI
// ─────────────────────────────────────────────────────────────────────────────

/** Per-table info surfaced to the UploadData mapping UI. */
export interface TableInfo {
  id:                   string;
  label:                string;    // "Table 1"
  placeholders:         string[];  // {{…}} tokens found in that table's cells
  currentCollectionKey: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience
// ─────────────────────────────────────────────────────────────────────────────

/** A single collection row — every value is a string. */
export type DataRow = Record<string, string>;