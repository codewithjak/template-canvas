/**
 * Toolbar.tsx — Redesigned
 * SVG icons, tooltip system, keyboard shortcut hints, visual hierarchy
 */

import React from 'react';
import './Toolbar.css';

/* ── SVG icon library ──────────────────────────────────────── */
const Icons = {
  Text: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3h12M8 3v10M5 13h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Table: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1.5 6h13M6 1.5v13" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  Image: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" opacity=".6"/>
      <path d="m1.5 10.5 4-4 3 3 2-2 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Watermark: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" opacity=".45"/>
      <path d="m4 11 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".65"/>
      <path d="M4.5 5.5h3M6 4v3M9.5 10.5h2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
    </svg>
  ),
  Signature: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 12.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>
      <path d="M3 9.5c1.2-3.8 2.2-5.6 3-5.4 1 .3-.7 5.8.5 6 1 .2 1.8-2.5 2.8-2.3.7.1.5 1.9 1.4 1.9.6 0 1.1-.7 1.6-1.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Paragraph: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M7 2h5M7 5.5h5M2 9h12M2 12.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4.5 2v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 2h4a2 2 0 0 1 0 4H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Radio: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="5" cy="5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5" cy="5" r="1.2" fill="currentColor"/>
      <circle cx="5" cy="11" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 5h4M10 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Checkbox: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="m3.5 5 1.5 1.5L7.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="2" y="10" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" opacity=".4"/>
      <path d="M10 5h4M10 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Date: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="3.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1.5 7h13M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="4" y="9" width="2.5" height="2.5" rx=".5" fill="currentColor" opacity=".6"/>
    </svg>
  ),
  Line: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14 14 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  Box: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  ),
  Rectangle: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
    </svg>
  ),
  Triangle: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 15 14H1L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  Ellipse: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <ellipse cx="8" cy="8" rx="6.5" ry="4.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  AddPage: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1.5" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 7h3M12.5 5.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  Ruler: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M4.5 3.5v3M7 3.5v2M9.5 3.5v3M12 3.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M2 9h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  Save: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 3a1 1 0 0 1 1-1h8l3 3v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 2v3h6V2M5 9h6v5H5V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  Library: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2.5 2.5h3v11h-3zM6.5 2.5h3v11h-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="m10.6 3 2.9.8-2.4 9.5-2.9-.8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
    </svg>
  ),
  Load: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 9v4a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 2v7M5 6l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Upload: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 11v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 9V2M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Export: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 2v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M5.5 9h5M5.5 11.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  Delete: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M6 7v5M10 7v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M3 4l1 9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Shapes: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="11.5" cy="11.5" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1.5" y="1.5" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 14 5 9l3 5H2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  Barcode: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="2" height="12" fill="currentColor"/>
      <rect x="4" y="2" width="1" height="12" fill="currentColor"/>
      <rect x="6" y="2" width="2" height="12" fill="currentColor"/>
      <rect x="9" y="2" width="1" height="12" fill="currentColor"/>
      <rect x="11" y="2" width="1.5" height="12" fill="currentColor"/>
      <rect x="13" y="2" width="2" height="12" fill="currentColor"/>
    </svg>
  ),
  Chart: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 14V2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="4" y="8" width="2.2" height="4" fill="currentColor"/>
      <rect x="7.4" y="5" width="2.2" height="7" fill="currentColor"/>
      <rect x="10.8" y="9.5" width="2.2" height="2.5" fill="currentColor"/>
    </svg>
  ),
  PageSize: () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="1" width="9" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M13 4v9.5a1.5 1.5 0 0 1-1.5 1.5H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 5h3M5 7.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
    </svg>
  ),
};

/* ── Tooltip wrapper ───────────────────────────────────────── */
interface TooltipProps {
  label: string;
  shortcut?: string;
  children: React.ReactNode;
}

function Tooltip({ label, shortcut, children }: TooltipProps) {
  return (
    <div className="tb-tooltip-wrap">
      {children}
      <div className="tb-tooltip" role="tooltip">
        <span className="tb-tooltip__label">{label}</span>
        {shortcut && <kbd className="tb-tooltip__key">{shortcut}</kbd>}
      </div>
    </div>
  );
}

/* ── Icon button ───────────────────────────────────────────── */
interface IconBtnProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'action' | 'page' | 'danger' | 'primary';
  active?: boolean;
}

function IconBtn({ icon, label, shortcut, onClick, disabled, variant = 'default', active }: IconBtnProps) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        className={[
          'tb-btn',
          `tb-btn--${variant}`,
          active ? 'tb-btn--active' : '',
          disabled ? 'tb-btn--disabled' : '',
        ].filter(Boolean).join(' ')}
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

/* ── Divider ───────────────────────────────────────────────── */
const Divider = () => <div className="tb-divider" aria-hidden="true" />;

/* ── Shapes dropdown ───────────────────────────────────────── */
interface ShapesMenuProps {
  onAddLine     : () => void;
  onAddBox      : () => void;
  onAddRectangle: () => void;
  onAddTriangle : () => void;
  onAddEllipse  : () => void;
}

function ShapesMenu({ onAddLine, onAddBox, onAddRectangle, onAddTriangle, onAddEllipse }: ShapesMenuProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const shapes = [
    { icon: <Icons.Line />,      label: 'Line',      action: onAddLine },
    { icon: <Icons.Box />,       label: 'Box',       action: onAddBox },
    { icon: <Icons.Rectangle />, label: 'Rectangle', action: onAddRectangle },
    { icon: <Icons.Triangle />,  label: 'Triangle',  action: onAddTriangle },
    { icon: <Icons.Ellipse />,   label: 'Ellipse',   action: onAddEllipse },
  ];

  return (
    <div className="tb-shapes-wrap" ref={ref}>
      <Tooltip label="Shapes">
        <button
          className={`tb-btn tb-btn--default ${open ? 'tb-btn--active' : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-label="Shapes"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <Icons.Shapes />
          <svg className="tb-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 3.5 5 6l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </Tooltip>

      {open && (
        <div className="tb-shapes-menu" role="menu">
          <div className="tb-shapes-menu__label">Shapes</div>
          {shapes.map(({ icon, label, action }) => (
            <button
              key={label}
              className="tb-shapes-item"
              role="menuitem"
              onClick={() => { action(); setOpen(false); }}
            >
              <span className="tb-shapes-item__icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page Size Menu ────────────────────────────────────────── */
interface PageSizeMenuProps {
  currentPageSize: string;
  onSelect: (preset: string) => void;
  onCustomSize?: (widthInches: number, heightInches: number) => void;
  customWidth?: number;
  customHeight?: number;
}

function PageSizeMenu({ currentPageSize, onSelect, onCustomSize, customWidth, customHeight }: PageSizeMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [cw, setCw] = React.useState(String(customWidth || 4));
  const [ch, setCh] = React.useState(String(customHeight || 6));
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Sync custom inputs when preset changes to custom externally
  React.useEffect(() => {
    if (customWidth) setCw(String(customWidth));
    if (customHeight) setCh(String(customHeight));
  }, [customWidth, customHeight]);

  const presets = [
    { key: 'a4',     label: 'A4',               dim: '8.27 × 11.69″' },
    { key: 'letter', label: 'US Letter',         dim: '8.5 × 11″' },
    { key: '4x6',    label: '4×6 Shipping Label', dim: '4 × 6″' },
    { key: '4x4',    label: '4×4 Label',         dim: '4 × 4″' },
    { key: '3x5',    label: '3×5 Label',         dim: '3 × 5″' },
  ];

  const handleApplyCustom = () => {
    const w = parseFloat(cw);
    const h = parseFloat(ch);
    if (!w || !h || w <= 0 || h <= 0 || w > 50 || h > 50) return;
    onCustomSize?.(w, h);
    setOpen(false);
    setShowCustom(false);
  };

  return (
    <div className="tb-shapes-wrap" ref={ref}>
      <Tooltip label="Page size">
        <button
          className={`tb-btn tb-btn--default ${open ? 'tb-btn--active' : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-label="Page size"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <Icons.PageSize />
          <svg className="tb-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 3.5 5 6l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </Tooltip>

      {open && (
        <div className="tb-shapes-menu tb-page-size-menu" role="menu">
          <div className="tb-shapes-menu__label">Page Size</div>
          {presets.map(({ key, label, dim }) => (
            <button
              key={key}
              className={`tb-shapes-item ${key === currentPageSize ? 'tb-shapes-item--active' : ''}`}
              role="menuitem"
              onClick={() => { onSelect(key); setOpen(false); setShowCustom(false); }}
            >
              <span className="tb-shapes-item__icon">
                {key === currentPageSize ? '✓' : ''}
              </span>
              <span className="tb-page-size-label">
                <span>{label}</span>
                <span className="tb-page-size-dim">{dim}</span>
              </span>
            </button>
          ))}

          {/* Divider */}
          <div className="tb-menu-divider" />

          {/* Custom entry */}
          <button
            className={`tb-shapes-item ${currentPageSize === 'custom' ? 'tb-shapes-item--active' : ''}`}
            role="menuitem"
            onClick={() => setShowCustom(v => !v)}
          >
            <span className="tb-shapes-item__icon">
              {currentPageSize === 'custom' ? '✓' : ''}
            </span>
            <span>Custom size…</span>
          </button>

          {showCustom && (
            <div className="tb-custom-size">
              <div className="tb-custom-size__row">
                <label className="tb-custom-size__label">
                  W<span className="tb-custom-size__unit">(in)</span>
                  <input
                    className="tb-custom-size__input"
                    type="number"
                    min="0.5"
                    max="50"
                    step="0.1"
                    value={cw}
                    onChange={e => setCw(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleApplyCustom(); }}
                  />
                </label>
                <span className="tb-custom-size__x">×</span>
                <label className="tb-custom-size__label">
                  H<span className="tb-custom-size__unit">(in)</span>
                  <input
                    className="tb-custom-size__input"
                    type="number"
                    min="0.5"
                    max="50"
                    step="0.1"
                    value={ch}
                    onChange={e => setCh(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleApplyCustom(); }}
                  />
                </label>
              </div>
              <button className="tb-custom-size__apply" onClick={handleApplyCustom}>
                Apply
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Toolbar ───────────────────────────────────────────────── */
export interface ToolbarProps {
  onAddParagraph ?: () => void;
  onAddRadio     ?: () => void;
  onAddCheckbox  ?: () => void;
  onAddDate      ?: () => void;
  onAddText       : () => void;
  onAddTable     ?: () => void;
  onAddImage     ?: () => void;
  onAddBarcode   ?: () => void;
  onAddChart     ?: () => void;
  onAddWatermark ?: () => void;
  onAddSignature ?: () => void;
  onAddLine      ?: () => void;
  onAddBox       ?: () => void;
  onAddRectangle ?: () => void;
  onAddTriangle  ?: () => void;
  onAddEllipse   ?: () => void;
  onDelete       ?: () => void;
  onSave         ?: () => void;
  onOpenTemplates?: () => void;
  onLoad         ?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload       ?: () => void;
  onExportPDF    ?: () => void;
  onAddPage      ?: () => void;
  onToggleRulers ?: () => void;
  showRulers     ?: boolean;
  hasSelection   ?: boolean;
  hasElements    ?: boolean;
  onPageSizeChange?: (preset: string) => void;
  onCustomPageSize?: (widthInches: number, heightInches: number) => void;
  currentPageSize ?: string;
  customPageWidth ?: number;
  customPageHeight?: number;
  exportFormat?: 'pdf' | 'zpl' | 'png' | 'jpeg';
  onExportFormatChange?: (format: 'pdf' | 'zpl' | 'png' | 'jpeg') => void;
}

export default function Toolbar({
  onAddParagraph, onAddRadio, onAddCheckbox, onAddDate,
  onAddText, onAddTable, onAddImage, onAddBarcode, onAddChart, onAddWatermark, onAddSignature,
  onAddLine, onAddBox, onAddRectangle, onAddTriangle, onAddEllipse,
  onDelete, onSave, onOpenTemplates, onLoad, onUpload, onExportPDF, onAddPage,
  onToggleRulers, showRulers,
  hasSelection, hasElements,
  onPageSizeChange, currentPageSize,
  onCustomPageSize, customPageWidth, customPageHeight,
  exportFormat, onExportFormatChange,
}: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const hasShapes = onAddLine || onAddBox || onAddRectangle || onAddTriangle || onAddEllipse;

  return (
    <div className="tb" role="toolbar" aria-label="Document toolbar">

      {/* ── Page Size ── */}
      {onPageSizeChange && (
        <>
          <div className="tb-group">
            <PageSizeMenu
              currentPageSize={currentPageSize || 'a4'}
              onSelect={onPageSizeChange}
              onCustomSize={onCustomPageSize}
              customWidth={customPageWidth}
              customHeight={customPageHeight}
            />
          </div>
          <Divider />
        </>
      )}

      {/* ── Elements ── */}
      <div className="tb-group">
        <IconBtn icon={<Icons.Text />}  label="Text"  shortcut="T" onClick={onAddText} />
        {onAddTable && <IconBtn icon={<Icons.Table />} label="Table" shortcut="G" onClick={onAddTable} />}
        {onAddImage && <IconBtn icon={<Icons.Image />} label="Image" shortcut="I" onClick={onAddImage} />}
        {onAddBarcode && <IconBtn icon={<Icons.Barcode />} label="Barcode / QR" shortcut="B" onClick={onAddBarcode} />}
        {onAddChart && <IconBtn icon={<Icons.Chart />} label="Chart" shortcut="C" onClick={onAddChart} />}
        {onAddWatermark && <IconBtn icon={<Icons.Watermark />} label="Watermark" shortcut="W" onClick={onAddWatermark} />}
        {onAddSignature && <IconBtn icon={<Icons.Signature />} label="Digital signature" shortcut="S" onClick={onAddSignature} />}
      </div>

      {/* ── Form ── */}
      {(onAddParagraph || onAddRadio || onAddCheckbox || onAddDate) && (
        <>
          <Divider />
          <div className="tb-group">
            {onAddParagraph && <IconBtn icon={<Icons.Paragraph />} label="Paragraph" onClick={onAddParagraph} />}
            {onAddRadio     && <IconBtn icon={<Icons.Radio />}     label="Radio"     onClick={onAddRadio} />}
            {onAddCheckbox  && <IconBtn icon={<Icons.Checkbox />}  label="Checkbox"  onClick={onAddCheckbox} />}
            {onAddDate      && <IconBtn icon={<Icons.Date />}      label="Date field" onClick={onAddDate} />}
          </div>
        </>
      )}

      {/* ── Shapes ── */}
      {hasShapes && (
        <>
          <Divider />
          <div className="tb-group">
            <ShapesMenu
              onAddLine      ={onAddLine      || (() => {})}
              onAddBox       ={onAddBox       || (() => {})}
              onAddRectangle ={onAddRectangle || (() => {})}
              onAddTriangle  ={onAddTriangle  || (() => {})}
              onAddEllipse   ={onAddEllipse   || (() => {})}
            />
          </div>
        </>
      )}

      {/* ── Pages ── */}
      {onAddPage && (
        <>
          <Divider />
          <div className="tb-group">
            <IconBtn icon={<Icons.AddPage />} label="Add page" shortcut="⌘↵" onClick={onAddPage} variant="page" />
          </div>
        </>
      )}

      {/* ── View ── */}
      {onToggleRulers && (
        <>
          <Divider />
          <div className="tb-group">
            <IconBtn
              icon={<Icons.Ruler />}
              label={showRulers ? 'Hide rulers' : 'Show rulers'}
              shortcut="R"
              onClick={onToggleRulers}
              active={showRulers}
            />
          </div>
        </>
      )}

      {/* ── File actions ── */}
      <Divider />
      <div className="tb-group">
        {onSave && (
          <IconBtn icon={<Icons.Save />} label="Save template" shortcut="⌘S"
            onClick={onSave} disabled={!hasElements} variant="action" />
        )}
        {onOpenTemplates && (
          <IconBtn icon={<Icons.Library />} label="My templates"
            onClick={onOpenTemplates} variant="action" />
        )}
        {onLoad && (
          <>
            <input ref={fileInputRef} type="file" accept=".json"
              onChange={onLoad} style={{ display: 'none' }} />
            <IconBtn icon={<Icons.Load />} label="Load template" shortcut="⌘O"
              onClick={() => fileInputRef.current?.click()} variant="action" />
          </>
        )}
        {onUpload && (
          <IconBtn icon={<Icons.Upload />} label="Upload data file"
            onClick={onUpload} variant="action" />
        )}
      </div>

      {/* ── Export — primary CTA ── */}
      {onExportPDF && (
        <>
          <Divider />
          <div className="tb-group tb-export-group">
            {onExportFormatChange && (
              <div className="tb-format-toggle">
                {(['pdf', 'png', 'jpeg'] as const).map(f => (
                  <button
                    key={f}
                    className={`tb-format-btn ${exportFormat === f ? 'tb-format-btn--active' : ''}`}
                    onClick={() => onExportFormatChange(f)}
                    aria-label={`${f.toUpperCase()} format`}
                  >{f.toUpperCase()}</button>
                ))}
                {/* ZPL only makes sense for thermal/label page sizes */}
                {currentPageSize !== 'a4' && currentPageSize !== 'letter' && (
                  <button
                    className={`tb-format-btn ${exportFormat === 'zpl' ? 'tb-format-btn--active' : ''}`}
                    onClick={() => onExportFormatChange('zpl')}
                    aria-label="ZPL format"
                  >ZPL</button>
                )}
              </div>
            )}
            <Tooltip label={`Export ${exportFormat?.toUpperCase() || 'PDF'}`} shortcut="⌘E">
              <button
                className={`tb-btn tb-btn--primary ${!hasElements ? 'tb-btn--disabled' : ''}`}
                onClick={onExportPDF}
                disabled={!hasElements}
                aria-label={`Export ${exportFormat?.toUpperCase() || 'PDF'}`}
              >
                <Icons.Export />
                <span className="tb-export-label">Export {exportFormat?.toUpperCase() || 'PDF'}</span>
              </button>
            </Tooltip>
          </div>
        </>
      )}

      {/* ── Delete ── */}
      {hasSelection && onDelete && (
        <>
          <Divider />
          <div className="tb-group">
            <IconBtn icon={<Icons.Delete />} label="Delete selected" shortcut="⌫"
              onClick={onDelete} variant="danger" />
          </div>
        </>
      )}

    </div>
  );
}
