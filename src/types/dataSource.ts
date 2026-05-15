/**
 * types/dataSource.ts
 * Shared types for the generic data source architecture.
 * These flow through: parser → upload UI → canvas state → export payload.
 */

export type DataRow = Record<string, string>;

/** A named collection of rows (e.g. invoice line items). */
export interface DataCollection {
  headers: string[];
  rows: DataRow[];
}

/**
 * Normalized output from any data source parser.
 * This is what /parse-data (and /parse-json) return.
 */
export interface ParsedDataSource {
  /** Flat key→value metadata (from KV sections, scalar JSON fields, etc.) */
  metadata: Record<string, string>;
  /**
   * Named collections of row data.
   * Key = collection name (e.g. "items", "lines", "collection_2").
   */
  collections: Record<string, DataCollection>;
  fileName?: string;
  fileType?: string;
}

/**
 * Everything the canvas needs to render previews and drive exports.
 */
export interface BoundData {
  source: ParsedDataSource;
  /** template static placeholder → metadata key */
  fieldMapping: Record<string, string>;
  /** tableElementId → collectionKey */
  tableCollectionBindings: Record<string, string>;
  /** collectionKey → { templatePlaceholder → collectionColumnName } */
  collectionMappings: Record<string, Record<string, string>>;
}

/**
 * JSON body sent to POST /generate-document.
 */
export interface ExportPayload {
  templateElements: unknown[];
  staticData: Record<string, string>;
  /** collectionKey → rows (plain array, not the { headers, rows } shape) */
  collections: Record<string, DataRow[]>;
  fieldMapping: Record<string, string>;
  tableCollectionBindings: Record<string, string>;
  collectionMappings: Record<string, Record<string, string>>;
  outputFileName?: string;
}

/** Per-table info surfaced to the UploadData UI. */
export interface TableInfo {
  id: string;
  label: string;               // e.g. "Table 1"
  placeholders: string[];      // {{…}} tokens found in the table's cells
  currentCollectionKey: string;
}