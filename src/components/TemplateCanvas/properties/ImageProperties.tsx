/**
 * ImageProperties.tsx
 *
 * Shown when an image (or a digital signature) is selected. Lets the user
 * pick the picture, upload one from their computer, and set its size,
 * how it fits its box, and how see-through it is.
 */

import type React from 'react';
import { notify } from '../../../notify';
import type { ImageElementType, UpdateElement } from './elementTypes';

interface Props {
  element: ImageElementType;
  onUpdate: UpdateElement;
}

function ImageProperties({ element, onUpdate }: Props) {
  const isSignature = element.role === 'signature';

  // Save a change to one field inside the image's "style" object.
  const setStyle = (patch: Partial<ImageElementType['style']>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } });
  };

  // When the user picks a file, read it as a data URL and use it as the source.
  const handleFileChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      notify.error('image.selectImageFile');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) onUpdate(element.id, { src: base64 });
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  return (
    <div className="property-section">
      <div className="property-section-title">
        {isSignature ? 'Digital signature' : 'Image'}
      </div>
      <div className="property-group">
        <label className="property-label">
          {isSignature ? 'Signature Source' : 'Image Source'}
        </label>
        <input
          type="text"
          value={element.src}
          onChange={(e) => onUpdate(element.id, { src: e.target.value })}
          className="property-input"
          placeholder={isSignature ? 'Image URL or {{digital_signature}}' : 'Image URL or {{image_url}}'}
        />
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChosen}
          style={{ display: 'none' }}
          id="image-file-input"
        />
        <button
          className="property-button"
          onClick={() => document.getElementById('image-file-input')?.click()}
        >
          {isSignature ? 'Upload Signature' : 'Upload Image'}
        </button>
      </div>
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
        <label className="property-label">Object Fit</label>
        <select
          value={element.style.objectFit}
          onChange={(e) => setStyle({ objectFit: e.target.value as ImageElementType['style']['objectFit'] })}
          className="property-select"
        >
          <option value="contain">Contain</option>
          <option value="cover">Cover</option>
          <option value="fill">Fill</option>
          <option value="none">None</option>
          <option value="scale-down">Scale Down</option>
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

export default ImageProperties;
