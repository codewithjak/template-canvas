/**
 * ElementQuickBar.tsx
 *
 * A small floating action bar that sits directly above the selected element
 * (Canva-style), carrying quick actions: duplicate and delete. It is rendered
 * inside the page's `.template-canvas` (which is position: relative), so it is
 * positioned in canvas coordinates and moves with the element.
 */

import './ElementQuickBar.css';

interface Props {
  /** Element's canvas coordinates, used to place the bar just above it. */
  x: number;
  y: number;
  canDuplicate: boolean;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function ElementQuickBar({ x, y, canDuplicate, onBringToFront, onSendToBack, onDuplicate, onDelete }: Props) {
  // Prefer to sit above the element; if there's no room, tuck just inside the top.
  const top = y >= 44 ? y - 40 : y + 6;

  return (
    <div
      className="eqb"
      style={{ top, left: Math.max(0, x) }}
      role="toolbar"
      aria-label="Element actions"
      onClick={e => e.stopPropagation()}
    >
      <button className="eqb-btn" onClick={onBringToFront} title="Bring to front" aria-label="Bring to front">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2.5v6M5.5 5 8 2.5 10.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="3" y="9.5" width="10" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      <button className="eqb-btn" onClick={onSendToBack} title="Send to back" aria-label="Send to back">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="3" y="2.5" width="10" height="4" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M8 13.5v-6M5.5 11 8 13.5 10.5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {canDuplicate && (
        <button className="eqb-btn" onClick={onDuplicate} title="Duplicate" aria-label="Duplicate">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5"
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <button className="eqb-btn eqb-btn--danger" onClick={onDelete} title="Delete" aria-label="Delete">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 4.5h10M6.5 4.5V3.2A1 1 0 0 1 7.5 2.2h1a1 1 0 0 1 1 1v1.3M12 4.5l-.6 8.1a1.2 1.2 0 0 1-1.2 1.1H5.8a1.2 1.2 0 0 1-1.2-1.1L4 4.5"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
