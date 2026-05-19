/**
 * BoundaryLine.tsx
 *
 * A full-width draggable horizontal guide that marks the header/footer boundary.
 *
 * Visual design:
 *   ◀━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━▶
 *   [HEADER ▼]  or  [FOOTER ▲]   label + drag handle on the left
 *   dashed colored line spanning the full canvas width
 *   Y position badge on the right (shown while dragging)
 *
 * Props:
 *   type         — 'header' | 'footer'
 *   y            — current boundaryY in canvas px
 *   canvasWidth  — canvas width in px (794)
 *   canvasScale  — current zoom scale so drag delta maps correctly
 *   enabled      — controls opacity; disabled lines are faint
 *   onYChange    — called with new Y value as user drags
 *   onClick      — called when user clicks the line (opens properties panel)
 *   onDelete     — called when delete button clicked
 */

import React, { useRef, useCallback } from 'react';
import './BoundaryLine.css';

interface BoundaryLineProps {
  type         : 'header' | 'footer';
  y            : number;
  canvasWidth  : number;
  canvasScale  : number;
  enabled      : boolean;
  onYChange    : (newY: number) => void;
  onClick      : () => void;
  onDelete     : () => void;
}

const HEADER_COLOR = '#6366f1';  // indigo
const FOOTER_COLOR = '#f59e0b';  // amber
const MIN_Y_HEADER = 20;
const MAX_Y_HEADER = 400;        // header can't grow past midpage
const MIN_Y_FOOTER = 723;        // footer must leave room for content
const MAX_Y_FOOTER = 1103;

export const BoundaryLine: React.FC<BoundaryLineProps> = ({
  type,
  y,
  canvasWidth,
  canvasScale,
  enabled,
  onYChange,
  onClick,
  onDelete,
}) => {
  const color     = type === 'header' ? HEADER_COLOR : FOOTER_COLOR;
  const label     = type === 'header' ? '▼ HEADER' : '▲ FOOTER';
  const dragState = useRef<{ startY: number; startBoundary: number } | null>(null);
  const lineRef   = useRef<HTMLDivElement>(null);

  // ── Drag ────────────────────────────────────────────────────────────────

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    dragState.current = { startY: e.clientY, startBoundary: y };

    const onMove = (me: MouseEvent) => {
      if (!dragState.current) return;
      const delta     = (me.clientY - dragState.current.startY) / canvasScale;
      let   newY      = dragState.current.startBoundary + delta;

      if (type === 'header') {
        newY = Math.max(MIN_Y_HEADER, Math.min(MAX_Y_HEADER, newY));
      } else {
        newY = Math.max(MIN_Y_FOOTER, Math.min(MAX_Y_FOOTER, newY));
      }
      onYChange(Math.round(newY));
    };

    const onUp = () => {
      dragState.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',  onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',  onUp);
  }, [y, canvasScale, type, onYChange]);

  // ── Delete (stop propagation so it doesn't also fire onClick) ───────────

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  }, [onDelete]);

  return (
    <div
      ref={lineRef}
      className={`boundary-line boundary-line--${type} ${enabled ? 'boundary-line--enabled' : 'boundary-line--disabled'}`}
      style={{ top: y, width: canvasWidth }}
      onClick={onClick}
      onMouseDown={onMouseDown}
      title={`Drag to resize ${type} zone`}
    >
      {/* Dashed rule */}
      <div className="boundary-line__rule" style={{ borderColor: color }} />

      {/* Left label + handle */}
      <div className="boundary-line__label" style={{ color, borderColor: color }}>
        <span className="boundary-line__drag-icon">⠿</span>
        <span className="boundary-line__text">{label}</span>
      </div>

      {/* Right: Y badge + delete */}
      <div className="boundary-line__right">
        <span className="boundary-line__y-badge" style={{ background: color }}>
          {y}px
        </span>
        <button
          className="boundary-line__delete"
          onClick={handleDelete}
          title={`Remove ${type}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default BoundaryLine;