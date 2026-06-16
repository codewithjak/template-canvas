/**
 * PageSizeMenu.tsx
 *
 * The toolbar's "Page size" dropdown. It lists a few preset sizes (A4, Letter,
 * label sizes) and a "Custom size…" option where the user types a width and
 * height in inches. Clicking outside closes the menu.
 */

import { useEffect, useRef, useState } from 'react';
import { Icons } from './icons';
import { Tooltip } from './IconButton';

interface PageSizeMenuProps {
  currentPageSize: string;
  onSelect: (preset: string) => void;
  onCustomSize?: (widthInches: number, heightInches: number) => void;
  customWidth?: number;
  customHeight?: number;
}

const PRESETS = [
  { key: 'a4',     label: 'A4',                dim: '8.27 × 11.69″' },
  { key: 'letter', label: 'US Letter',         dim: '8.5 × 11″' },
  { key: '4x6',    label: '4×6 Shipping Label', dim: '4 × 6″' },
  { key: '4x4',    label: '4×4 Label',         dim: '4 × 4″' },
  { key: '3x5',    label: '3×5 Label',         dim: '3 × 5″' },
];

function PageSizeMenu({ currentPageSize, onSelect, onCustomSize, customWidth, customHeight }: PageSizeMenuProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [cw, setCw] = useState(String(customWidth || 4));
  const [ch, setCh] = useState(String(customHeight || 6));
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu (and the custom panel) when clicking outside.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setShowCustom(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Keep the custom inputs in step if the size changes from outside. This is
  // React's recommended way to refresh state from a prop: compare against the
  // value we last saw and adjust during render (no effect needed).
  const [lastWidth, setLastWidth] = useState(customWidth);
  const [lastHeight, setLastHeight] = useState(customHeight);
  if (customWidth !== lastWidth) {
    setLastWidth(customWidth);
    if (customWidth) setCw(String(customWidth));
  }
  if (customHeight !== lastHeight) {
    setLastHeight(customHeight);
    if (customHeight) setCh(String(customHeight));
  }

  // Apply the typed custom size, ignoring anything out of range.
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
          {PRESETS.map(({ key, label, dim }) => (
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

export default PageSizeMenu;
