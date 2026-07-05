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
import './TextFormatBar.css';

interface Props {
  element: TextElementType | ParagraphElementType;
  onUpdate: UpdateElement;
}

const MIN_SIZE = 8;
const MAX_SIZE = 160;

const clampSize = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));

export default function TextFormatBar({ element, onUpdate }: Props) {
  // Patch a single field on the element's style, same shape the panel uses.
  const setStyle = (patch: Record<string, unknown>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } } as Partial<TextElementType>);
  };

  const size   = element.style.fontSize;
  const isBold = element.style.fontWeight === 'bold';
  // Alignment only exists on plain text elements, not paragraphs.
  const align  = (element.type === 'text' ? element.style.textAlign : undefined) ?? 'left';

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
        </>
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
