/**
 * TypographyProperties.tsx
 *
 * The "Typography" box shown for text and paragraph elements. It sets the
 * font size, weight, family and colour. Plain text elements get a few extra
 * controls (width, opacity, rotation, and alignment) that paragraphs don't.
 */

import FontFamilyOptions from './FontFamilyOptions';
import type { ParagraphElementType, TextElementType, UpdateElement } from './elementTypes';

interface Props {
  element: TextElementType | ParagraphElementType;
  onUpdate: UpdateElement;
}

function TypographyProperties({ element, onUpdate }: Props) {
  // Save a change to one field inside the element's "style" object.
  // The cast keeps TypeScript happy because text and paragraph styles differ.
  const setStyle = (patch: Record<string, unknown>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } } as Partial<TextElementType>);
  };

  return (
    <div className="property-section">
      <div className="property-section-title">Typography</div>
      <div className="property-group">
        <label className="property-label">Font Size</label>
        <input
          type="number"
          value={element.style.fontSize}
          onChange={(e) => setStyle({ fontSize: Number(e.target.value) })}
          className="property-input"
          min="8"
          max="160"
        />
      </div>

      <div className="property-group">
        <label className="property-label">Font Weight</label>
        <select
          value={element.style.fontWeight}
          onChange={(e) => setStyle({ fontWeight: e.target.value })}
          className="property-select"
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
          <option value="lighter">Lighter</option>
        </select>
      </div>

      <div className="property-group">
        <label className="property-label">Font Family</label>
        <select
          value={element.style.fontFamily}
          onChange={(e) => setStyle({ fontFamily: e.target.value })}
          className="property-select"
        >
          <FontFamilyOptions />
        </select>
      </div>

      <div className="property-group">
        <label className="property-label">Color</label>
        <input
          type="color"
          value={element.style.color}
          onChange={(e) => setStyle({ color: e.target.value })}
          className="property-color"
        />
      </div>

      {element.type === 'text' && (
        <>
          <div className="property-grid-two">
            <div className="property-group">
              <label className="property-label">Width (px)</label>
              <input
                type="number"
                value={element.style.width ?? 240}
                onChange={(e) => setStyle({ width: Number(e.target.value) })}
                className="property-input"
                min="50"
                max="794"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Opacity (%)</label>
              <input
                type="number"
                value={element.style.opacity ?? 100}
                onChange={(e) => setStyle({ opacity: Number(e.target.value) })}
                className="property-input"
                min="0"
                max="100"
              />
            </div>
          </div>

          <div className="property-grid-two">
            <div className="property-group">
              <label className="property-label">Rotation (deg)</label>
              <input
                type="number"
                value={element.style.rotation ?? 0}
                onChange={(e) => setStyle({ rotation: Number(e.target.value) })}
                className="property-input"
                min="-180"
                max="180"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Text Align</label>
              <select
                value={element.style.textAlign ?? 'left'}
                onChange={(e) => setStyle({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
                className="property-select"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default TypographyProperties;
