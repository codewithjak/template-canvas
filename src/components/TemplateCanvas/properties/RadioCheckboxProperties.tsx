/**
 * RadioCheckboxProperties.tsx
 *
 * Shown when a radio group or a checkbox group is selected. Lets the user
 * choose whether the items stack up/down or sit side by side, the spacing
 * between them, and how many items there are.
 */

import type { CheckboxElementType, RadioElementType, UpdateElement } from './elementTypes';

interface Props {
  element: RadioElementType | CheckboxElementType;
  onUpdate: UpdateElement;
}

function RadioCheckboxProperties({ element, onUpdate }: Props) {
  return (
    <div className="property-section">
      <div className="property-section-title">Layout</div>
      <div className="property-group">
        <label className="property-label">Orientation</label>
        <select
          value={element.orientation || 'vertical'}
          onChange={(e) => onUpdate(element.id, { orientation: e.target.value as 'horizontal' | 'vertical' })}
          className="property-select"
        >
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
      </div>
      <div className="property-group">
        <label className="property-label">Relative Offset (Padding)</label>
        <input
          type="number"
          value={element.position.relativeOffset || 8}
          onChange={(e) => onUpdate(element.id, { position: { ...element.position, relativeOffset: Number(e.target.value) } })}
          className="property-input"
          min="0"
          max="50"
        />
      </div>
      {element.type === 'checkbox' && (
        <div className="property-group">
          <label className="property-label">Number of Checkboxes</label>
          <input
            type="number"
            value={element.count || 1}
            onChange={(e) => onUpdate(element.id, { count: Number(e.target.value) })}
            className="property-input"
            min="1"
            max="10"
          />
        </div>
      )}
      {element.type === 'radio' && (
        <div className="property-group">
          <label className="property-label">Number of Options</label>
          <input
            type="number"
            value={element.options || 2}
            onChange={(e) => onUpdate(element.id, { options: Number(e.target.value) })}
            className="property-input"
            min="2"
            max="10"
          />
        </div>
      )}
    </div>
  );
}

export default RadioCheckboxProperties;
