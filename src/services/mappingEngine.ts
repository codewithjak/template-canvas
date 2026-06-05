/**
 * src/services/mappingEngine.ts
 *
 * Single source of truth for placeholder resolution on the frontend.
 * Mirrors backend/utils/resolver.js exactly — same logic, same behaviour.
 * What you see in the canvas preview is what goes into the PDF.
 *
 * Exports
 * ───────
 *   resolve()                key lookup against a flat/nested object
 *   replacePlaceholders()    replaces {{tokens}} in a string
 *   resolveCellValue()       resolves one table cell from a collection row
 *   resolveElement()         resolves one template element against the IR
 *   resolveAllElements()     resolves an entire array of elements
 *   validateBindings()       pre-flight check before PDF generation
 *
 *   getStaticPlaceholders()  extract {{tokens}} from non-table elements
 *   getTableInfos()          per-table placeholder info for the upload UI
 *   mapTemplateForPreview()  single-row preview for the canvas
 */

import type { LayoutTableElement, TableCell } from '../model/layoutTable';
import { isLayoutTable } from '../model/layoutTable';
import type {
  CanonicalDocument,
  BindingValidationResult,
  Collection,
  FieldMapping,
  CollectionMappings,
  TableCollectionBindings,
  TableInfo,
  DataRow,
} from '../types/dataSource';

// ─────────────────────────────────────────────────────────────────────────────
// Core resolver  (mirrors resolver.js step 1 + step 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a dot-notation key against a flat-or-nested record.
 *
 * Step 1: literal key lookup  — "company.name" stored as a flat key → found immediately
 * Step 2: dot traversal       — for genuinely nested objects
 * Step 3: return undefined
 */
export function resolve(
  obj: Record<string, unknown> | null | undefined,
  path: string,
): string | undefined {
  if (obj == null || !path) return undefined;

  // Step 1: flat key (the common case for IR fields)
  if (Object.prototype.hasOwnProperty.call(obj, path)) {
    const v = obj[path];
    return v != null ? String(v) : '';
  }

  // Step 2: dot traversal for genuinely nested objects
  let current: unknown = obj;
  for (const part of path.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current != null ? String(current) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder replacement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace all {{key}} tokens in a string with values from ir.fields.
 * Missing keys → empty string. Never throws.
 *
 * Resolution order:
 *   1. fieldMapping[key] → aliased key → resolve(fields, aliasedKey)
 *   2. resolve(fields, key)
 *   3. '' (never undefined in output)
 */
export function replacePlaceholders(
  text: string,
  fields: Record<string, string>,
  fieldMapping: FieldMapping = {},
): string {
  if (typeof text !== 'string') return String(text ?? '');
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw: string) => {
    const key       = raw.trim();
    const mappedKey = fieldMapping[key] ?? key;
    return resolve(fields as Record<string, unknown>, mappedKey) ?? '';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell value resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a table cell's value from a collection row.
 *
 *   a) cell.binding.path → direct row lookup (explicit binding — preferred)
 *   b) cell.content      → {{column_name}} placeholder string (legacy / shorthand)
 */
export function resolveCellValue(
  cell:   { binding?: { path?: string; fallback?: string }; content?: { value?: string } | string },
  row:    DataRow,
  colMap: Record<string, string> = {},
): string {
  if (cell.binding?.path) {
    const mappedKey = colMap[cell.binding.path] ?? cell.binding.path;
    const v         = resolve(row as Record<string, unknown>, mappedKey);
    if (v != null) return v;
    return cell.binding.fallback != null ? String(cell.binding.fallback) : '';
  }

  const rawContent = typeof cell.content === 'string'
    ? cell.content
    : (cell.content as { value?: string })?.value ?? '';

  return replacePlaceholders(rawContent, row, colMap);
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder extraction helpers
// ─────────────────────────────────────────────────────────────────────────────

export function extractPlaceholders(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** {{tokens}} from non-table elements only (for static field mapping UI). */
export function getStaticPlaceholders(elements: unknown[]): string[] {
  const set = new Set<string>();
  for (const el of elements as Array<Record<string, unknown>>) {
    if (el.type === 'text' || el.type === 'paragraph') {
      extractPlaceholders(String(el.content ?? '')).forEach(p => set.add(p));
    }
    if (el.type === 'image') {
      extractPlaceholders(String(el.src ?? '')).forEach(p => set.add(p));
    }
    if (el.type === 'date') {
      extractPlaceholders(String(el.value ?? '')).forEach(p => set.add(p));
    }
    if (el.type === 'barcode') {
      extractPlaceholders(String(el.content ?? '')).forEach(p => set.add(p));
    }
  }
  return Array.from(set);
}

/** Per-table placeholder info for the upload mapping UI. */
export function getTableInfos(elements: unknown[]): TableInfo[] {
  return (elements as Array<Record<string, unknown>>)
    .filter(el => isLayoutTable(el))
    .map((el, idx) => {
      const t  = el as unknown as LayoutTableElement;
      const set = new Set<string>();
      t.rows.forEach(row =>
        row.cells.forEach(c => {
          if (!c.mergedInto) {
            const raw = typeof c.content === 'string'
              ? c.content
              : (c.content as { value?: string })?.value ?? '';
            extractPlaceholders(raw).forEach(p => set.add(p));
          }
        })
      );
      return {
        id:                   t.id,
        label:                `Table ${idx + 1}`,
        placeholders:         Array.from(set),
        currentCollectionKey: t.binding?.collectionKey ?? '',
      };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-mapping helpers  (used by UploadData to seed initial mappings)
// ─────────────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = [...setA].filter(c => setB.has(c)).length;
  return intersection / Math.max(setA.size, setB.size);
}

function bestMatch(placeholder: string, candidates: string[], threshold = 0.6): string {
  const normP = normalize(placeholder);
  let bestKey   = '';
  let bestScore = threshold - 0.001;
  for (const c of candidates) {
    const score = similarity(normP, normalize(c));
    if (score > bestScore) { bestScore = score; bestKey = c; }
  }
  return bestKey;
}

/** Auto-map static placeholders → ir.fields keys. */
export function autoMapStaticFields(
  placeholders: string[],
  fieldKeys:    string[],
): FieldMapping {
  const mapping: FieldMapping = {};
  for (const p of placeholders) {
    mapping[p] = bestMatch(p, fieldKeys) || '';
  }
  return mapping;
}

/** Auto-map table cell placeholders → collection column names. */
export function autoMapCollectionFields(
  placeholders: string[],
  columnNames:  string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const p of placeholders) {
    mapping[p] = bestMatch(p, columnNames, 0.5) || '';
  }
  return mapping;
}

/**
 * Build initial mapping state when a file is first uploaded.
 * Returns the three mapping objects the canvas and UploadData need.
 */
export function buildInitialMappings(
  ir:     CanonicalDocument,
  staticPlaceholders: string[],
  tables: TableInfo[],
): {
  fieldMapping:            FieldMapping;
  tableCollectionBindings: TableCollectionBindings;
  collectionMappings:      CollectionMappings;
} {
  const fieldKeys       = Object.keys(ir.fields);
  const collectionKeys  = Object.keys(ir.collections);
  const fieldMapping    = autoMapStaticFields(staticPlaceholders, fieldKeys);

  const tableCollectionBindings: TableCollectionBindings = {};
  const collectionMappings:      CollectionMappings      = {};

  tables.forEach((table, idx) => {
    const preferred =
      table.currentCollectionKey && ir.collections[table.currentCollectionKey]
        ? table.currentCollectionKey
        : collectionKeys[idx] ?? collectionKeys[0] ?? '';

    tableCollectionBindings[table.id] = preferred;

    if (preferred && ir.collections[preferred] && !collectionMappings[preferred]) {
      collectionMappings[preferred] = autoMapCollectionFields(
        table.placeholders,
        ir.collections[preferred].columns,
      );
    }
  });

  return { fieldMapping, tableCollectionBindings, collectionMappings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas preview  (single-row preview — keeps the canvas fast)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve all elements for the canvas preview.
 * Tables show only the row at `previewRowIndex` so the canvas isn't overwhelming.
 * Static elements have their {{tokens}} replaced from ir.fields.
 */
export function mapTemplateForPreview(
  elements:                unknown[],
  ir:                      CanonicalDocument,
  fieldMapping:            FieldMapping,
  tableCollectionBindings: TableCollectionBindings,
  collectionMappings:      CollectionMappings,
  previewRowIndex:         number,
): unknown[] {
  return (elements as Array<Record<string, unknown>>).map(el => {
    const mapped: Record<string, unknown> = JSON.parse(JSON.stringify(el));

    if (el.type === 'text' || el.type === 'paragraph') {
      mapped.content = replacePlaceholders(
        String(el.content ?? ''), ir.fields, fieldMapping,
      );
    }

    if (el.type === 'image') {
      mapped.src = replacePlaceholders(String(el.src ?? ''), ir.fields, fieldMapping);
    }

    if (el.type === 'date') {
      mapped.value = replacePlaceholders(String(el.value ?? ''), ir.fields, fieldMapping);
    }

    if (isLayoutTable(el as unknown as LayoutTableElement)) {
      const t       = el as unknown as LayoutTableElement;
      const collKey = tableCollectionBindings[t.id] ?? Object.keys(ir.collections)[0] ?? '';
      const col     = ir.collections[collKey] as Collection | undefined;

      if (!col || col.rows.length === 0) return mapped;

      const colMap     = collectionMappings[collKey] ?? {};
      const previewRow = col.rows[Math.min(previewRowIndex, col.rows.length - 1)];

      // Resolve header cells against ir.fields (static labels)
      if (mapped.headerRow && (mapped.headerRow as Record<string, unknown>).cells) {
        const hRow = mapped.headerRow as { cells: TableCell[] };
        hRow.cells = hRow.cells.map((cell: TableCell) =>
          cell.mergedInto ? cell : {
            ...cell,
            content: {
              type:  'text',
              value: replacePlaceholders(
                cell.content?.value ?? '', ir.fields, fieldMapping,
              ),
            },
            binding: undefined,
          }
        );
      }

      // Show only the single preview row per template row
      const tRows = t.rows as typeof t.rows;
      (mapped as Record<string, unknown>).rows = tRows.map((tRow, ti) => ({
        ...tRow,
        id:    `${tRow.id}__preview${ti}`,
        cells: tRow.cells.map((cell: TableCell) =>
          cell.mergedInto ? cell : {
            ...cell,
            id:      `${cell.id}__preview${ti}`,
            content: { type: 'text', value: resolveCellValue(cell, previewRow, colMap) },
            binding: undefined,
          }
        ),
      }));
    }

    return mapped;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Full element resolution  (used by the export path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve all placeholders in one template element against the IR.
 * Returns a new element — never mutates the input.
 * Tables expand all collection rows (not just the preview row).
 */
export function resolveElement(
  el:                      unknown,
  ir:                      CanonicalDocument,
  fieldMapping:            FieldMapping            = {},
  tableCollectionBindings: TableCollectionBindings = {},
  collectionMappings:      CollectionMappings      = {},
): unknown {
  const element = el as Record<string, unknown>;

  if (isLayoutTable(element as unknown as LayoutTableElement)) {
    const t       = element as unknown as LayoutTableElement;
    const collKey = (
      tableCollectionBindings[t.id] ??
      t.binding?.collectionKey ??
      Object.keys(ir.collections)[0] ??
      ''
    ).trim().toLowerCase();

    const col    = ir.collections[collKey] as Collection | undefined;
    const rows   = col?.rows ?? [];
    const colMap = collectionMappings[collKey] ?? {};

    const expandedRows = rows.flatMap((row, ri) =>
      t.rows.map((tRow, ti) => ({
        ...tRow,
        id:    `${tRow.id}__r${ri}t${ti}`,
        cells: tRow.cells.map((cell: TableCell) =>
          cell.mergedInto ? cell : {
            ...cell,
            id:      `${cell.id}__r${ri}t${ti}`,
            content: { type: 'text', value: resolveCellValue(cell, row, colMap) },
            binding: undefined,
          }
        ),
      }))
    );

    const resolvedHeader = t.headerRow
      ? {
          ...t.headerRow,
          cells: t.headerRow.cells.map((cell: TableCell) =>
            cell.mergedInto ? cell : {
              ...cell,
              content: {
                type:  'text',
                value: replacePlaceholders(cell.content?.value ?? '', ir.fields, fieldMapping),
              },
              binding: undefined,
            }
          ),
        }
      : undefined;

    return { ...t, headerRow: resolvedHeader, rows: expandedRows };
  }

  // Static element
  const out = { ...element };
  if (typeof element.content === 'string') {
    out.content = replacePlaceholders(element.content, ir.fields, fieldMapping);
  }
  if (typeof element.src === 'string') {
    out.src = replacePlaceholders(element.src, ir.fields, fieldMapping);
  }
  if (typeof element.value === 'string') {
    out.value = replacePlaceholders(element.value, ir.fields, fieldMapping);
  }
  return out;
}

/** Resolve an entire array of elements. */
export function resolveAllElements(
  elements:                unknown[],
  ir:                      CanonicalDocument,
  fieldMapping:            FieldMapping            = {},
  tableCollectionBindings: TableCollectionBindings = {},
  collectionMappings:      CollectionMappings      = {},
): unknown[] {
  return elements.map(el =>
    resolveElement(el, ir, fieldMapping, tableCollectionBindings, collectionMappings)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Binding validation  (call before generateDocument)
// ─────────────────────────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /\{\{([^}]+)\}\}/g;

/**
 * Check all {{placeholder}} tokens and table collection keys against the IR.
 * Surface missing bindings as explicit errors instead of silent blanks in the PDF.
 */
export function validateBindings(
  elements:     unknown[],
  ir:           CanonicalDocument,
  fieldMapping: FieldMapping = {},
): BindingValidationResult {
  const missingFields:      BindingValidationResult['missingFields']      = [];
  const missingCollections: BindingValidationResult['missingCollections'] = [];

  for (const el of elements as Array<Record<string, unknown>>) {
    const textContent =
      (typeof el.content === 'string' ? el.content : '') +
      (typeof el.src     === 'string' ? el.src     : '') +
      (typeof el.value   === 'string' ? el.value   : '');

    PLACEHOLDER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PLACEHOLDER_RE.exec(textContent)) !== null) {
      const key       = match[1].trim();
      const mappedKey = fieldMapping[key] ?? key;
      if (resolve(ir.fields as Record<string, unknown>, mappedKey) == null) {
        missingFields.push({ placeholder: key, resolvedKey: mappedKey });
      }
    }

    if (isLayoutTable(el as unknown as LayoutTableElement)) {
      const t       = el as unknown as LayoutTableElement;
      const collKey = (t.binding?.collectionKey ?? '').trim().toLowerCase();
      if (collKey && !(collKey in ir.collections)) {
        missingCollections.push({ elementId: t.id, collectionKey: collKey });
      }
    }
  }

  return {
    valid: missingFields.length === 0 && missingCollections.length === 0,
    missingFields,
    missingCollections,
  };
}