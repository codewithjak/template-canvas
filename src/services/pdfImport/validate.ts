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

type Pos = { x: number; y: number };
/** A validated element to keep, or a reason to drop it. */
type Verdict = { el: CanvasElement } | { drop: string };
/** Narrow a CanvasElement to one variant by its `type`. */
type Of<T extends CanvasElement['type']> = Extract<CanvasElement, { type: T }>;

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const oneOf = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Is the element so far off-page that clamping would be meaningless? */
function fullyOffPage(el: CanvasElement, w: number, h: number): boolean {
  const { x, y } = el.position ?? { x: 0, y: 0 };
  // Allow a one-page margin of slop before declaring it lost.
  return x > w * 2 || y > h * 2 || x < -w || y < -h;
}

// ── Per-type validators — each returns a Verdict (keep-repaired | drop) ─────────

function validateText(el: Of<'text' | 'paragraph'>, position: Pos): Verdict {
  if (typeof el.content !== 'string' || el.content.length === 0) return { drop: 'empty text content' };
  return { el: { ...el, position } };
}

function validateImage(el: Of<'image'>, position: Pos): Verdict {
  if (!el.src) return { drop: 'image missing src' };
  const w = isFiniteNum(el.style.width) ? el.style.width : 0;
  const h = isFiniteNum(el.style.height) ? el.style.height : 0;
  if (w <= 0 || h <= 0) return { drop: 'image has zero size' };
  return { el: { ...el, position } };
}

function validateLine(el: Of<'line'>, position: Pos): Verdict {
  if (!isFiniteNum(el.style.length) || el.style.length <= 0) return { drop: 'line has zero length' };
  return {
    el: {
      ...el, position,
      style: {
        ...el.style,
        direction: el.style.direction === 'vertical' ? 'vertical' : 'horizontal',
        style: oneOf(['solid', 'dashed', 'dotted'] as const, el.style.style, 'solid'),
        thickness: isFiniteNum(el.style.thickness) && el.style.thickness > 0 ? el.style.thickness : 1,
      },
    },
  };
}

function validateBox(el: Of<'box'>, position: Pos): Verdict {
  const { width, height } = el.style;
  if (!isFiniteNum(width) || !isFiniteNum(height) || width <= 0 || height <= 0) {
    return { drop: 'box has non-positive size' };
  }
  return {
    el: {
      ...el, position,
      style: {
        ...el.style,
        borderStyle: oneOf(['solid', 'dashed', 'dotted', 'double'] as const, el.style.borderStyle, 'solid'),
        borderWidth: isFiniteNum(el.style.borderWidth) ? Math.max(0, el.style.borderWidth) : 0,
        backgroundColor: el.style.backgroundColor || 'transparent',
      },
    },
  };
}

/** Dispatch an element to its validator; unknown types pass through repositioned. */
function validateElement(el: CanvasElement, position: Pos): Verdict {
  switch (el.type) {
    case 'text':
    case 'paragraph': return validateText(el, position);
    case 'image': return validateImage(el, position);
    case 'line': return validateLine(el, position);
    case 'box': return validateBox(el, position);
    // radio/checkbox/date/barcode/chart/table aren't emitted by the importer yet;
    // pass through unchanged after the position clamp if they ever appear.
    default: return { el: { ...el, position } };
  }
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

    const position = { x: clamp(el.position.x, 0, width), y: clamp(el.position.y, 0, height) };
    const verdict = validateElement(el, position);
    if ('drop' in verdict) dropped.push({ id: el.id, reason: verdict.drop });
    else out.push(verdict.el);
  }

  return { elements: out, dropped };
}
