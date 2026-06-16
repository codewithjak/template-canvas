/**
 * templateCanvasHelpers.ts
 *
 * Small, self-contained helper functions used by TemplateCanvas. None of them
 * touch React state — you give them values and they hand a value back — so
 * they are easy to read and test on their own.
 */

import type { CanvasElement, CanvasPage, TextElementType } from '../../types/canvas';
import type { CanonicalDocument, FieldMapping } from '../../types/dataSource';
import type { PageRulerSelection } from './PageRulers';
import { isLayoutTable } from '../../model/layoutTable';

/**
 * Turn a colour into an "rgba(...)" string with the given opacity (0–1).
 * Understands "#rrggbb", "rgb(...)" and "rgba(...)" inputs.
 */
export function adjustColorOpacity(color: string, opacity: number): string {
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\s*\)/, `${opacity})`);
  if (color.startsWith('rgb')) {
    const m = color.match(/\d+/g);
    if (m && m.length >= 3) return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${opacity})`;
  }
  return color;
}

/** Find which page an element lives on. Returns the page id, or null. */
export function findPageOfElement(pages: CanvasPage[], elementId: string): string | null {
  for (const p of pages) {
    if (p.elements.some((e) => e.id === elementId)) return p.pageId;
  }
  return null;
}

/**
 * Return a new pages array where one page's elements have been run through
 * `updater`. Every other page is left exactly as it was.
 */
export function updatePageElements(
  pages: CanvasPage[],
  pageId: string,
  updater: (els: CanvasElement[]) => CanvasElement[],
): CanvasPage[] {
  return pages.map((p) =>
    p.pageId === pageId ? { ...p, elements: updater(p.elements) } : p
  );
}

/** The text a page-number element shows on the canvas, e.g. "Page 1 of N". */
export function pageNumberPreviewLabel(el: TextElementType): string {
  const pn = el.pageNumber!;
  const start = pn.startFrom ?? 1;
  const format = pn.format ?? 'Page X of Y';
  if (format === 'Page X of Y') return `Page ${start} of N`;
  if (format === 'X / Y') return `${start} / N`;
  return String(start);
}

/**
 * Work out the box (x, y, width, height) the rulers should highlight for the
 * selected element. Different element kinds measure their size differently.
 */
export function getElementRulerSelection(element: CanvasElement | null): PageRulerSelection | null {
  if (!element) return null;
  const selection: PageRulerSelection = { x: element.position.x, y: element.position.y };
  if (element.type === 'image' || element.type === 'box') {
    selection.width = element.style.width;
    selection.height = element.style.height;
  } else if (element.type === 'text' && element.style.width) {
    selection.width = element.style.width;
    selection.height = element.style.fontSize * 1.3;
  } else if (element.type === 'barcode' || element.type === 'chart') {
    selection.width = element.style.width;
    selection.height = element.style.height;
  } else if (element.type === 'line') {
    selection.width = element.style.direction === 'horizontal' ? element.style.length : element.style.thickness;
    selection.height = element.style.direction === 'vertical' ? element.style.length : element.style.thickness;
  } else if (isLayoutTable(element)) {
    selection.width = element.size?.width ?? element.columns.reduce((s, c) => c.hidden ? s : s + c.width, 0);
    selection.height = element.size?.height ?? (
      (element.headerRow ? 32 : 0) +
      element.rows.reduce((s, r) => s + (r.height ?? 32), 0)
    );
  }
  return selection;
}

/** The largest number of rows among all the data collections. */
export function maxCollectionRows(ir: CanonicalDocument | null): number {
  if (!ir) return 0;
  return Object.values(ir.collections).reduce((m, c) => Math.max(m, c.rows.length), 0);
}

/** Drop any field mappings whose value is blank. */
export function removeEmptyMappings(mapping: FieldMapping): FieldMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, value]) => value.trim() !== '')
  );
}
