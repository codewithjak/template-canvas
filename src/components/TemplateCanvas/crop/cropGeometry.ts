/**
 * cropGeometry.ts — the PURE geometry behind image crop-to-shape.
 *
 * No DOM, no canvas: normalized <-> pixel rects, clamping, the shape outline, and
 * the box-height that keeps a crop undistorted. Kept separate from `maskImage`
 * (which owns the canvas) so this is unit-testable under `node --test`.
 */

/** The shapes a crop can be masked to in Phase 1. */
export type CropShape = 'rect' | 'ellipse' | 'triangle';

/** A crop region in 0..1 of the source image's natural size. */
export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A crop region in whole source pixels. */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Smallest region we allow, as a fraction — stops a zero-area crop. */
const MIN_FRACTION = 0.02;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Clamp a region into the unit square with a minimum size, keeping the origin so a
 * region dragged past an edge slides back in rather than collapsing.
 */
export function clampNormRect(r: NormRect): NormRect {
  const w = Math.min(1, Math.max(MIN_FRACTION, r.w));
  const h = Math.min(1, Math.max(MIN_FRACTION, r.h));
  const x = clamp01(Math.min(r.x, 1 - w));
  const y = clamp01(Math.min(r.y, 1 - h));
  return { x, y, w, h };
}

/** Project a normalized region onto the source's natural pixels (integers). */
export function toPixelRect(r: NormRect, naturalW: number, naturalH: number): PixelRect {
  const c = clampNormRect(r);
  return {
    x: Math.round(c.x * naturalW),
    y: Math.round(c.y * naturalH),
    w: Math.max(1, Math.round(c.w * naturalW)),
    h: Math.max(1, Math.round(c.h * naturalH)),
  };
}

/**
 * The box height that keeps a crop of `rect` undistorted at a given box width, so
 * the baked PNG's aspect matches its frame.
 */
export function aspectHeight(boxWidth: number, rect: PixelRect): number {
  return Math.round(boxWidth * (rect.h / rect.w));
}

/**
 * The shape outline inside a `w × h` canvas, as polygon points.
 *
 * `ellipse` is not a polygon, so it returns null — the caller draws it with the
 * canvas ellipse API. `rect` is the four corners (a plain rectangular crop).
 */
export function shapePolygon(shape: CropShape, w: number, h: number): [number, number][] | null {
  switch (shape) {
    case 'ellipse':
      return null;
    case 'triangle':
      return [
        [w / 2, 0],
        [w, h],
        [0, h],
      ];
    case 'rect':
    default:
      return [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ];
  }
}
