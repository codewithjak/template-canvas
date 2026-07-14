/**
 * TextFormatBar.tsx
 *
 * A Canva-style contextual formatting bar. It appears pinned to the top-centre
 * of the canvas whenever a text or paragraph element is selected, surfacing the
 * most-used typography controls (font, size, bold, colour, alignment) so the
 * user does not have to reach for the side panel for common edits.
 *
 * It writes through the same update handler the Properties panel uses, so it
 * only ever touches fields that already exist on the element's style — nothing
 * new is introduced to the model or the export pipeline.
 */

import FontFamilyOptions from './properties/FontFamilyOptions';
import type { TextElementType, ParagraphElementType, UpdateElement } from './properties/elementTypes';
import FormatBarMore from './FormatBarMore';
import PageNumberProperties from './PageNumberProperties';
import PositionProperties from './properties/PositionProperties';
import type { FooterConfig } from '../../types/canvas';
import './TextFormatBar.css';

interface Props {
  element: TextElementType | ParagraphElementType;
  onUpdate: UpdateElement;
  /**
   * The active page's footer config. A text element that IS a page number, or that
   * sits inside the footer zone, gets the page-number controls behind "⋯" — the
   * third and last case the Properties panel was kept for (relayout doc A5.3).
   */
  activePageFooter?: FooterConfig | null;
}

const MIN_SIZE = 8;
const MAX_SIZE = 160;

const clampSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));

export default function TextFormatBar({ element, onUpdate, activePageFooter = null }: Props) {
  // Patch a single field on the element's style, same shape the panel uses.
  const setStyle = (patch: Record<string, unknown>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } } as Partial<TextElementType>);
  };

  const size   = element.style.fontSize;
  const isBold = element.style.fontWeight === 'bold';
  // Alignment only exists on plain text elements, not paragraphs.
  const align  = (element.type === 'text' ? element.style.textAlign : undefined) ?? 'left';

  // Same rule the panel used: a text element that is already a page number, or one
  // sitting below the footer boundary, can be turned into one.
  const isPageNumber = element.type === 'text' && !!element.pageNumber?.enabled;
  const inFooterZone =
    element.type === 'text' &&
    activePageFooter?.enabled === true &&
    (element.position?.y ?? 0) >= (activePageFooter?.boundaryY ?? Infinity);
  const showPageNumber = isPageNumber || inFooterZone;

  return (
    <div className="tfb" role="toolbar" aria-label="Text formatting">
      {/* Font family */}
      <select
        className="tfb-font"
        value={element.style.fontFamily}
        onChange={e => setStyle({ fontFamily: e.target.value })}
        aria-label="Font family"
      >
        <FontFamilyOptions />
      </select>

      <span className="tfb-divider" />

      {/* Font size stepper */}
      <div className="tfb-size">
        <button className="tfb-step" onClick={() => setStyle({ fontSize: clampSize(size - 1) })}
          aria-label="Decrease font size">−</button>
        <input
          className="tfb-size-input"
          type="number"
          min={MIN_SIZE}
          max={MAX_SIZE}
          value={size}
          onChange={e => setStyle({ fontSize: clampSize(Number(e.target.value) || MIN_SIZE) })}
          aria-label="Font size"
        />
        <button className="tfb-step" onClick={() => setStyle({ fontSize: clampSize(size + 1) })}
          aria-label="Increase font size">+</button>
      </div>

      <span className="tfb-divider" />

      {/* Bold toggle */}
      <button
        className={`tfb-btn ${isBold ? 'tfb-btn--active' : ''}`}
        onClick={() => setStyle({ fontWeight: isBold ? 'normal' : 'bold' })}
        aria-label="Bold"
        aria-pressed={isBold}
      ><b>B</b></button>

      {/* Colour swatch */}
      <label className="tfb-color" title="Text colour">
        <input
          type="color"
          value={element.style.color}
          onChange={e => setStyle({ color: e.target.value })}
          aria-label="Text colour"
        />
      </label>

      {element.type === 'text' && (
        <>
          <span className="tfb-divider" />
          {/* Alignment */}
          <div className="tfb-align">
            {(['left', 'center', 'right'] as const).map(a => (
              <button
                key={a}
                className={`tfb-btn ${align === a ? 'tfb-btn--active' : ''}`}
                onClick={() => setStyle({ textAlign: a })}
                aria-label={`Align ${a}`}
                aria-pressed={align === a}
              >
                <AlignIcon dir={a} />
              </button>
            ))}
          </div>

          <span className="tfb-divider" />
          <div className="tfb-field">
            <span className="tfb-label">W</span>
            <input className="tfb-num" type="number" min={50} max={794}
              value={element.style.width ?? 240}
              onChange={e => setStyle({ width: Number(e.target.value) || 50 })} aria-label="Width" />
          </div>
          <div className="tfb-field">
            <span className="tfb-label">Opacity</span>
            <input className="tfb-num" type="number" min={0} max={100}
              value={element.style.opacity ?? 100}
              onChange={e => setStyle({ opacity: Number(e.target.value) })} aria-label="Opacity" />
          </div>
          <div className="tfb-field">
            <span className="tfb-label">Rotate</span>
            <input className="tfb-num" type="number" min={-180} max={180}
              value={element.style.rotation ?? 0}
              onChange={e => setStyle({ rotation: Number(e.target.value) })} aria-label="Rotation" />
          </div>
        </>
      )}

      {element.type === 'paragraph' && (
        <>
          <span className="tfb-divider" />
          <div className="tfb-field">
            <span className="tfb-label">Line</span>
            <input className="tfb-num" type="number" min={1} max={3} step={0.1}
              value={element.style.lineHeight ?? 1.4}
              onChange={e => setStyle({ lineHeight: Number(e.target.value) || 1 })} aria-label="Line height" />
          </div>
        </>
      )}

      {/* Text direction (LTR/RTL). Re-housed from the deleted TypographyProperties,
          which was the ONLY place it ever existed — and which the Properties panel
          rendered only for page-number text. So RTL was, in practice, unsettable
          from the UI despite the editor shipping full Arabic/bidi support. It
          belongs on the text bar, for every text element. */}
      <span className="tfb-divider" />
      <div className="tfb-field">
        <span className="tfb-label">Dir</span>
        <select
          className="tfb-select"
          value={element.style.direction ?? 'auto'}
          onChange={e => setStyle({ direction: e.target.value as 'ltr' | 'rtl' | 'auto' })}
          aria-label="Text direction"
          title="Auto follows the text's first strong character (Arabic data flips automatically)"
        >
          <option value="auto">Auto</option>
          <option value="ltr">LTR</option>
          <option value="rtl">RTL</option>
        </select>
      </div>

      {/* Page-number settings — re-housed from the Properties panel. */}
      {element.type === 'text' && showPageNumber && (
        <FormatBarMore label="Page number options">
          <PageNumberProperties
            config={element.pageNumber}
            onChange={pn => onUpdate(element.id, { pageNumber: pn } as Partial<TextElementType>)}
          />
          {/* Page-number text had numeric X/Y in the panel — it keeps it. */}
          <PositionProperties element={element} onUpdate={onUpdate} />
        </FormatBarMore>
      )}
    </div>
  );
}

/** Small three-line alignment glyph. */
function AlignIcon({ dir }: { dir: 'left' | 'center' | 'right' }) {
  const rows: Record<typeof dir, [number, number][]> = {
    left:   [[3, 15], [3, 11], [3, 13]],
    center: [[3, 15], [5, 13], [4, 14]],
    right:  [[3, 15], [7, 15], [5, 15]],
  } as Record<typeof dir, [number, number][]>;
  const ys = [5, 9, 13];
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {rows[dir].map(([x1, x2], i) => (
        <line key={i} x1={x1} y1={ys[i]} x2={x2} y2={ys[i]}
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ))}
    </svg>
  );
}
