/**
 * DateProperties.tsx
 *
 * The "Date Properties" box shown when a date element is selected. It lets
 * the user pick the date, optionally include a time, and choose how the
 * date is written (the format).
 */

import type { DateElementType, UpdateElement } from './elementTypes';

interface Props {
  element: DateElementType;
  onUpdate: UpdateElement;
}

function DateProperties({ element, onUpdate }: Props) {
  const showTime = element.includeTime || false;

  return (
    <div className="property-section">
      <div className="property-section-title">Date Properties</div>
      <div className="property-group">
        <label className="property-label">Include Time</label>
        <input
          type="checkbox"
          checked={showTime}
          onChange={(e) => onUpdate(element.id, { includeTime: e.target.checked })}
          className="property-checkbox"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Date Value</label>
        <input
          type="date"
          value={element.value || ''}
          onChange={(e) => onUpdate(element.id, { value: e.target.value })}
          className="property-input"
        />
      </div>
      {showTime && (
        <div className="property-group">
          <label className="property-label">Time Value</label>
          <input
            type="time"
            value={element.time || ''}
            onChange={(e) => onUpdate(element.id, { time: e.target.value })}
            className="property-input"
          />
        </div>
      )}
      <div className="property-group">
        <label className="property-label">Date Format</label>
        <select
          value={element.format || 'MM/DD/YYYY'}
          onChange={(e) => onUpdate(element.id, { format: e.target.value as DateElementType['format'] })}
          className="property-select"
        >
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="YYYY-MM-DD">YYYY-MM-DD</option>
          <option value="MMM DD, YYYY">MMM DD, YYYY</option>
          <option value="DD Mon YYYY">DD Mon YYYY</option>
        </select>
      </div>
    </div>
  );
}

export default DateProperties;
