/**
 * ExportMenu.tsx
 *
 * A single primary "Export" button. Clicking it opens a small menu of output
 * formats (PDF / PNG / JPEG, plus ZPL for label sizes); clicking a format
 * exports the document in that format. Replaces the always-visible format
 * toggle so the toolbar stays compact.
 */

import { useEffect, useRef, useState } from 'react';
import { Icons } from './icons';

type Format = 'pdf' | 'png' | 'jpeg' | 'zpl';

interface ExportMenuProps {
  formats: Format[];
  disabled?: boolean;
  onExport: (format: Format) => void;
}

export default function ExportMenu({ formats, disabled, onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="tb-shapes-wrap" ref={ref}>
      <button
        className={`tb-btn tb-btn--primary ${disabled ? 'tb-btn--disabled' : ''}`}
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icons.Export />
        <span className="tb-export-label">Export</span>
        <svg className="tb-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 3.5 5 6l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="tb-shapes-menu tb-export-menu" role="menu">
          <div className="tb-shapes-menu__label">Export as</div>
          {formats.map(f => (
            <button
              key={f}
              className="tb-shapes-item"
              role="menuitem"
              onClick={() => { onExport(f); setOpen(false); }}
            >
              <span>{f.toUpperCase()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
