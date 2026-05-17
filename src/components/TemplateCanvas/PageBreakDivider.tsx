/**
 * PageBreakDivider.tsx
 * Visual divider rendered between canvas pages.
 * Shows page number, repeat-header toggle, and delete button.
 * Clicking the divider selects it and reveals its settings inline.
 */

import React from 'react';
import type { CanvasPage } from '../../types/canvas';
import './PageBreakDivider.css';

interface PageBreakDividerProps {
  /** 1-based display number of the page BELOW this divider */
  pageNumber           : number;
  page                 : CanvasPage;
  isSelected           : boolean;
  canDelete            : boolean;   // false when only 2 pages remain (can't delete to 0)
  onSelect             : () => void;
  onDeselect           : () => void;
  onDelete             : () => void;
  onToggleRepeatHeader : (val: boolean) => void;
  onLabelChange        : (label: string) => void;
}

const PageBreakDivider: React.FC<PageBreakDividerProps> = ({
  pageNumber,
  page,
  isSelected,
  canDelete,
  onSelect,
  onDeselect,
  onDelete,
  onToggleRepeatHeader,
  onLabelChange,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected) onDeselect();
    else onSelect();
  };

  return (
    <div
      className={`page-break-divider ${isSelected ? 'page-break-divider--selected' : ''}`}
      onClick={handleClick}
      role="separator"
      aria-label={`Page break before page ${pageNumber}`}
    >
      {/* ── Left line ── */}
      <div className="page-break-line" />

      {/* ── Centre badge + settings ── */}
      <div className="page-break-centre">
        <div className="page-break-badge">
          <span className="page-break-icon">⊞</span>
          <span>Page {pageNumber}</span>
          <span className="page-break-chevron">{isSelected ? '▲' : '▼'}</span>
        </div>

        {isSelected && (
          <div
            className="page-break-settings"
            onClick={e => e.stopPropagation()}
          >
            {/* Page label */}
            <label className="page-break-field">
              <span className="page-break-field-label">Page label</span>
              <input
                className="page-break-input"
                type="text"
                value={page.label}
                onChange={e => onLabelChange(e.target.value)}
                placeholder="e.g. Cover, Orders, Summary"
              />
            </label>

            {/* Repeat header toggle */}
            <label className="page-break-field page-break-field--toggle">
              <span className="page-break-field-label">
                Repeat header on overflow pages
                <span className="page-break-hint">
                  Elements above the first table on this page will repeat
                  on every continuation PDF page.
                </span>
              </span>
              <div
                className={`toggle-switch ${page.repeatHeader ? 'toggle-switch--on' : ''}`}
                onClick={() => onToggleRepeatHeader(!page.repeatHeader)}
                role="switch"
                aria-checked={page.repeatHeader}
              >
                <div className="toggle-knob" />
              </div>
            </label>

            {/* Delete page */}
            {canDelete && (
              <button
                className="page-break-delete-btn"
                onClick={onDelete}
                type="button"
              >
                🗑 Delete this page
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Right line ── */}
      <div className="page-break-line" />
    </div>
  );
};

export default PageBreakDivider;