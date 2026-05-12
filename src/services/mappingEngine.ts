/**
 * Mapping Engine
 * Maps data to template placeholders, handles loops and conditions
 */

import type { LayoutTableElement, TableCell } from '../model/layoutTable';
import { isLayoutTable } from '../model/layoutTable';

export type DataRow = Record<string, any>;

export type CanvasElement =
  | {
      id: string;
      type: 'text';
      content: string;
      position: { x: number; y: number };
      style: any;
      loop?: string;
      condition?: string;
    }
  | {
      id: string;
      type: 'image';
      src: string;
      position: { x: number; y: number };
      style: any;
      loop?: string;
      condition?: string;
    }
  | {
      id: string;
      type: 'line';
      position: { x: number; y: number };
      style: any;
      loop?: string;
      condition?: string;
    }
  | {
      id: string;
      type: 'box';
      shape?: 'box' | 'rectangle' | 'triangle' | 'ellipse';
      position: { x: number; y: number };
      style: any;
      loop?: string;
      condition?: string;
    }
  | {
      id: string;
      type: 'paragraph';
      content: string;
      position: { x: number; y: number };
      style: any;
      loop?: string;
      condition?: string;
    }
  | {
      id: string;
      type: 'radio';
      options: number;
      selected?: string;
      orientation?: 'horizontal' | 'vertical';
      position: { x: number; y: number; relativeOffset?: number };
      loop?: string;
      condition?: string;
    }
  | {
      id: string;
      type: 'checkbox';
      count?: number;
      checkedValues?: string[];
      orientation?: 'horizontal' | 'vertical';
      position: { x: number; y: number; relativeOffset?: number };
      loop?: string;
      condition?: string;
    }
  | {
      id: string;
      type: 'date';
      value?: string;
      time?: string;
      includeTime?: boolean;
      format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD Mon YYYY';
      position: { x: number; y: number };
      style: any;
      loop?: string;
      condition?: string;
    }
  | LayoutTableElement;

/**
 * Resolved display string for a layout table cell (preview / PDF snapshot).
 */
function getCollectionFromKey(root: DataRow, key?: string): any[] | null {
  if (!key) return null;
  const v = getNestedValue(root, key);
  return Array.isArray(v) ? v : null;
}

export function resolveTableCellDisplay(
  cell: TableCell,
  root: DataRow,
  fieldMapping?: Record<string, string>,
  item?: DataRow,
  defaultScope: 'root' | 'item' = 'root'
): string {
  const scope = cell.binding?.scope ?? defaultScope;
  const ctx = scope === 'item' ? (item ?? {}) : root;

  if (cell.binding?.path) {
    const v = getNestedValue(ctx, cell.binding.path);
    if (v !== undefined && v !== null) return String(v);
    if (cell.binding.fallback !== undefined && cell.binding.fallback !== '') {
      return cell.binding.fallback;
    }
  }

  const raw = cell.content?.value ?? '';
  return replacePlaceholders(raw, ctx, fieldMapping);
}

/**
 * Extract all placeholders from a string
 * @param text - Text containing placeholders like {{variable}}
 * @returns Array of placeholder names (without {{}})
 */
export function extractPlaceholders(text: string): string[] {
  const placeholders: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const placeholder = match[1].trim();
    if (placeholder && !placeholders.includes(placeholder)) {
      placeholders.push(placeholder);
    }
  }
  
  return placeholders;
}

/**
 * Replace placeholders in a string with data values
 * @param text - Text with placeholders
 * @param data - Data object with values
 * @param fieldMapping - Optional mapping of placeholder names to data keys
 * @returns Text with placeholders replaced
 */
export function replacePlaceholders(
  text: string,
  data: DataRow,
  fieldMapping?: Record<string, string>
): string {
  let result = text;
  const regex = /\{\{([^}]+)\}\}/g;
  
  result = result.replace(regex, (match, placeholder) => {
    const key = placeholder.trim();
    
    // Use field mapping if provided
    const dataKey = fieldMapping?.[key] || key;
    
    // Get value from data (support nested keys like "client.name")
    const value = getNestedValue(data, dataKey);
    
    // Return value or keep placeholder if not found
    return value !== undefined && value !== null ? String(value) : match;
  });
  
  return result;
}

/**
 * Get nested value from object using dot notation
 * @param obj - Data object
 * @param path - Dot-separated path (e.g., "client.name")
 * @returns Value or undefined
 */
function getNestedValue(obj: any, path: string): any {
  const keys = path.split('.');
  let value = obj;
  
  for (const key of keys) {
    if (value === null || value === undefined) {
      return undefined;
    }
    value = value[key];
  }
  
  return value;
}

/**
 * Auto-map placeholders to data keys
 * Creates mapping based on exact match, case-insensitive match, or fuzzy match
 * @param placeholders - Array of placeholder names
 * @param dataKeys - Array of data object keys
 * @returns Mapping object: { placeholder: dataKey }
 */
export function autoMapFields(
  placeholders: string[],
  dataKeys: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  placeholders.forEach(placeholder => {
    // Try exact match
    if (dataKeys.includes(placeholder)) {
      mapping[placeholder] = placeholder;
      return;
    }
    
    // Try case-insensitive match
    const lowerPlaceholder = placeholder.toLowerCase();
    const exactMatch = dataKeys.find(key => key.toLowerCase() === lowerPlaceholder);
    if (exactMatch) {
      mapping[placeholder] = exactMatch;
      return;
    }
    
    // Try fuzzy match (ignore special characters)
    const normalizedPlaceholder = lowerPlaceholder.replace(/[^a-z0-9]/g, '');
    const fuzzyMatch = dataKeys.find(key => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      return normalizedKey === normalizedPlaceholder;
    });
    
    if (fuzzyMatch) {
      mapping[placeholder] = fuzzyMatch;
    }
  });
  
  return mapping;
}

/**
 * Map template elements with data
 * Replaces all placeholders in template elements with data values
 * @param elements - Template elements array
 * @param data - Data object with values
 * @param fieldMapping - Optional field mapping (auto-generated if not provided)
 * @returns New array of elements with placeholders replaced
 */
export function mapTemplateToData(
  elements: CanvasElement[],
  data: DataRow,
  fieldMapping?: Record<string, string>
): CanvasElement[] {
  // Extract all placeholders from template
  const allPlaceholders = new Set<string>();
  
  elements.forEach(element => {
    if (element.type === 'text' && element.content) {
      extractPlaceholders(element.content).forEach(p => allPlaceholders.add(p));
    }
    if (element.type === 'image' && element.src) {
      extractPlaceholders(element.src).forEach(p => allPlaceholders.add(p));
    }
    if (isLayoutTable(element)) {
      if (element.headerRow) {
        element.headerRow.cells.forEach((cell) => {
          if (cell.mergedInto) return;
          extractPlaceholders(cell.content?.value ?? '').forEach((p) => allPlaceholders.add(p));
        });
      }
      element.rows.forEach((row) => {
        row.cells.forEach((cell) => {
          if (cell.mergedInto) return;
          extractPlaceholders(cell.content?.value ?? '').forEach((p) => allPlaceholders.add(p));
        });
      });
    }
  });
  
  // Auto-generate mapping if not provided
  if (!fieldMapping) {
    const dataKeys = Object.keys(data);
    fieldMapping = autoMapFields(Array.from(allPlaceholders), dataKeys);
  }
  
  // Map each element - PRESERVE ALL PROPERTIES, only replace placeholders in content
  return elements.map(element => {
    const mapped: any = JSON.parse(JSON.stringify(element));

    if (element.type === 'text' && element.content) {
      mapped.content = replacePlaceholders(element.content, data, fieldMapping);
    }

    if (element.type === 'paragraph' && element.content) {
      mapped.content = replacePlaceholders(element.content, data, fieldMapping);
    }

    if (element.type === 'image' && element.src) {
      mapped.src = replacePlaceholders(element.src, data, fieldMapping);
    }

    if (isLayoutTable(element)) {
      // header resolves once, in root scope
      if (element.headerRow) {
        mapped.headerRow = {
          ...element.headerRow,
          id: `${element.headerRow.id}__render`,
          cells: element.headerRow.cells.map((cell) =>
            cell.mergedInto
              ? cell
              : {
                  ...cell,
                  id: `${cell.id}__render`,
                  content: {
                    type: 'text' as const,
                    value: resolveTableCellDisplay(cell, data, fieldMapping, undefined, 'root'),
                  },
                  binding: undefined,
                }
          ),
        };
      }

      const binding = element.binding;
      const collection =
        binding?.enabled && binding.collectionKey ? getCollectionFromKey(data, binding.collectionKey) : null;

      if (collection && collection.length > 0) {
        // iterate: render-time expansion of template rows for each item
        const expandedRows = collection.flatMap((item, itemIndex) =>
          element.rows.map((row, templateRowIndex) => ({
            ...row,
            id: `${row.id}__i${itemIndex}__t${templateRowIndex}`,
            cells: row.cells.map((cell) =>
              cell.mergedInto
                ? cell
                : {
                    ...cell,
                    id: `${cell.id}__i${itemIndex}__t${templateRowIndex}`,
                    content: {
                      type: 'text' as const,
                      value: resolveTableCellDisplay(cell, data, fieldMapping, item, 'item'),
                    },
                    binding: undefined,
                  }
            ),
          }))
        );
        mapped.rows = expandedRows;
      } else {
        // non-iterating table snapshot
        mapped.rows = element.rows.map((row, templateRowIndex) => ({
          ...row,
          id: `${row.id}__render_${templateRowIndex}`,
          cells: row.cells.map((cell) =>
            cell.mergedInto
              ? cell
              : {
                  ...cell,
                  id: `${cell.id}__render_${templateRowIndex}`,
                  content: {
                    type: 'text' as const,
                    value: resolveTableCellDisplay(cell, data, fieldMapping, undefined, 'root'),
                  },
                  binding: undefined,
                }
          ),
        }));
      }
    }

    return mapped as CanvasElement;
  });
}

/**
 * Map template with multiple data rows (for batch processing)
 * @param elements - Template elements
 * @param dataRows - Array of data objects
 * @param fieldMapping - Optional field mapping
 * @returns Array of mapped element arrays (one per data row)
 */
export function mapTemplateToMultipleData(
  elements: CanvasElement[],
  dataRows: DataRow[],
  fieldMapping?: Record<string, string>
): CanvasElement[][] {
  return dataRows.map(data => mapTemplateToData(elements, data, fieldMapping));
}

/**
 * Get all unique placeholders from template
 * @param elements - Template elements
 * @returns Array of unique placeholder names
 */
export function getAllPlaceholders(elements: CanvasElement[]): string[] {
  const placeholders = new Set<string>();
  
  elements.forEach(element => {
    if (element.type === 'text' && element.content) {
      extractPlaceholders(element.content).forEach(p => placeholders.add(p));
    }
    if (element.type === 'image' && element.src) {
      extractPlaceholders(element.src).forEach(p => placeholders.add(p));
    }
    if (isLayoutTable(element)) {
      if (element.headerRow) {
        element.headerRow.cells.forEach((cell) => {
          if (cell.mergedInto) return;
          extractPlaceholders(cell.content?.value ?? '').forEach((p) => placeholders.add(p));
        });
      }
      element.rows.forEach((row) => {
        row.cells.forEach((cell) => {
          if (cell.mergedInto) return;
          extractPlaceholders(cell.content?.value ?? '').forEach((p) => placeholders.add(p));
        });
      });
    }
  });
  
  return Array.from(placeholders);
}

/**
 * Validate that all placeholders have corresponding data
 * @param elements - Template elements
 * @param data - Data object
 * @param fieldMapping - Optional field mapping
 * @returns Object with validation results
 */
export function validateMapping(
  elements: CanvasElement[],
  data: DataRow,
  fieldMapping?: Record<string, string>
): {
  isValid: boolean;
  missingFields: string[];
  mappedFields: string[];
} {
  const placeholders = getAllPlaceholders(elements);
  const dataKeys = Object.keys(data);
  
  // Generate mapping if not provided
  if (!fieldMapping) {
    fieldMapping = autoMapFields(placeholders, dataKeys);
  }
  
  const missingFields: string[] = [];
  const mappedFields: string[] = [];
  
  placeholders.forEach(placeholder => {
    const dataKey = fieldMapping?.[placeholder] || placeholder;
    if (dataKey in data && data[dataKey] !== undefined && data[dataKey] !== null) {
      mappedFields.push(placeholder);
    } else {
      missingFields.push(placeholder);
    }
  });
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    mappedFields,
  };
}
