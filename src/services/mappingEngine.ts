/**
 * mappingEngine.ts
 * Maps BoundData onto canvas elements to produce preview elements.
 *
 * Responsibilities:
 *   - Replace {{placeholder}} tokens in static elements using metadata + fieldMapping
 *   - Expand table rows using the bound collection + collectionMapping
 *   - Leave elements untouched when no data is bound
 */

import type { LayoutTableElement, TableCell } from '../model/layoutTable';
import { isLayoutTable } from '../model/layoutTable';
import type { BoundData, DataRow } from '../types/dataSource';

export type { DataRow };

export type CanvasElement =
  | { id: string; type: 'text'; content: string; position: any; style: any }
  | { id: string; type: 'image'; src: string; position: any; style: any }
  | { id: string; type: 'line'; position: any; style: any }
  | { id: string; type: 'box'; shape?: string; position: any; style: any }
  | { id: string; type: 'paragraph'; content: string; position: any; style: any }
  | { id: string; type: 'radio'; options: number; selected?: string; orientation?: string; position: any }
  | { id: string; type: 'checkbox'; count?: number; checkedValues?: string[]; orientation?: string; position: any }
  | { id: string; type: 'date'; value?: string; time?: string; includeTime?: boolean; format?: string; position: any; style: any }
  | LayoutTableElement;

// ── Placeholder utilities ─────────────────────────────────────────────────────

export function extractPlaceholders(text: string): string[] {
  const out: string[] = [];
  const re = /\{\{([^}]+)\}\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const p = m[1].trim();
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export function replacePlaceholders(
  text: string,
  data: DataRow,
  fieldMapping: Record<string, string> = {}
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, raw) => {
    const key = raw.trim();
    const dataKey = fieldMapping[key] || key;
    const v = getNestedValue(data, dataKey);
    return v !== undefined && v !== null ? String(v) : match;
  });
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

// ── Collection of all placeholders from the template ────────────────────────

export function getAllPlaceholders(elements: CanvasElement[]): string[] {
  const set = new Set<string>();
  for (const el of elements) {
    if (el.type === 'text' || el.type === 'paragraph') {
      extractPlaceholders((el as any).content || '').forEach(p => set.add(p));
    }
    if (el.type === 'image') {
      extractPlaceholders((el as any).src || '').forEach(p => set.add(p));
    }
    if (isLayoutTable(el)) {
      const t = el as LayoutTableElement;
      t.headerRow?.cells.forEach(c => {
        if (!c.mergedInto) extractPlaceholders(c.content?.value ?? '').forEach(p => set.add(p));
      });
      t.rows.forEach(row =>
        row.cells.forEach(c => {
          if (!c.mergedInto) extractPlaceholders(c.content?.value ?? '').forEach(p => set.add(p));
        })
      );
    }
  }
  return Array.from(set);
}

/** Placeholders from non-table elements only. */
export function getStaticPlaceholders(elements: CanvasElement[]): string[] {
  const set = new Set<string>();
  for (const el of elements) {
    if (el.type === 'text' || el.type === 'paragraph') {
      extractPlaceholders((el as any).content || '').forEach(p => set.add(p));
    }
    if (el.type === 'image') {
      extractPlaceholders((el as any).src || '').forEach(p => set.add(p));
    }
  }
  return Array.from(set);
}

/** Per-table placeholder info for the upload UI. */
export function getTableInfos(elements: CanvasElement[]) {
  return elements
    .filter(el => isLayoutTable(el))
    .map((el, idx) => {
      const t = el as LayoutTableElement;
      const set = new Set<string>();
      t.rows.forEach(row =>
        row.cells.forEach(c => {
          if (!c.mergedInto) extractPlaceholders(c.content?.value ?? '').forEach(p => set.add(p));
        })
      );
      return {
        id: t.id,
        label: `Table ${idx + 1}`,
        placeholders: Array.from(set),
        currentCollectionKey: t.binding?.collectionKey || '',
      };
    });
}

// ── Cell resolution ───────────────────────────────────────────────────────────

function resolveCell(cell: TableCell, row: DataRow, colMapping: Record<string, string>): string {
  if (cell.binding?.path) {
    const colName = colMapping[cell.binding.path] || cell.binding.path;
    const v = getNestedValue(row, colName);
    if (v !== undefined && v !== null) return String(v);
    if (cell.binding.fallback != null) return String(cell.binding.fallback);
    return '';
  }
  return replacePlaceholders(cell.content?.value ?? '', row, colMapping);
}

// ── Preview element mapping ───────────────────────────────────────────────────

/**
 * Produce a snapshot of elements for the canvas preview:
 *   - Static elements: single row (uses metadata + fieldMapping)
 *   - Tables: show only previewRowIndex so the canvas isn't overwhelming
 */
export function mapTemplateForPreview(
  elements: CanvasElement[],
  boundData: BoundData,
  previewRowIndex: number
): CanvasElement[] {
  const { source, fieldMapping, tableCollectionBindings, collectionMappings } = boundData;

  return elements.map(el => {
    const mapped: any = JSON.parse(JSON.stringify(el));

    if (el.type === 'text' || el.type === 'paragraph') {
      mapped.content = replacePlaceholders(
        (el as any).content || '',
        source.metadata,
        fieldMapping
      );
    }
    if (el.type === 'image') {
      mapped.src = replacePlaceholders((el as any).src || '', source.metadata, fieldMapping);
    }

    if (isLayoutTable(el)) {
      const t = el as LayoutTableElement;
      const collKey = tableCollectionBindings[t.id] || Object.keys(source.collections)[0] || '';
      const col = source.collections[collKey];
      if (!col || col.rows.length === 0) return mapped;

      const colMapping = collectionMappings[collKey] || {};
      const previewRow = col.rows[Math.min(previewRowIndex, col.rows.length - 1)];

      // Resolve header once
      if (mapped.headerRow?.cells) {
        mapped.headerRow.cells = mapped.headerRow.cells.map((cell: TableCell) =>
          cell.mergedInto ? cell : {
            ...cell,
            content: { type: 'text', value: replacePlaceholders(cell.content?.value ?? '', source.metadata, fieldMapping) },
            binding: undefined,
          }
        );
      }

      // Show only the preview row (single expanded row per template row)
      mapped.rows = t.rows.map((tRow, ti) => ({
        ...tRow,
        id: `${tRow.id}__preview${ti}`,
        cells: tRow.cells.map((cell: TableCell) =>
          cell.mergedInto ? cell : {
            ...cell,
            id: `${cell.id}__preview${ti}`,
            content: { type: 'text', value: resolveCell(cell, previewRow, colMapping) },
            binding: undefined,
          }
        ),
      }));
    }

    return mapped as CanvasElement;
  });
}

// ── Legacy compat ─────────────────────────────────────────────────────────────

/**
 * @deprecated Use mapTemplateForPreview with BoundData instead.
 * Kept for any callers that haven't been migrated yet.
 */
export function mapTemplateToData(
  elements: CanvasElement[],
  data: DataRow,
  fieldMapping?: Record<string, string>
): CanvasElement[] {
  const fakeBound: BoundData = {
    source: { metadata: data, collections: {} },
    fieldMapping: fieldMapping || {},
    tableCollectionBindings: {},
    collectionMappings: {},
  };
  return mapTemplateForPreview(elements, fakeBound, 0);
}

/** @deprecated Use autoMapStaticFields from dataSourceService instead. */
export function autoMapFields(
  placeholders: string[],
  dataKeys: string[]
): Record<string, string> {
  const result: Record<string, string> = {};
  placeholders.forEach(p => {
    const lp = p.toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = dataKeys.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === lp);
    if (match) result[p] = match;
  });
  return result;
}

/** @deprecated Use mapTemplateForPreview instead. */
export function mapTemplateToMultipleData(
  elements: CanvasElement[],
  dataRows: DataRow[],
  fieldMapping?: Record<string, string>
): CanvasElement[][] {
  return dataRows.map(data => mapTemplateToData(elements, data, fieldMapping));
}

/**
 * Placeholder groups split by scope (static vs table-bound).
 * @deprecated Use getStaticPlaceholders + getTableInfos instead.
 */
export interface PlaceholderGroups {
  static: string[];
  tables: Record<string, string[]>; // tableId → placeholders
}

/** @deprecated Use getStaticPlaceholders + getTableInfos instead. */
export function getPlaceholdersByScope(elements: CanvasElement[]): PlaceholderGroups {
  const staticSet = new Set<string>();
  const tables: Record<string, string[]> = {};

  for (const el of elements) {
    if (el.type === 'text' || el.type === 'paragraph') {
      extractPlaceholders((el as any).content || '').forEach(p => staticSet.add(p));
    }
    if (el.type === 'image') {
      extractPlaceholders((el as any).src || '').forEach(p => staticSet.add(p));
    }
    if (isLayoutTable(el)) {
      const t = el as LayoutTableElement;
      const tSet = new Set<string>();
      t.rows.forEach(row =>
        row.cells.forEach(c => {
          if (!c.mergedInto) extractPlaceholders(c.content?.value ?? '').forEach(p => tSet.add(p));
        })
      );
      tables[t.id] = Array.from(tSet);
    }
  }

  return { static: Array.from(staticSet), tables };
}

/** @deprecated Validate that all placeholders resolve against the provided data. */
export function validateMapping(
  elements: CanvasElement[],
  data: DataRow,
  fieldMapping?: Record<string, string>
): { isValid: boolean; missingFields: string[]; mappedFields: string[] } {
  const placeholders = getAllPlaceholders(elements);
  const fm = fieldMapping || autoMapFields(placeholders, Object.keys(data));
  const missingFields: string[] = [];
  const mappedFields: string[] = [];

  placeholders.forEach(p => {
    const dataKey = fm[p] || p;
    if (dataKey in data && data[dataKey] !== undefined && data[dataKey] !== null) {
      mappedFields.push(p);
    } else {
      missingFields.push(p);
    }
  });

  return { isValid: missingFields.length === 0, missingFields, mappedFields };
}