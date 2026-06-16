/**
 * BarcodeProperties.tsx
 *
 * Shown when a barcode is selected. The barcode's value can either come from
 * a data field (written as "{{field_name}}") or be a custom value the user
 * types in. This box lets the user pick the field or type a value, choose the
 * barcode format, show/hide the text, and set the size.
 */

import type { BarcodeElementType, UpdateElement } from './elementTypes';

interface Props {
  element: BarcodeElementType;
  onUpdate: UpdateElement;
  /** Field names from the template, offered in the "Data Field" dropdown. */
  staticPlaceholders: string[];
}

// A value like "{{customer_id}}" means "use the customer_id field".
// This special value means "the user typed a custom value instead".
const CUSTOM = '__custom__';

function BarcodeProperties({ element, onUpdate, staticPlaceholders }: Props) {
  // Figure out whether the content is a "{{field}}" placeholder or custom text.
  const placeholderMatch = element.content.match(/^\{\{(.+?)\}\}$/);
  const currentField = placeholderMatch ? placeholderMatch[1].trim() : CUSTOM;
  const customValue = placeholderMatch ? '' : element.content;

  // Save a change to one field inside the barcode's "barcode" settings.
  const setBarcode = (patch: Partial<BarcodeElementType['barcode']>) => {
    onUpdate(element.id, { barcode: { ...element.barcode, ...patch } });
  };

  // Save a change to one field inside the barcode's "style" object.
  const setStyle = (patch: Partial<BarcodeElementType['style']>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } });
  };

  // The current field may not be in the list (e.g. the barcode's own default),
  // so add it as an extra option when that happens.
  const showCurrentFieldOption =
    currentField !== CUSTOM && !staticPlaceholders.includes(currentField);

  return (
    <div className="property-section">
      <div className="property-section-title">Barcode Properties</div>
      <div className="property-group">
        <label className="property-label">Data Field</label>
        <select
          value={currentField}
          onChange={(e) => {
            const val = e.target.value;
            onUpdate(element.id, { content: val === CUSTOM ? '' : `{{${val}}}` });
          }}
          className="property-select"
        >
          {staticPlaceholders.map((field) => (
            <option key={field} value={field}>{field}</option>
          ))}
          {showCurrentFieldOption && (
            <option key={currentField} value={currentField}>{currentField}</option>
          )}
          <option value={CUSTOM}>Custom value…</option>
        </select>
      </div>
      {currentField === CUSTOM && (
        <div className="property-group">
          <label className="property-label">Custom Value</label>
          <input
            type="text"
            value={customValue || element.content}
            onChange={(e) => onUpdate(element.id, { content: e.target.value })}
            className="property-input"
            placeholder="Enter barcode value…"
          />
        </div>
      )}
      <div className="property-group">
        <label className="property-label">Format</label>
        <select
          value={element.barcode.format}
          onChange={(e) => setBarcode({ format: e.target.value as BarcodeElementType['barcode']['format'] })}
          className="property-select"
        >
          <option value="code128">Code 128</option>
          <option value="code39">Code 39</option>
          <option value="qrcode">QR Code</option>
          <option value="ean13">EAN-13</option>
          <option value="upca">UPC-A</option>
          <option value="itf14">ITF-14</option>
        </select>
      </div>
      <div className="property-group">
        <label className="property-label">Show Text</label>
        <input
          type="checkbox"
          checked={element.barcode.showText}
          onChange={(e) => setBarcode({ showText: e.target.checked })}
          className="property-checkbox"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Width</label>
        <input
          type="number"
          min={20}
          max={1000}
          value={element.style.width}
          onChange={(e) => setStyle({ width: Number(e.target.value) })}
          className="property-input"
        />
      </div>
      <div className="property-group">
        <label className="property-label">Height</label>
        <input
          type="number"
          min={20}
          max={1000}
          value={element.style.height}
          onChange={(e) => setStyle({ height: Number(e.target.value) })}
          className="property-input"
        />
      </div>
    </div>
  );
}

export default BarcodeProperties;
