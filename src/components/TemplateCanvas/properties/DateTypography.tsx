/**
 * DateTypography.tsx
 *
 * The "Typography" box shown for a date element. It sets the font size,
 * weight, family and colour used to draw the date text.
 */

import FontFamilyOptions from './FontFamilyOptions';
import type { DateElementType, UpdateElement } from './elementTypes';

interface Props {
  element: DateElementType;
  onUpdate: UpdateElement;
}

function DateTypography({ element, onUpdate }: Props) {
  // Save a change to one field inside the date's "style" object.
  const setStyle = (patch: Partial<DateElementType['style']>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } });
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
          max="72"
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
    </div>
  );
}

export default DateTypography;
