/**
 * CanvasStatusBar.tsx
 *
 * A small, presentational status strip pinned to the bottom-centre of the
 * canvas (Canva-style). It reports the current page count and page size.
 * It holds no state and drives nothing — purely a readout.
 */

import './CanvasStatusBar.css';

interface Props {
  pageCount: number;
  pageSizePreset: string;
  onAddPage?: () => void;
}

const SIZE_LABELS: Record<string, string> = {
  a4: 'A4',
  letter: 'US Letter',
  '4x6': '4×6 Label',
  '4x4': '4×4 Label',
  '3x5': '3×5 Label',
  custom: 'Custom',
};

export default function CanvasStatusBar({ pageCount, pageSizePreset, onAddPage }: Props) {
  const sizeLabel = SIZE_LABELS[pageSizePreset] ?? pageSizePreset.toUpperCase();

  return (
    <div className="canvas-statusbar" role="status" aria-live="polite">
      <span className="canvas-statusbar__item">
        {pageCount} {pageCount === 1 ? 'page' : 'pages'}
      </span>
      <span className="canvas-statusbar__dot" aria-hidden="true" />
      <span className="canvas-statusbar__item">{sizeLabel}</span>
      {onAddPage && (
        <>
          <span className="canvas-statusbar__dot" aria-hidden="true" />
          <button className="canvas-statusbar__add" onClick={onAddPage} title="Add page">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            Add page
          </button>
        </>
      )}
    </div>
  );
}
