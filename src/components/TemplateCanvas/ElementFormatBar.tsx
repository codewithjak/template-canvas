/**
 * ElementFormatBar.tsx
 *
 * The contextual top-centre bar for non-text elements. It carries the FULL set
 * of controls for each element type (image, box, line, barcode, radio,
 * checkbox, date) plus quick table controls.
 *
 * It now also owns the last two cases the Properties panel was kept for — TABLE
 * (columns, binding, cell typography) and CHART — behind the "⋯" overflow. The
 * panel is therefore gone (relayout doc A5.3). Chart previously had NO bar at
 * all: the panel was its only surface.
 *
 * The controls inside "⋯" are the EXISTING property components, re-housed rather
 * than rewritten. Everything writes through the same update handler the panel
 * used and only touches fields that already exist on the model.
 */

import type React from 'react';
import type {
  ImageElementType,
  BoxElementType,
  LineElementType,
  RadioElementType,
  CheckboxElementType,
  DateElementType,
  BarcodeElementType,
  CanvasElement,
  UpdateElement,
} from './properties/elementTypes';
import { type LayoutTableElement, insertColumnAt } from '../../model/layoutTable';
import { notify } from '../../notify';
import FontFamilyOptions from './properties/FontFamilyOptions';
import PositionFields from './PositionFields';
import './TextFormatBar.css';

type SupportedElement =
  | ImageElementType
  | BoxElementType
  | LineElementType
  | LayoutTableElement
  | BarcodeElementType
  | RadioElementType
  | CheckboxElementType
  | DateElementType
  // Chart had no bar at all — the Properties panel was its only surface.
  | CanvasElement;

/** Element types this bar owns. There is no Properties panel any more. */
export const ELEMENT_BAR_TYPES = ['image', 'box', 'line', 'table', 'barcode', 'radio', 'checkbox', 'date', 'chart'] as const;

interface Props {
  element: SupportedElement;
  onUpdate: UpdateElement;
  staticPlaceholders?: string[];
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export default function ElementFormatBar({ element, onUpdate, staticPlaceholders = [] }: Props) {
  const setStyle = (patch: Record<string, unknown>) =>
    onUpdate(element.id, { style: { ...(element as { style?: object }).style, ...patch } } as Partial<CanvasElement>);
  const update = (patch: Record<string, unknown>) =>
    onUpdate(element.id, patch as Partial<CanvasElement>);

  const isTable = element.type === 'table';

  return (
    <div className="tfb" role="toolbar" aria-label="Element formatting">
      {element.type === 'image'    && renderImage(element as ImageElementType, setStyle, update)}
      {element.type === 'box'      && renderBox(element as BoxElementType, setStyle)}
      {element.type === 'line'     && renderLine(element as LineElementType, setStyle)}
      {isTable                     && renderTable(element as LayoutTableElement, setStyle, update)}
      {element.type === 'barcode'  && renderBarcode(element as BarcodeElementType, setStyle, update, staticPlaceholders)}
      {(element.type === 'radio' || element.type === 'checkbox') && renderRadioCheckbox(element as RadioElementType | CheckboxElementType, update)}
      {element.type === 'date'     && renderDate(element as DateElementType, setStyle, update)}

      <span className="tfb-divider" />
      {/* Numeric position, shared with the text bar — every element has X/Y on its
          own bar now (see docs/POSITION_ON_FORMAT_BAR_ARCHITECTURE.md). */}
      <PositionFields element={element as CanvasElement} onUpdate={onUpdate} />

      {/* No "⋯" here any more (TC-0212). A table's columns, binding and per-cell
          typography — and a chart's series — are dense, and a 300px popover hanging off
          a floating bar was a bad place for them. They live in the right panel now,
          below the tab content (panel/ElementOptions). The bar keeps the everyday
          controls above, which is what a bar is for. */}
    </div>
  );
}

type SetStyle = (patch: Record<string, unknown>) => void;
type Update = (patch: Record<string, unknown>) => void;

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
        <button className="tfb-step" onClick={() => onChange(clamp(value - 1, min, max))} aria-label={`Decrease ${label}`}>−</button>
        <input className="tfb-size-input" type="number" min={min} max={max} value={value}
          onChange={e => onChange(clamp(Number(e.target.value) || min, min, max))} aria-label={label} />
        <button className="tfb-step" onClick={() => onChange(clamp(value + 1, min, max))} aria-label={`Increase ${label}`}>+</button>
      </div>
    </div>
  );
}

function NumField({ label, value, min, max, step, onChange }:
  { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <div className="tfb-field">
      <span className="tfb-label">{label}</span>
      <input className="tfb-num" type="number" min={min} max={max} step={step} value={value}
        onChange={e => onChange(clamp(Number(e.target.value) || min, min, max))} aria-label={label} />
    </div>
  );
}

function OpacityField({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <NumField label="Opacity" value={value} min={0} max={100} onChange={onChange} />;
}

function SelectField({ label, value, options, onChange }:
  { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="tfb-field">
      <span className="tfb-label">{label}</span>
      <select className="tfb-select" value={value} onChange={e => onChange(e.target.value)} aria-label={label}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`tfb-textbtn ${active ? 'tfb-textbtn--active' : ''}`} onClick={onClick} aria-pressed={active}>
      {label}
    </button>
  );
}

/* ── Per-type layouts ───────────────────────────────────────── */

function renderImage(el: ImageElementType, setStyle: SetStyle, update: Update) {
  const inputId = `tfb-img-${el.id}`;
  // Replacing the image must drop any prior crop, or the new image would keep a
  // stale mask (crop stores the OLD original). Cleared in the same patch.
  const replaceSrc = (src: string) => update({ src, originalSrc: undefined, crop: undefined });
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify.error('image.selectImageFile'); return; }
    const reader = new FileReader();
    reader.onload = ev => { const b64 = ev.target?.result as string; if (b64) replaceSrc(b64); };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  return (
    <>
      <input className="tfb-input tfb-src" type="text" value={el.src}
        onChange={e => replaceSrc(e.target.value)} placeholder="Image URL or {{field}}" aria-label="Image source" />
      <input id={inputId} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      <button className="tfb-textbtn" onClick={() => document.getElementById(inputId)?.click()}>Upload</button>
      <span className="tfb-divider" />
      <NumField label="W" value={el.style.width}  min={50} max={1000} onChange={n => setStyle({ width: n })} />
      <NumField label="H" value={el.style.height} min={50} max={1000} onChange={n => setStyle({ height: n })} />
      <span className="tfb-divider" />
      <SelectField label="Fit" value={el.style.objectFit}
        options={[['contain', 'Contain'], ['cover', 'Cover'], ['fill', 'Fill'], ['none', 'None'], ['scale-down', 'Scale down']]}
        onChange={v => setStyle({ objectFit: v })} />
      <OpacityField value={el.style.opacity ?? 100} onChange={n => setStyle({ opacity: n })} />
    </>
  );
}

function renderBox(el: BoxElementType, setStyle: SetStyle) {
  return (
    <>
      <NumField label="W" value={el.style.width}  min={20} max={1000} onChange={n => setStyle({ width: n })} />
      <NumField label="H" value={el.style.height} min={20} max={1000} onChange={n => setStyle({ height: n })} />
      <span className="tfb-divider" />
      <Swatch label="Fill"   value={el.style.backgroundColor} onChange={v => setStyle({ backgroundColor: v })} />
      <Swatch label="Border" value={el.style.borderColor}     onChange={v => setStyle({ borderColor: v })} />
      <Stepper label="Thickness" value={el.style.borderWidth} min={0} max={20} onChange={n => setStyle({ borderWidth: n })} />
      <SelectField label="Style" value={el.style.borderStyle}
        options={[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']]}
        onChange={v => setStyle({ borderStyle: v })} />
      <NumField label="Radius" value={el.style.borderRadius ?? 0} min={0} max={50} onChange={n => setStyle({ borderRadius: n })} />
      <OpacityField value={el.style.opacity ?? 100} onChange={n => setStyle({ opacity: n })} />
    </>
  );
}

function renderLine(el: LineElementType, setStyle: SetStyle) {
  return (
    <>
      <SelectField label="Dir" value={el.style.direction}
        options={[['horizontal', 'Horizontal'], ['vertical', 'Vertical']]}
        onChange={v => setStyle({ direction: v })} />
      <NumField label="Length" value={el.style.length} min={20} max={1000} onChange={n => setStyle({ length: n })} />
      <Stepper label="Thickness" value={el.style.thickness} min={1} max={20} onChange={n => setStyle({ thickness: n })} />
      <Swatch label="Color" value={el.style.color} onChange={v => setStyle({ color: v })} />
      <SelectField label="Style" value={el.style.style}
        options={[['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']]}
        onChange={v => setStyle({ style: v })} />
      <OpacityField value={el.style.opacity ?? 100} onChange={n => setStyle({ opacity: n })} />
    </>
  );
}

function renderTable(el: LayoutTableElement, setStyle: SetStyle, update: Update) {
  const showBorders = el.style.showBorders !== false;
  return (
    <>
      <Stepper label="Border" value={el.style.borderWidth ?? 0} min={0} max={8} onChange={n => setStyle({ borderWidth: n })} />
      <Swatch label="Color" value={el.style.borderColor ?? '#d1d5db'} onChange={v => setStyle({ borderColor: v })} />
      <ToggleBtn label="Borders" active={showBorders} onClick={() => setStyle({ showBorders: !showBorders })} />
      <span className="tfb-divider" />
      <button className="tfb-textbtn" onClick={() => update(insertColumnAt(el, el.columns.length))}>+ Column</button>
    </>
  );
}

function renderBarcode(el: BarcodeElementType, setStyle: SetStyle, update: Update, placeholders: string[]) {
  const match = el.content.match(/^\{\{(.+?)\}\}$/);
  const currentField = match ? match[1].trim() : '__custom__';
  const showCurrent = currentField !== '__custom__' && !placeholders.includes(currentField);
  return (
    <>
      <div className="tfb-field">
        <span className="tfb-label">Field</span>
        <select className="tfb-select" value={currentField}
          onChange={e => { const v = e.target.value; update({ content: v === '__custom__' ? '' : `{{${v}}}` }); }}
          aria-label="Data field">
          {placeholders.map(f => <option key={f} value={f}>{f}</option>)}
          {showCurrent && <option value={currentField}>{currentField}</option>}
          <option value="__custom__">Custom…</option>
        </select>
      </div>
      {currentField === '__custom__' && (
        <input className="tfb-input tfb-src" type="text" value={el.content}
          onChange={e => update({ content: e.target.value })} placeholder="Barcode value" aria-label="Custom value" />
      )}
      <span className="tfb-divider" />
      <SelectField label="Format" value={el.barcode.format}
        options={[['code128', 'Code 128'], ['code39', 'Code 39'], ['qrcode', 'QR Code'], ['ean13', 'EAN-13'], ['upca', 'UPC-A'], ['itf14', 'ITF-14']]}
        onChange={v => update({ barcode: { ...el.barcode, format: v } })} />
      <ToggleBtn label="Show text" active={el.barcode.showText}
        onClick={() => update({ barcode: { ...el.barcode, showText: !el.barcode.showText } })} />
      <span className="tfb-divider" />
      <NumField label="W" value={el.style.width}  min={20} max={1000} onChange={n => setStyle({ width: n })} />
      <NumField label="H" value={el.style.height} min={20} max={1000} onChange={n => setStyle({ height: n })} />
    </>
  );
}

function renderRadioCheckbox(el: RadioElementType | CheckboxElementType, update: Update) {
  return (
    <>
      <SelectField label="Orientation" value={el.orientation || 'vertical'}
        options={[['vertical', 'Vertical'], ['horizontal', 'Horizontal']]}
        onChange={v => update({ orientation: v })} />
      <NumField label="Offset" value={el.position.relativeOffset ?? 8} min={0} max={50}
        onChange={n => update({ position: { ...el.position, relativeOffset: n } })} />
      {el.type === 'checkbox' && (
        <NumField label="Count" value={el.count ?? 1} min={1} max={10} onChange={n => update({ count: n })} />
      )}
      {el.type === 'radio' && (
        <NumField label="Options" value={el.options ?? 2} min={2} max={10} onChange={n => update({ options: n })} />
      )}
    </>
  );
}

/**
 * A date element's value/format controls, plus its TYPOGRAPHY.
 *
 * The typography half closes a gap that predates the panel's removal: those four
 * controls lived only in `DateTypography`, which the Properties panel rendered —
 * but the panel was gated to chart / table / page-number text, so it NEVER opened
 * for a date. A date element has therefore had no font controls for as long as that
 * gate existed. `DateElementType.style` is exactly `{fontSize, fontWeight, color,
 * fontFamily}` and `DateElement` renders with all four, so they were settable by the
 * model and unreachable from the UI.
 */
function renderDate(el: DateElementType, setStyle: SetStyle, update: Update) {
  const showTime = el.includeTime || false;
  const isBold = el.style.fontWeight === 'bold';
  return (
    <>
      <ToggleBtn label="Include time" active={showTime} onClick={() => update({ includeTime: !showTime })} />
      <div className="tfb-field">
        <span className="tfb-label">Date</span>
        <input className="tfb-input" type="date" value={el.value || ''}
          onChange={e => update({ value: e.target.value })} aria-label="Date value" />
      </div>
      {showTime && (
        <div className="tfb-field">
          <span className="tfb-label">Time</span>
          <input className="tfb-input" type="time" value={el.time || ''}
            onChange={e => update({ time: e.target.value })} aria-label="Time value" />
        </div>
      )}
      <SelectField label="Format" value={el.format || 'MM/DD/YYYY'}
        options={[['MM/DD/YYYY', 'MM/DD/YYYY'], ['DD/MM/YYYY', 'DD/MM/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD'], ['MMM DD, YYYY', 'MMM DD, YYYY'], ['DD Mon YYYY', 'DD Mon YYYY']]}
        onChange={v => update({ format: v })} />

      <span className="tfb-divider" />

      {/* Typography — the same four fields DateTypography had, in the bar's own
          idioms. The font list is the SHARED FontFamilyOptions, not a second copy. */}
      <select
        className="tfb-font"
        value={el.style.fontFamily}
        onChange={e => setStyle({ fontFamily: e.target.value })}
        aria-label="Font family"
      >
        <FontFamilyOptions />
      </select>

      <Stepper label="Size" value={el.style.fontSize} min={8} max={160}
        onChange={n => setStyle({ fontSize: n })} />

      <ToggleBtn label="B" active={isBold}
        onClick={() => setStyle({ fontWeight: isBold ? 'normal' : 'bold' })} />

      <Swatch label="Color" value={el.style.color} onChange={v => setStyle({ color: v })} />
    </>
  );
}
