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
import type {
  Block, TextBlock, LineBlock, RectBlock, ImageBlock, NormalizedPage,
  PageStructurePlan, Rect,
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

/** Build one merged text/paragraph element from grouped text blocks. */
function mergedTextElement(blocks: TextBlock[], type: 'text' | 'paragraph', role: string): CanvasElement {
  const ordered = [...blocks].sort((a, b) => (a.rect.y - b.rect.y) || (a.rect.x - b.rect.x));
  const head = ordered[0];
  const rect = unionRect(ordered.map(b => b.rect));
  const content = ordered.map(b => b.text).join(type === 'paragraph' ? '\n' : ' ');

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
 * Materialize a plan against a page's blocks. Geometry comes ENTIRELY from the
 * blocks (looked up by id) — the plan only decides grouping/role/zones. Unknown
 * ids in the plan are ignored; any text block the plan failed to mention still
 * passes through, so nothing is lost. (arch doc §4, §2.3)
 */
export function materializePage(page: NormalizedPage, plan: PageStructurePlan): MaterializedPage {
  const byId = new Map<string, Block>(page.blocks.map(b => [b.id, b]));
  const consumed = new Set<string>();
  const elements: CanvasElement[] = [];

  for (const group of plan.groups ?? []) {
    const textBlocks = (group.blockIds ?? [])
      .map(id => byId.get(id))
      .filter((b): b is TextBlock => !!b && (b.kind === 'text' || b.kind === 'paragraph'));
    if (textBlocks.length === 0) continue;
    textBlocks.forEach(b => consumed.add(b.id));
    elements.push(mergedTextElement(textBlocks, group.type, group.role));
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
