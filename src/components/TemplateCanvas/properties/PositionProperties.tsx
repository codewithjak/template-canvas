/**
 * PositionProperties.tsx
 *
 * The "Position" box shown for every element. It sets where the element
 * sits on the page: X is the distance from the left, Y from the top.
 */

import type { CanvasElement, UpdateElement } from './elementTypes';

interface Props {
  element: CanvasElement;
  onUpdate: UpdateElement;
}

function PositionProperties({ element, onUpdate }: Props) {
  return (
    <div className="property-section">
      <div className="property-section-title">Position</div>
      <div className="property-grid-two">
        <div className="property-group">
          <label className="property-label">X</label>
          <input
            type="number"
            value={Math.round(element.position.x)}
            onChange={(e) => onUpdate(element.id, { position: { ...element.position, x: Number(e.target.value) } })}
            className="property-input"
            min="0"
          />
        </div>
        <div className="property-group">
          <label className="property-label">Y</label>
          <input
            type="number"
            value={Math.round(element.position.y)}
            onChange={(e) => onUpdate(element.id, { position: { ...element.position, y: Number(e.target.value) } })}
            className="property-input"
            min="0"
          />
        </div>
      </div>
    </div>
  );
}

export default PositionProperties;
