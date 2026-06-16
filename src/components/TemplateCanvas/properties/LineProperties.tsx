/**
 * LineProperties.tsx
 *
 * Shown when a line is selected. Lets the user set which way the line runs,
 * how long and thick it is, its colour, its style (solid/dashed/dotted),
 * and how see-through it is.
 */

import type { LineElementType, UpdateElement } from './elementTypes';

interface Props {
  element: LineElementType;
  onUpdate: UpdateElement;
}

function LineProperties({ element, onUpdate }: Props) {
  // Save a change to one field inside the line's "style" object.
  const setStyle = (patch: Partial<LineElementType['style']>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } });
  };

  return (
    <div className="property-section">
      <div className="property-section-title">Line</div>
      <div className="property-group">
        <label className="property-label">Direction</label>
        <select
          value={element.style.direction}
          onChange={(e) => setStyle({ direction: e.target.value as 'horizontal' | 'vertical' })}
          className="property-select"
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>
      <div className="property-group">
        <label className="property-label">Length (px)</label>
        <input
          type="number"
          value={element.style.length}
          onChange={(e) => setStyle({ length: Number(e.target.value) })}
          className="property-input"
          min="20"
          max="1000"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Thickness (px)</label>
        <input
          type="number"
          value={element.style.thickness}
          onChange={(e) => setStyle({ thickness: Number(e.target.value) })}
          className="property-input"
          min="1"
          max="20"
        />
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
      <div className="property-group">
        <label className="property-label">Style</label>
        <select
          value={element.style.style}
          onChange={(e) => setStyle({ style: e.target.value as 'solid' | 'dashed' | 'dotted' })}
          className="property-select"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
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

export default LineProperties;
