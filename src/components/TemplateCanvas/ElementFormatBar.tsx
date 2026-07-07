/**
 * ElementFormatBar.tsx
 *
 * A contextual top-centre bar for non-text elements — the same idea as
 * TextFormatBar, extended to images, boxes and lines. It surfaces the few
 * most-used quick controls per element type and writes through the same
 * update handler the Properties panel uses, only ever touching style fields
 * that already exist on the model. The full Properties panel remains the place
 * for the complete set of controls.
 */

import type {
  ImageElementType,
  BoxElementType,
  LineElementType,
  CanvasElement,
  UpdateElement,
} from './properties/elementTypes';
import { type LayoutTableElement, insertColumnAt } from '../../model/layoutTable';
import './TextFormatBar.css';

type SupportedElement = ImageElementType | BoxElementType | LineElementType | LayoutTableElement;

/** The element types this bar knows how to render. */
export const ELEMENT_BAR_TYPES = ['image', 'box', 'line', 'table'] as const;

interface Props {
  element: SupportedElement;
  onUpdate: UpdateElement;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
type SetStyle = (patch: Record<string, unknown>) => void;

export default function ElementFormatBar({ element, onUpdate }: Props) {
  const setStyle: SetStyle = (patch) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } } as Partial<CanvasElement>);
  };

  return (
    <div className="tfb" role="toolbar" aria-label="Element formatting">
      {element.type === 'image' && renderImage(element, setStyle)}
      {element.type === 'box'   && renderBox(element, setStyle)}
      {element.type === 'line'  && renderLine(element, setStyle)}
      {element.type === 'table' && renderTable(element, setStyle, onUpdate)}
    </div>
  );
}

/* ── Shared little controls ─────────────────────────────────── */

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tfb-field">
      <span className="tfb-label">{label}</span>
      <label className="tfb-color" title={label}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} />
      </label>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }:
  { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="tfb-field">
      <span className="tfb-label">{label}</span>
      <div className="tfb-size">
        <button className="tfb-step" onClick={() => onChange(clamp(value - 1, min, max))}
          aria-label={`Decrease ${label}`}>−</button>
        <input className="tfb-size-input" type="number" min={min} max={max} value={value}
          onChange={e => onChange(clamp(Number(e.target.value) || min, min, max))} aria-label={label} />
        <button className="tfb-step" onClick={() => onChange(clamp(value + 1, min, max))}
          aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

function OpacityField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="tfb-field">
      <span className="tfb-label">Opacity</span>
      <input className="tfb-num" type="number" min={0} max={100} value={value}
        onChange={e => onChange(clamp(Number(e.target.value) || 0, 0, 100))} aria-label="Opacity percent" />
    </div>
  );
}

/* ── Per-type layouts ───────────────────────────────────────── */

function renderImage(el: ImageElementType, setStyle: SetStyle) {
  return (
    <>
      <div className="tfb-field">
        <span className="tfb-label">Fit</span>
        <select className="tfb-select" value={el.style.objectFit}
          onChange={e => setStyle({ objectFit: e.target.value })} aria-label="Object fit">
          <option value="contain">Contain</option>
          <option value="cover">Cover</option>
          <option value="fill">Fill</option>
          <option value="none">None</option>
          <option value="scale-down">Scale down</option>
        </select>
      </div>
      <span className="tfb-divider" />
      <OpacityField value={el.style.opacity ?? 100} onChange={n => setStyle({ opacity: n })} />
    </>
  );
}

function renderBox(el: BoxElementType, setStyle: SetStyle) {
  return (
    <>
      <Swatch label="Fill"   value={el.style.backgroundColor} onChange={v => setStyle({ backgroundColor: v })} />
      <Swatch label="Border" value={el.style.borderColor}     onChange={v => setStyle({ borderColor: v })} />
      <span className="tfb-divider" />
      <Stepper label="Width" value={el.style.borderWidth} min={0} max={20} onChange={n => setStyle({ borderWidth: n })} />
      <span className="tfb-divider" />
      <OpacityField value={el.style.opacity ?? 100} onChange={n => setStyle({ opacity: n })} />
    </>
  );
}

function renderLine(el: LineElementType, setStyle: SetStyle) {
  return (
    <>
      <Swatch label="Color" value={el.style.color} onChange={v => setStyle({ color: v })} />
      <span className="tfb-divider" />
      <Stepper label="Thickness" value={el.style.thickness} min={1} max={20} onChange={n => setStyle({ thickness: n })} />
      <span className="tfb-divider" />
      <div className="tfb-field">
        <span className="tfb-label">Style</span>
        <select className="tfb-select" value={el.style.style}
          onChange={e => setStyle({ style: e.target.value })} aria-label="Line style">
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
    </>
  );
}

function renderTable(el: LayoutTableElement, setStyle: SetStyle, onUpdate: UpdateElement) {
  const showBorders = el.style.showBorders !== false;
  return (
    <>
      <Stepper label="Border" value={el.style.borderWidth ?? 0} min={0} max={8} onChange={n => setStyle({ borderWidth: n })} />
      <Swatch label="Color" value={el.style.borderColor ?? '#d1d5db'} onChange={v => setStyle({ borderColor: v })} />
      <button
        className={`tfb-textbtn ${showBorders ? 'tfb-textbtn--active' : ''}`}
        onClick={() => setStyle({ showBorders: !showBorders })}
        aria-pressed={showBorders}
      >Borders</button>
      <span className="tfb-divider" />
      <button
        className="tfb-textbtn"
        onClick={() => onUpdate(el.id, insertColumnAt(el, el.columns.length) as Partial<CanvasElement>)}
      >+ Column</button>
    </>
  );
}
