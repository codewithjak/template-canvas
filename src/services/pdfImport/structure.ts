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
