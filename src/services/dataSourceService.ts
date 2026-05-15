/**
 * dataSourceService.ts
 * Client-side utilities for working with ParsedDataSource objects:
 *   - auto-mapping placeholders to metadata keys
 *   - auto-mapping table placeholders to collection columns
 *   - building the BoundData object used by TemplateCanvas
 */

import type { ParsedDataSource, BoundData, TableInfo, DataRow } from '../types/dataSource';

// ── String normalisation ──────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Score similarity between two normalised strings.
 * Returns a number 0–1 (1 = exact match).
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  // simple character overlap coefficient
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = [...setA].filter(c => setB.has(c)).length;
  return intersection / Math.max(setA.size, setB.size);
}

/**
 * Find the best matching key from candidates for a given placeholder.
 * Returns the matched key or '' if nothing is close enough.
 */
function bestMatch(placeholder: string, candidates: string[], threshold = 0.6): string {
  const normP = normalize(placeholder);
  let bestKey = '';
  let bestScore = threshold - 0.001;

  for (const c of candidates) {
    const score = similarity(normP, normalize(c));
    if (score > bestScore) {
      bestScore = score;
      bestKey = c;
    }
  }
  return bestKey;
}

// ── Auto-mapping ──────────────────────────────────────────────────────────────

/**
 * Auto-map static template placeholders to metadata keys.
 * @param placeholders  - from non-table elements, e.g. ["company_name", "invoice_no"]
 * @param metadataKeys  - keys available in the parsed metadata
 */
export function autoMapStaticFields(
  placeholders: string[],
  metadataKeys: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const p of placeholders) {
    mapping[p] = bestMatch(p, metadataKeys) || '';
  }
  return mapping;
}

/**
 * Auto-map table cell placeholders to collection column names.
 * @param placeholders   - e.g. ["serial_no", "description", "quantity"]
 * @param columnNames    - actual column headers in the collection
 */
export function autoMapCollectionFields(
  placeholders: string[],
  columnNames: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const p of placeholders) {
    mapping[p] = bestMatch(p, columnNames, 0.5) || '';
  }
  return mapping;
}

/**
 * Build the initial BoundData from a ParsedDataSource + template info.
 * All mappings are auto-computed; the user can then refine them in the UI.
 */
export function buildInitialBoundData(
  source: ParsedDataSource,
  staticPlaceholders: string[],
  tables: TableInfo[]
): BoundData {
  const metadataKeys = Object.keys(source.metadata);
  const collectionKeys = Object.keys(source.collections);

  // Static field mapping
  const fieldMapping = autoMapStaticFields(staticPlaceholders, metadataKeys);

  // For each table, pick the best collection and map its columns
  const tableCollectionBindings: Record<string, string> = {};
  const collectionMappings: Record<string, Record<string, string>> = {};

  tables.forEach((table, idx) => {
    // Use the table's existing binding key if valid, otherwise pick by index
    const preferred = table.currentCollectionKey && source.collections[table.currentCollectionKey]
      ? table.currentCollectionKey
      : collectionKeys[idx] || collectionKeys[0] || '';

    tableCollectionBindings[table.id] = preferred;

    if (preferred && source.collections[preferred]) {
      // Only compute if not already mapped (multiple tables can share a collection)
      if (!collectionMappings[preferred]) {
        collectionMappings[preferred] = autoMapCollectionFields(
          table.placeholders,
          source.collections[preferred].headers
        );
      }
    }
  });

  return { source, fieldMapping, tableCollectionBindings, collectionMappings };
}

/**
 * Build the export payload from BoundData.
 * Converts { headers, rows } collection shape to plain rows[] for the backend.
 */
export function buildExportPayload(
  templateElements: unknown[],
  boundData: BoundData,
  outputFileName?: string
) {
  const flatCollections: Record<string, DataRow[]> = {};
  for (const [key, col] of Object.entries(boundData.source.collections)) {
    flatCollections[key] = col.rows;
  }

  return {
    templateElements,
    staticData: boundData.source.metadata,
    collections: flatCollections,
    fieldMapping: boundData.fieldMapping,
    tableCollectionBindings: boundData.tableCollectionBindings,
    collectionMappings: boundData.collectionMappings,
    outputFileName,
  };
}

/**
 * Get the row count for the collection bound to a table.
 */
export function getTableRowCount(boundData: BoundData, tableId: string): number {
  const collKey = boundData.tableCollectionBindings[tableId];
  return collKey ? (boundData.source.collections[collKey]?.rows.length ?? 0) : 0;
}

/**
 * Total bound records = max rows across all bound collections.
 * Used for the preview navigation badge.
 */
export function maxBoundRows(boundData: BoundData): number {
  return Object.values(boundData.source.collections).reduce(
    (m, c) => Math.max(m, c.rows.length),
    0
  );
}