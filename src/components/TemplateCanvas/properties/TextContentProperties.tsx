/**
 * TextContentProperties.tsx
 *
 * The first box shown when a text element is selected. It only holds the
 * text the user wants to display (or the watermark text). Fonts, size and
 * colour live in a separate "Typography" box.
 */

import type { TextElementType, UpdateElement } from './elementTypes';

interface Props {
  element: TextElementType;
  onUpdate: UpdateElement;
}

function TextContentProperties({ element, onUpdate }: Props) {
  const isWatermark = element.role === 'watermark';

  return (
    <div className="property-section">
      <div className="property-section-title">
        {isWatermark ? 'Watermark' : 'Text'}
      </div>
      <div className="property-group">
        <label className="property-label">
          {isWatermark ? 'Watermark Text' : 'Content'}
        </label>
        <input
          type="text"
          value={element.content}
          onChange={(e) => onUpdate(element.id, { content: e.target.value })}
          className="property-input"
        />
      </div>
    </div>
  );
}

export default TextContentProperties;
