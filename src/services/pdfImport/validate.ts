/**
 * pdfImport/validate.ts  —  Phase 5
 *
 * Deterministic, no model. Turns "schema-accurate" from a claim into a
 * guarantee: nothing structurally invalid or geometrically impossible reaches
 * the canvas. Repairs what it can, drops what it cannot, and reports every
 * action (no silent loss). (arch doc Phase 5, §2.2)
 */

import type { CanvasElement } from '../../types/canvas';

export interface ValidationResult {
  elements: CanvasElement[];
  dropped: { id: string; reason: string }[];
}

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Is the element so far off-page that clamping would be meaningless? */
function fullyOffPage(el: CanvasElement, w: number, h: number): boolean {
  const { x, y } = el.position ?? { x: 0, y: 0 };
  // Allow a one-page margin of slop before declaring it lost.
  return x > w * 2 || y > h * 2 || x < -w || y < -h;
}

/**
 * Validate + repair one page's elements against the page box.
 * `width`/`height` are canvas px.
 */
export function validatePage(
  elements: CanvasElement[],
  width: number,
  height: number,
): ValidationResult {
  const out: CanvasElement[] = [];
  const dropped: { id: string; reason: string }[] = [];

  for (const el of elements) {
    if (!el.position || !isFiniteNum(el.position.x) || !isFiniteNum(el.position.y)) {
      dropped.push({ id: el.id, reason: 'missing or non-finite position' });
      continue;
    }
    if (fullyOffPage(el, width, height)) {
      dropped.push({ id: el.id, reason: 'fully off-page' });
      continue;
    }

    // Clamp position into the page box.
    const pos = { x: clamp(el.position.x, 0, width), y: clamp(el.position.y, 0, height) };

    switch (el.type) {
      case 'text':
      case 'paragraph': {
        if (typeof el.content !== 'string' || el.content.length === 0) {
          dropped.push({ id: el.id, reason: 'empty text content' });
          continue;
        }
        out.push({ ...el, position: pos });
        break;
      }
      case 'image': {
        if (!el.src) { dropped.push({ id: el.id, reason: 'image missing src' }); continue; }
        const width_ = isFiniteNum(el.style.width) ? el.style.width : 0;
        const height_ = isFiniteNum(el.style.height) ? el.style.height : 0;
        if (width_ <= 0 || height_ <= 0) { dropped.push({ id: el.id, reason: 'image has zero size' }); continue; }
        out.push({ ...el, position: pos });
        break;
      }
      case 'line': {
        const len = el.style.length;
        if (!isFiniteNum(len) || len <= 0) { dropped.push({ id: el.id, reason: 'line has zero length' }); continue; }
        const repaired = {
          ...el,
          position: pos,
          style: {
            ...el.style,
            direction: el.style.direction === 'vertical' ? 'vertical' as const : 'horizontal' as const,
            style: (['solid', 'dashed', 'dotted'] as const).includes(el.style.style) ? el.style.style : 'solid' as const,
            thickness: isFiniteNum(el.style.thickness) && el.style.thickness > 0 ? el.style.thickness : 1,
          },
        };
        out.push(repaired);
        break;
      }
      case 'box': {
        const w = el.style.width, h = el.style.height;
        if (!isFiniteNum(w) || !isFiniteNum(h) || w <= 0 || h <= 0) {
          dropped.push({ id: el.id, reason: 'box has non-positive size' });
          continue;
        }
        const validBorder = (['solid', 'dashed', 'dotted', 'double'] as const).includes(el.style.borderStyle);
        const repaired = {
          ...el,
          position: pos,
          style: {
            ...el.style,
            borderStyle: validBorder ? el.style.borderStyle : 'solid' as const,
            borderWidth: isFiniteNum(el.style.borderWidth) ? Math.max(0, el.style.borderWidth) : 0,
            backgroundColor: el.style.backgroundColor || 'transparent',
          },
        };
        out.push(repaired);
        break;
      }
      default:
        // Other element types (radio/checkbox/date/barcode/chart/table) are not
        // produced by the pass-through structurer yet; pass through unchanged if
        // they ever appear, after the position clamp.
        out.push({ ...el, position: pos });
    }
  }

  return { elements: out, dropped };
}
