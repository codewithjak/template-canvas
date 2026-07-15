/**
 * CropModal.tsx — the crop-to-shape editor.
 *
 * Shows the (pre-crop) image, a draggable/resizable rectangular region, and a
 * shape picker. On Apply it bakes the masked PNG via `maskImageToShape` and hands
 * back a single element patch; it holds no element state itself.
 *
 * All geometry is normalized (0..1); only the render multiplies by the displayed
 * size. Pixel work is delegated to cropGeometry / maskImage.
 */
import { useEffect, useRef, useState } from 'react';
import {
  clampNormRect,
  toPixelRect,
  aspectHeight,
  shapePolygon,
  type CropShape,
  type NormRect,
} from './cropGeometry';
import { maskImageToShape } from './maskImage';
import type { ImageElementType } from '../properties/elementTypes';
import './CropModal.css';

const MAX_W = 560;
const MAX_H = 420;

const SHAPES: { id: CropShape; label: string }[] = [
  { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Circle' },
  { id: 'triangle', label: 'Triangle' },
];

type Corner = 'nw' | 'ne' | 'se' | 'sw';
type DragMode = { kind: 'move' } | { kind: 'resize'; corner: Corner };

export interface CropPatch {
  src: string;
  originalSrc: string;
  crop: { shape: CropShape; rect: NormRect };
  style: { height: number };
}

interface Props {
  element: ImageElementType;
  onApply: (patch: CropPatch) => void;
  onCancel: () => void;
}

/** Apply a pointer delta (in normalized units) for the given drag mode. */
function nextRect(mode: DragMode, start: NormRect, dnx: number, dny: number): NormRect {
  if (mode.kind === 'move') {
    return clampNormRect({ ...start, x: start.x + dnx, y: start.y + dny });
  }
  let { x, y, w, h } = start;
  const c = mode.corner;
  if (c === 'nw') { x += dnx; y += dny; w -= dnx; h -= dny; }
  if (c === 'ne') { y += dny; w += dnx; h -= dny; }
  if (c === 'se') { w += dnx; h += dny; }
  if (c === 'sw') { x += dnx; w -= dnx; h += dny; }
  // Keep the anchored edge fixed when a drag would invert the rect.
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  return clampNormRect({ x, y, w, h });
}

export default function CropModal({ element, onApply, onCancel }: Props) {
  const source = element.originalSrc ?? element.src;

  const [rect, setRect] = useState<NormRect>(element.crop?.rect ?? { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [shape, setShape] = useState<CropShape>(element.crop?.shape ?? 'rect');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live drag state, held in a ref so window listeners see fresh values.
  const drag = useRef<{ mode: DragMode; startRect: NormRect; startX: number; startY: number; dispW: number; dispH: number } | null>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dnx = (e.clientX - d.startX) / d.dispW;
      const dny = (e.clientY - d.startY) / d.dispH;
      setRect(nextRect(d.mode, d.startRect, dnx, dny));
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  // Learn the source's natural size once (and surface a load error early).
  useEffect(() => {
    let alive = true;
    const probe = new Image();
    probe.onload = () => { if (alive) setNatural({ w: probe.naturalWidth, h: probe.naturalHeight }); };
    probe.onerror = () => { if (alive) setError('Could not load this image for cropping.'); };
    probe.src = source;
    return () => { alive = false; };
  }, [source]);

  const scale = natural ? Math.min(MAX_W / natural.w, MAX_H / natural.h, 1) : 1;
  const dispW = natural ? natural.w * scale : MAX_W;
  const dispH = natural ? natural.h * scale : MAX_H;

  const startDrag = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = { mode, startRect: rect, startX: e.clientX, startY: e.clientY, dispW, dispH };
  };

  const apply = async () => {
    if (!natural) return;
    setBusy(true); setError(null);
    try {
      const pixelRect = toPixelRect(rect, natural.w, natural.h);
      const png = await maskImageToShape(source, pixelRect, shape);
      onApply({
        src: png,
        originalSrc: source,
        crop: { shape, rect: clampNormRect(rect) },
        style: { height: aspectHeight(element.style.width, pixelRect) },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // Preview the mask: dim the part of the region that the shape will cut away
  // (inside the region rectangle, outside the shape), so what stays lit is exactly
  // what Apply keeps. Built with an even-odd path = outer rect minus the shape.
  const rw = dispW * rect.w;
  const rh = dispH * rect.h;
  const poly = shapePolygon(shape, rw, rh);
  const outer = `M0 0 H${rw} V${rh} H0 Z`;
  const innerPath =
    poly === null
      ? `M0 ${rh / 2} a ${rw / 2} ${rh / 2} 0 1 0 ${rw} 0 a ${rw / 2} ${rh / 2} 0 1 0 ${-rw} 0 Z`
      : `M${poly.map(([px, py]) => `${px} ${py}`).join(' L')} Z`;

  return (
    <div className="crop-backdrop" onClick={onCancel}>
      <div className="crop-card" onClick={e => e.stopPropagation()}>
        <h2 className="crop-title">Crop image</h2>

        <div className="crop-shapes" role="group" aria-label="Crop shape">
          {SHAPES.map(s => (
            <button
              key={s.id}
              type="button"
              className={`crop-shape-btn${shape === s.id ? ' crop-shape-btn--on' : ''}`}
              onClick={() => setShape(s.id)}
              aria-pressed={shape === s.id}
            >
              {s.label}
            </button>
          ))}
        </div>

        {error && <div className="crop-error">{error}</div>}

        <div className="crop-stage" style={{ width: dispW, height: dispH }}>
          <img className="crop-img" src={source} alt="" draggable={false} style={{ width: dispW, height: dispH }} />
          <div
            className="crop-region"
            style={{ left: dispW * rect.x, top: dispH * rect.y, width: dispW * rect.w, height: dispH * rect.h }}
            onPointerDown={startDrag({ kind: 'move' })}
          >
            <svg className="crop-shape-preview" width={rw} height={rh} aria-hidden="true">
              <path className="crop-cut" d={`${outer} ${innerPath}`} fillRule="evenodd" />
              <path className="crop-outline" d={innerPath} />
            </svg>
            {(['nw', 'ne', 'se', 'sw'] as Corner[]).map(c => (
              <span
                key={c}
                className={`crop-handle crop-handle--${c}`}
                onPointerDown={startDrag({ kind: 'resize', corner: c })}
              />
            ))}
          </div>
        </div>

        <div className="crop-actions">
          <button type="button" className="crop-btn crop-btn--cancel" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="crop-btn crop-btn--apply" onClick={apply} disabled={busy || !natural}>
            {busy ? 'Applying…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
