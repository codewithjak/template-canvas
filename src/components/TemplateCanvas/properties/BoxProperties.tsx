/**
 * BoxProperties.tsx
 *
 * Shown when a box (rectangle) is selected. Lets the user set its size,
 * border (width, colour, style), background colour, rounded corners,
 * and how see-through it is.
 */

import type { BoxElementType, UpdateElement } from './elementTypes';

interface Props {
  element: BoxElementType;
  onUpdate: UpdateElement;
}

function BoxProperties({ element, onUpdate }: Props) {
  // Save a change to one field inside the box's "style" object.
  const setStyle = (patch: Partial<BoxElementType['style']>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } });
  };

  return (
    <div className="property-section">
      <div className="property-section-title">Box</div>
      <div className="property-grid-two">
        <div className="property-group">
          <label className="property-label">Width (px)</label>
          <input
            type="number"
            value={element.style.width}
            onChange={(e) => setStyle({ width: Number(e.target.value) })}
            className="property-input"
            min="50"
            max="1000"
          />
        </div>
        <div className="property-group">
          <label className="property-label">Height (px)</label>
          <input
            type="number"
            value={element.style.height}
            onChange={(e) => setStyle({ height: Number(e.target.value) })}
            className="property-input"
            min="50"
            max="1000"
          />
        </div>
      </div>
      <div className="property-group">
        <label className="property-label">Border Width (px)</label>
        <input
          type="number"
          value={element.style.borderWidth}
          onChange={(e) => setStyle({ borderWidth: Number(e.target.value) })}
          className="property-input"
          min="0"
          max="20"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Border Color</label>
        <input
          type="color"
          value={element.style.borderColor}
          onChange={(e) => setStyle({ borderColor: e.target.value })}
          className="property-color"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Border Style</label>
        <select
          value={element.style.borderStyle}
          onChange={(e) => setStyle({ borderStyle: e.target.value as 'solid' | 'dashed' | 'dotted' | 'double' })}
          className="property-select"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
          <option value="double">Double</option>
        </select>
      </div>
      <div className="property-group">
        <label className="property-label">Background Color</label>
        <input
          type="color"
          value={element.style.backgroundColor}
          onChange={(e) => setStyle({ backgroundColor: e.target.value })}
          className="property-color"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Border Radius (px)</label>
        <input
          type="number"
          value={element.style.borderRadius !== undefined ? element.style.borderRadius : 0}
          onChange={(e) => setStyle({ borderRadius: Number(e.target.value) })}
          className="property-input"
          min="0"
          max="50"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Opacity (%)</label>
        <input
          type="number"
          value={element.style.opacity !== undefined ? element.style.opacity : 100}
          onChange={(e) => setStyle({ opacity: Number(e.target.value) })}
          className="property-input"
          min="0"
          max="100"
        />
      </div>
    </div>
  );
}

export default BoxProperties;
