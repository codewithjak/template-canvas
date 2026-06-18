/**
 * pdfImport/structure.ts  —  Phase 4 (trivial pass-through)
 *
 * Maps normalized blocks to CanvasElements 1:1. NO LLM, NO grouping beyond what
 * Phase 2 already did. This is the deterministic floor that proves the geometry
 * round-trips before the LLM structurer (real classification, table detection,
 * zone inference) is added on top. Geometry comes straight from the block —
 * the structurer never authors coordinates. (arch doc Phase 4)
 */

import type { CanvasElement } from '../../types/canvas';
import { newStableId, type LayoutTableElement, type TableRow } from '../../model/layoutTable';
import type {
  Block, TextBlock, LineBlock, RectBlock, ImageBlock, NormalizedPage,
  PageStructurePlan, StructureTable, Rect,
} from './types';

const r = Math.round;

function textElement(b: TextBlock): CanvasElement {
  return {
    id: b.id,
    type: 'text',
    content: b.text,
    position: { x: r(b.rect.x), y: r(b.rect.y) },
    style: {
      fontSize: r(b.fontSizePx),
      fontWeight: b.fontWeight,
      color: b.color,
      fontFamily: b.fontFamily,
      width: r(b.rect.width),
      ...(b.rotation ? { rotation: b.rotation } : {}),
    },
  };
}

function lineElement(b: LineBlock): CanvasElement {
  return {
    id: b.id,
    type: 'line',
    position: { x: r(b.rect.x), y: r(b.rect.y) },
    style: {
      length: r(b.direction === 'horizontal' ? b.rect.width : b.rect.height),
      thickness: Math.max(1, r(b.thicknessPx)),
      direction: b.direction,
      color: b.color,
      style: 'solid',
    },
  };
}

function boxElement(b: RectBlock): CanvasElement {
  return {
    id: b.id,
    type: 'box',
    position: { x: r(b.rect.x), y: r(b.rect.y) },
    style: {
      width: r(b.rect.width),
      height: r(b.rect.height),
      borderWidth: Math.max(0, r(b.borderWidthPx)),
      borderColor: b.borderColor,
      borderStyle: 'solid',
      backgroundColor: b.backgroundColor,
    },
  };
}

function imageElement(b: ImageBlock): CanvasElement {
  return {
    id: b.id,
    type: 'image',
    src: b.dataUrl,
    position: { x: r(b.rect.x), y: r(b.rect.y) },
    style: { width: r(b.rect.width), height: r(b.rect.height), objectFit: 'contain' },
  };
}

function blockToElement(b: Block): CanvasElement {
  switch (b.kind) {
    case 'text':
    case 'paragraph': return textElement(b);
    case 'line':      return lineElement(b);
    case 'rect':      return boxElement(b);
    case 'image':     return imageElement(b);
  }
}

/** Structure one page's blocks into CanvasElements (pass-through, all mapped). */
export function structurePage(page: NormalizedPage): CanvasElement[] {
  return page.blocks.map(blockToElement);
}

// ── Phase 4: materialize an LLM structure plan against the blocks ───────────────

/** Header/footer overrides derived from the plan's zone block ids. */
export interface ZoneOverrides {
  headerBoundaryY?: number;
  footerBoundaryY?: number;
}

export interface MaterializedPage {
  elements: CanvasElement[];
  zones: ZoneOverrides;
}

function unionRect(rects: Rect[]): Rect {
  const minX = Math.min(...rects.map(r => r.x));
  const minY = Math.min(...rects.map(r => r.y));
  const maxX = Math.max(...rects.map(r => r.x + r.width));
  const maxY = Math.max(...rects.map(r => r.y + r.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Build one merged text/paragraph element from grouped text blocks. `override`
 * (the plan's tokenized content) wins in template mode; otherwise the literal
 * block text is used (document mode / fallback).
 */
function mergedTextElement(blocks: TextBlock[], type: 'text' | 'paragraph', role: string, override?: string): CanvasElement {
  const ordered = [...blocks].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
  const head = ordered[0];
  const rect = unionRect(ordered.map(b => b.rect));
  const content = override && override.trim() ? override : ordered.map(b => b.text).join(type === 'paragraph' ? '\n' : ' ');

  if (type === 'paragraph') {
    return {
      id: head.id, type: 'paragraph', content,
      position: { x: r(rect.x), y: r(rect.y) },
      style: { fontSize: r(head.fontSizePx), fontWeight: head.fontWeight, color: head.color, fontFamily: head.fontFamily },
    };
  }
  return {
    id: head.id, type: 'text', content,
    ...(role === 'watermark' ? { role: 'watermark' as const } : {}),
    position: { x: r(rect.x), y: r(rect.y) },
    style: {
      fontSize: r(head.fontSizePx), fontWeight: head.fontWeight, color: head.color,
      fontFamily: head.fontFamily, width: r(rect.width),
      ...(head.rotation ? { rotation: head.rotation } : {}),
    },
  };
}

/**
 * Build a LayoutTableElement from a plan table; geometry from the cell blocks.
 * Always reusable: header labels + ONE tokenized row ({{columnToken}}) + a
 * TableBinding (fillable only once a data source is linked).
 */
function materializeTable(
  table: StructureTable,
  byId: Map<string, Block>,
): { element: LayoutTableElement; consumed: string[] } | null {
  const headerIds = table.headerBlockIds ?? [];
  const rowIds = table.rows ?? [];
  const numCols = Math.max(headerIds.length, ...rowIds.map(r => r.length), 0);
  if (numCols < 1) return null;

  const textBlock = (id: string | undefined): TextBlock | undefined => {
    const b = id ? byId.get(id) : undefined;
    return b && (b.kind === 'text' || b.kind === 'paragraph') ? b : undefined;
  };

  const consumed: string[] = [];
  const all: TextBlock[] = [];
  const colLeft: (number | undefined)[] = Array(numCols).fill(undefined);
  const note = (id: string | undefined, c: number) => {
    const b = textBlock(id);
    if (!b) return;
    all.push(b);
    consumed.push(b.id);
    if (colLeft[c] === undefined || b.rect.x < colLeft[c]!) colLeft[c] = b.rect.x;
  };
  headerIds.forEach((id, c) => note(id, c));
  rowIds.forEach(row => row.forEach((id, c) => note(id, c)));
  if (all.length === 0) return null;

  const left = Math.min(...all.map(b => b.rect.x));
  const top = Math.min(...all.map(b => b.rect.y));
  const right = Math.max(...all.map(b => b.rect.x + b.rect.width));
  const bottom = Math.max(...all.map(b => b.rect.y + b.rect.height));

  // Column widths from the left edge of each column; even split if any unknown.
  let widths: number[];
  if (colLeft.every(v => v !== undefined)) {
    const lefts = colLeft as number[];
    widths = lefts.map((l, c) => Math.max(10, r((c < numCols - 1 ? lefts[c + 1] : right) - l)));
  } else {
    widths = Array(numCols).fill(Math.max(10, r((right - left) / numCols)));
  }

  const rep = textBlock(headerIds[0]) ?? all[0];
  const columns = widths.map(w => ({ id: newStableId(), width: w, widthMode: 'fixed' as const, alignment: 'left' as const }));
  // A row whose cells take literal block text (used for header labels, and for
  // document-mode body rows).
  const literalRow = (ids: string[]): TableRow => ({
    id: newStableId(),
    cells: Array.from({ length: numCols }, (_, c) => {
      const b = textBlock(ids[c]);
      return { id: newStableId(), content: { type: 'text' as const, value: b ? b.text : '' } };
    }),
  });

  const headerRow = headerIds.length ? literalRow(headerIds) : undefined;

  // One tokenized row + a binding — repeats per data row once a source is linked.
  const rows: TableRow[] = [{
    id: newStableId(),
    cells: Array.from({ length: numCols }, (_, c) => ({
      id: newStableId(),
      content: { type: 'text' as const, value: `{{${table.columnTokens?.[c] || `col_${c + 1}`}}}` },
    })),
  }];
  const binding = { enabled: true, collectionKey: table.collectionKey || 'rows', itemAlias: 'item' };

  const element: LayoutTableElement = {
    id: newStableId(),
    type: 'table',
    schemaVersion: 2,
    position: { x: r(left), y: r(top) },
    size: { width: r(right - left), height: r(bottom - top) },
    columns,
    headerRow,
    rows,
    binding,
    style: {
      fontSize: r(rep.fontSizePx), fontWeight: rep.fontWeight, color: rep.color,
      fontFamily: rep.fontFamily, borderColor: '#e2e8f0', borderWidth: 1, showBorders: true,
    },
  };
  return { element, consumed };
}

/**
 * Materialize a plan against a page's blocks. Geometry comes ENTIRELY from the
 * blocks (looked up by id) — the plan only decides grouping/tables/role/zones.
 * Unknown ids in the plan are ignored; any text block the plan failed to mention
 * still passes through, so nothing is lost. (arch doc §4, §2.3)
 */
export function materializePage(page: NormalizedPage, plan: PageStructurePlan): MaterializedPage {
  const byId = new Map<string, Block>(page.blocks.map(b => [b.id, b]));
  const consumed = new Set<string>();
  const elements: CanvasElement[] = [];

  // Tables first — they consume their cell blocks before grouping/pass-through.
  for (const table of plan.tables ?? []) {
    const built = materializeTable(table, byId);
    if (!built) continue;
    built.consumed.forEach(id => consumed.add(id));
    elements.push(built.element);
  }

  for (const group of plan.groups ?? []) {
    const textBlocks = (group.blockIds ?? [])
      .map(id => byId.get(id))
      .filter((b): b is TextBlock => !!b && (b.kind === 'text' || b.kind === 'paragraph') && !consumed.has(b.id));
    if (textBlocks.length === 0) continue;
    textBlocks.forEach(b => consumed.add(b.id));
    // Use the plan's tokenized content (values → {{tokens}}, labels kept).
    elements.push(mergedTextElement(textBlocks, group.type, group.role, group.content));
  }

  // Anything the plan didn't consume (untouched text + all non-text) passes through.
  for (const b of page.blocks) {
    if (consumed.has(b.id)) continue;
    elements.push(blockToElement(b));
  }

  // Zones: derive boundaries from the referenced blocks' extents (not LLM coords).
  const zones: ZoneOverrides = {};
  const headerBlocks = (plan.headerBlockIds ?? []).map(id => byId.get(id)).filter((b): b is Block => !!b);
  const footerBlocks = (plan.footerBlockIds ?? []).map(id => byId.get(id)).filter((b): b is Block => !!b);
  if (headerBlocks.length) {
    zones.headerBoundaryY = r(Math.max(...headerBlocks.map(b => b.rect.y + b.rect.height)) + 8);
  }
  if (footerBlocks.length) {
    zones.footerBoundaryY = r(Math.min(...footerBlocks.map(b => b.rect.y)) - 8);
  }

  return { elements, zones };
}
