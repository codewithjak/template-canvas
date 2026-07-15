/**
 * maskImage.ts — the one DOM/canvas step of image crop-to-shape.
 *
 * Loads a source image, draws the chosen pixel region into a canvas of that
 * region's size, clips to the shape, and returns a PNG data URL (PNG so the area
 * outside the shape stays transparent — the export pipeline embeds it unchanged).
 *
 * Geometry lives in `cropGeometry`; this file only touches the canvas.
 */
import { shapePolygon, type CropShape, type PixelRect } from './cropGeometry';

/** Load an image element from a data/URL source. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Harmless for data URLs; lets same-origin/permissive URLs bake without tainting.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image for cropping'));
    img.src = src;
  });
}

/** Trace the shape as a clip path on the 2D context of a `w × h` canvas. */
function clipToShape(ctx: CanvasRenderingContext2D, shape: CropShape, w: number, h: number): void {
  ctx.beginPath();
  const poly = shapePolygon(shape, w, h);
  if (poly === null) {
    // Ellipse inscribed in the canvas.
    ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    poly.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
  }
  ctx.clip();
}

/**
 * Mask `src` to `shape` within `rect` (source pixels) → PNG data URL.
 */
export async function maskImageToShape(src: string, rect: PixelRect, shape: CropShape): Promise<string> {
  const img = await loadImage(src);

  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  clipToShape(ctx, shape, rect.w, rect.h);
  // Draw only the cropped region, moved to the canvas origin.
  ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);

  return canvas.toDataURL('image/png');
}
