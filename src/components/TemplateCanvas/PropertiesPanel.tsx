import './PropertiesPanel.css';

interface TextElementType {
  id: string;
  type: 'text';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
}

interface ImageElementType {
  id: string;
  type: 'image';
  src: string;
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    opacity?: number;
  };
}

interface LineElementType {
  id: string;
  type: 'line';
  position: { x: number; y: number };
  style: {
    length: number;
    thickness: number;
    direction: 'horizontal' | 'vertical';
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
    opacity?: number;
  };
}

interface BoxElementType {
  id: string;
  type: 'box';
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    borderWidth: number;
    borderColor: string;
    borderStyle: 'solid' | 'dashed' | 'dotted' | 'double';
    backgroundColor: string;
    opacity?: number;
    borderRadius?: number;
  };
}

interface ParagraphElementType {
  id: string;
  type: 'paragraph';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    lineHeight?: number;
  };
}

interface RadioElementType {
  id: string;
  type: 'radio';
  options: number;
  selected?: string;
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

interface CheckboxElementType {
  id: string;
  type: 'checkbox';
  count?: number;
  checkedValues?: string[];
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

interface DateElementType {
  id: string;
  type: 'date';
  value?: string;
  time?: string;
  includeTime?: boolean;
  format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD Mon YYYY';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
}

type CanvasElement = TextElementType | ImageElementType | LineElementType | BoxElementType | ParagraphElementType | RadioElementType | CheckboxElementType | DateElementType;

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
}

function PropertiesPanel({
  selectedElement,
  onUpdate,
}: PropertiesPanelProps) {
  if (!selectedElement) {
    return (
      <div className="properties-panel">
        <div className="properties-panel-header">Properties</div>
        <div className="properties-panel-empty">
          No element selected
        </div>
      </div>
    );
  }

  const handleContentChange = (value: string) => {
    onUpdate(selectedElement.id, { content: value });
  };

  const handleFontSizeChange = (value: number) => {
    if (selectedElement.type === 'text' || selectedElement.type === 'paragraph') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, fontSize: value },
      } as any);
    }
  };

  const handleFontWeightChange = (value: string) => {
    if (selectedElement.type === 'text' || selectedElement.type === 'paragraph') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, fontWeight: value },
      } as any);
    }
  };

  const handleColorChange = (value: string) => {
    if (selectedElement.type === 'text' || selectedElement.type === 'paragraph') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, color: value },
      } as any);
    }
  };

  const handleFontFamilyChange = (value: string) => {
    if (selectedElement.type === 'text' || selectedElement.type === 'paragraph') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, fontFamily: value },
      } as any);
    }
  };

  const handlePositionXChange = (value: number) => {
    onUpdate(selectedElement.id, {
      position: { ...selectedElement.position, x: value },
    });
  };

  const handlePositionYChange = (value: number) => {
    onUpdate(selectedElement.id, {
      position: { ...selectedElement.position, y: value },
    });
  };

  const handleImageSrcChange = (value: string) => {
    if (selectedElement.type === 'image') {
      onUpdate(selectedElement.id, { src: value });
    }
  };

  const handleImageWidthChange = (value: number) => {
    if (selectedElement.type === 'image') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, width: value },
      });
    }
  };

  const handleImageHeightChange = (value: number) => {
    if (selectedElement.type === 'image') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, height: value },
      });
    }
  };

  const handleObjectFitChange = (value: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down') => {
    if (selectedElement.type === 'image') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, objectFit: value },
      });
    }
  };

  const handleOpacityChange = (value: number) => {
    if (selectedElement.type === 'image') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, opacity: value },
      });
    }
  };

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || selectedElement.type !== 'image') return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        handleImageSrcChange(base64);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  // Line element handlers
  const handleLineLengthChange = (value: number) => {
    if (selectedElement.type === 'line') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, length: value },
      });
    }
  };

  const handleLineThicknessChange = (value: number) => {
    if (selectedElement.type === 'line') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, thickness: value },
      });
    }
  };

  const handleLineDirectionChange = (value: 'horizontal' | 'vertical') => {
    if (selectedElement.type === 'line') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, direction: value },
      });
    }
  };

  const handleLineColorChange = (value: string) => {
    if (selectedElement.type === 'line') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, color: value },
      });
    }
  };

  const handleLineStyleChange = (value: 'solid' | 'dashed' | 'dotted') => {
    if (selectedElement.type === 'line') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, style: value },
      });
    }
  };

  const handleLineOpacityChange = (value: number) => {
    if (selectedElement.type === 'line') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, opacity: value },
      });
    }
  };

  // Box element handlers
  const handleBoxWidthChange = (value: number) => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, width: value },
      });
    }
  };

  const handleBoxHeightChange = (value: number) => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, height: value },
      });
    }
  };

  const handleBoxBorderWidthChange = (value: number) => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, borderWidth: value },
      });
    }
  };

  const handleBoxBorderColorChange = (value: string) => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, borderColor: value },
      });
    }
  };

  const handleBoxBorderStyleChange = (value: 'solid' | 'dashed' | 'dotted' | 'double') => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, borderStyle: value },
      });
    }
  };

  const handleBoxBackgroundColorChange = (value: string) => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, backgroundColor: value },
      });
    }
  };

  const handleBoxBorderRadiusChange = (value: number) => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, borderRadius: value },
      });
    }
  };

  const handleBoxOpacityChange = (value: number) => {
    if (selectedElement.type === 'box') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, opacity: value },
      });
    }
  };

  return (
    <div className="properties-panel">
      <div className="properties-panel-header">
        Properties
        <span className="panel-type-label">{selectedElement.type}</span>
      </div>
      <div className="properties-panel-content">
        {selectedElement.type === 'text' ? (
          <div className="property-section">
            <div className="property-section-title">Text</div>
            <div className="property-group">
              <label className="property-label">Content</label>
              <input
                type="text"
                value={selectedElement.content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="property-input"
              />
            </div>
          </div>
        ) : selectedElement.type === 'image' ? (
          <div className="property-section">
            <div className="property-section-title">Image</div>
            <div className="property-group">
              <label className="property-label">Image Source</label>
              <input
                type="text"
                value={selectedElement.src}
                onChange={(e) => handleImageSrcChange(e.target.value)}
                className="property-input"
                placeholder="Image URL or {{image_url}}"
              />
              <input
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                style={{ display: 'none' }}
                id="image-file-input"
              />
              <button
                className="property-button"
                onClick={() => document.getElementById('image-file-input')?.click()}
              >
                Upload Image
              </button>
            </div>
            <div className="property-grid-two">
              <div className="property-group">
                <label className="property-label">Width (px)</label>
                <input
                  type="number"
                  value={selectedElement.style.width}
                  onChange={(e) => handleImageWidthChange(Number(e.target.value))}
                  className="property-input"
                  min="50"
                  max="1000"
                />
              </div>
              <div className="property-group">
                <label className="property-label">Height (px)</label>
                <input
                  type="number"
                  value={selectedElement.style.height}
                  onChange={(e) => handleImageHeightChange(Number(e.target.value))}
                  className="property-input"
                  min="50"
                  max="1000"
                />
              </div>
            </div>
            <div className="property-group">
              <label className="property-label">Object Fit</label>
              <select
                value={selectedElement.style.objectFit}
                onChange={(e) => handleObjectFitChange(e.target.value as ImageElementType['style']['objectFit'])}
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
                value={selectedElement.style.opacity !== undefined ? selectedElement.style.opacity : 100}
                onChange={(e) => handleOpacityChange(Number(e.target.value))}
                className="property-input"
                min="0"
                max="100"
              />
            </div>
          </div>
        ) : selectedElement.type === 'line' ? (
          <div className="property-section">
            <div className="property-section-title">Line</div>
            <div className="property-group">
              <label className="property-label">Direction</label>
              <select
                value={selectedElement.style.direction}
                onChange={(e) => handleLineDirectionChange(e.target.value as 'horizontal' | 'vertical')}
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
                value={selectedElement.style.length}
                onChange={(e) => handleLineLengthChange(Number(e.target.value))}
                className="property-input"
                min="20"
                max="1000"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Thickness (px)</label>
              <input
                type="number"
                value={selectedElement.style.thickness}
                onChange={(e) => handleLineThicknessChange(Number(e.target.value))}
                className="property-input"
                min="1"
                max="20"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Color</label>
              <input
                type="color"
                value={selectedElement.style.color}
                onChange={(e) => handleLineColorChange(e.target.value)}
                className="property-color"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Style</label>
              <select
                value={selectedElement.style.style}
                onChange={(e) => handleLineStyleChange(e.target.value as 'solid' | 'dashed' | 'dotted')}
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
                value={selectedElement.style.opacity !== undefined ? selectedElement.style.opacity : 100}
                onChange={(e) => handleLineOpacityChange(Number(e.target.value))}
                className="property-input"
                min="0"
                max="100"
              />
            </div>
          </div>
        ) : selectedElement.type === 'box' ? (
          <div className="property-section">
            <div className="property-section-title">Box</div>
            <div className="property-grid-two">
              <div className="property-group">
                <label className="property-label">Width (px)</label>
                <input
                  type="number"
                  value={selectedElement.style.width}
                  onChange={(e) => handleBoxWidthChange(Number(e.target.value))}
                  className="property-input"
                  min="50"
                  max="1000"
                />
              </div>
              <div className="property-group">
                <label className="property-label">Height (px)</label>
                <input
                  type="number"
                  value={selectedElement.style.height}
                  onChange={(e) => handleBoxHeightChange(Number(e.target.value))}
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
                value={selectedElement.style.borderWidth}
                onChange={(e) => handleBoxBorderWidthChange(Number(e.target.value))}
                className="property-input"
                min="0"
                max="20"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Border Color</label>
              <input
                type="color"
                value={selectedElement.style.borderColor}
                onChange={(e) => handleBoxBorderColorChange(e.target.value)}
                className="property-color"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Border Style</label>
              <select
                value={selectedElement.style.borderStyle}
                onChange={(e) => handleBoxBorderStyleChange(e.target.value as 'solid' | 'dashed' | 'dotted' | 'double')}
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
                value={selectedElement.style.backgroundColor}
                onChange={(e) => handleBoxBackgroundColorChange(e.target.value)}
                className="property-color"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Border Radius (px)</label>
              <input
                type="number"
                value={selectedElement.style.borderRadius !== undefined ? selectedElement.style.borderRadius : 0}
                onChange={(e) => handleBoxBorderRadiusChange(Number(e.target.value))}
                className="property-input"
                min="0"
                max="50"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Opacity (%)</label>
              <input
                type="number"
                value={selectedElement.style.opacity !== undefined ? selectedElement.style.opacity : 100}
                onChange={(e) => handleBoxOpacityChange(Number(e.target.value))}
                className="property-input"
                min="0"
                max="100"
              />
            </div>
          </div>
        ) : null}

        {(selectedElement.type === 'radio' || selectedElement.type === 'checkbox') && (
          <div className="property-section">
            <div className="property-section-title">Layout</div>
            <div className="property-group">
              <label className="property-label">Orientation</label>
              <select
                value={selectedElement.orientation || 'vertical'}
                onChange={(e) => onUpdate(selectedElement.id, { orientation: e.target.value as 'horizontal' | 'vertical' })}
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
                value={selectedElement.position.relativeOffset || 8}
                onChange={(e) => onUpdate(selectedElement.id, { position: { ...selectedElement.position, relativeOffset: Number(e.target.value) } })}
                className="property-input"
                min="0"
                max="50"
              />
            </div>
            {selectedElement.type === 'checkbox' && (
              <div className="property-group">
                <label className="property-label">Number of Checkboxes</label>
                <input
                  type="number"
                  value={selectedElement.count || 1}
                  onChange={(e) => onUpdate(selectedElement.id, { count: Number(e.target.value) })}
                  className="property-input"
                  min="1"
                  max="10"
                />
              </div>
            )}
            {selectedElement.type === 'radio' && (
              <div className="property-group">
                <label className="property-label">Number of Options</label>
                <input
                  type="number"
                  value={selectedElement.options || 2}
                  onChange={(e) => onUpdate(selectedElement.id, { options: Number(e.target.value) })}
                  className="property-input"
                  min="2"
                  max="10"
                />
              </div>
            )}
          </div>
        )}

        {(selectedElement.type === 'text' || selectedElement.type === 'paragraph') && (
          <div className="property-section">
            <div className="property-section-title">Typography</div>
            <div className="property-group">
              <label className="property-label">Font Size</label>
              <input
                type="number"
                value={selectedElement.style.fontSize}
                onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                className="property-input"
                min="8"
                max="72"
              />
            </div>

            <div className="property-group">
              <label className="property-label">Font Weight</label>
              <select
                value={selectedElement.style.fontWeight}
                onChange={(e) => handleFontWeightChange(e.target.value)}
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
                value={selectedElement.style.fontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                className="property-select"
              >
                <option value="Arial, sans-serif">Arial</option>
                <option value="Helvetica, sans-serif">Helvetica</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Courier New', monospace">Courier New</option>
                <option value="Verdana, sans-serif">Verdana</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                <option value="Impact, sans-serif">Impact</option>
                <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                <option value="'Lucida Console', monospace">Lucida Console</option>
                <option value="Tahoma, sans-serif">Tahoma</option>
                <option value="'Palatino Linotype', serif">Palatino Linotype</option>
                <option value="'Garamond', serif">Garamond</option>
                <option value="'Book Antiqua', serif">Book Antiqua</option>
                <option value="'Century Gothic', sans-serif">Century Gothic</option>
                <option value="'Lucida Sans Unicode', sans-serif">Lucida Sans Unicode</option>
              </select>
            </div>

            <div className="property-group">
              <label className="property-label">Color</label>
              <input
                type="color"
                value={selectedElement.style.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="property-color"
              />
            </div>
          </div>
        )}

        <div className="property-section">
          <div className="property-section-title">Position</div>
          <div className="property-grid-two">
            <div className="property-group">
              <label className="property-label">Position X</label>
              <input
                type="number"
                value={Math.round(selectedElement.position.x)}
                onChange={(e) => handlePositionXChange(Number(e.target.value))}
                className="property-input"
                min="0"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Position Y</label>
              <input
                type="number"
                value={Math.round(selectedElement.position.y)}
                onChange={(e) => handlePositionYChange(Number(e.target.value))}
                className="property-input"
                min="0"
              />
            </div>
          </div>
        </div>

        {selectedElement.type === 'date' && (
          <div className="property-section">
            <div className="property-section-title">Date Properties</div>
            <div className="property-group">
              <label className="property-label">Include Time</label>
              <input
                type="checkbox"
                checked={selectedElement.includeTime || false}
                onChange={(e) => onUpdate(selectedElement.id, { includeTime: e.target.checked })}
                className="property-checkbox"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Date Value</label>
              <input
                type="date"
                value={selectedElement.value || ''}
                onChange={(e) => onUpdate(selectedElement.id, { value: e.target.value })}
                className="property-input"
              />
            </div>
            {(selectedElement.includeTime || false) && (
              <div className="property-group">
                <label className="property-label">Time Value</label>
                <input
                  type="time"
                  value={selectedElement.time || ''}
                  onChange={(e) => onUpdate(selectedElement.id, { time: e.target.value })}
                  className="property-input"
                />
              </div>
            )}
            <div className="property-group">
              <label className="property-label">Date Format</label>
              <select
                value={selectedElement.format || 'MM/DD/YYYY'}
                onChange={(e) => onUpdate(selectedElement.id, { format: e.target.value as 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD Mon YYYY' })}
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
        )}

        {selectedElement.type === 'date' && (
          <div className="property-section">
            <div className="property-section-title">Typography</div>
            <div className="property-group">
              <label className="property-label">Font Size</label>
              <input
                type="number"
                value={selectedElement.style.fontSize}
                onChange={(e) => onUpdate(selectedElement.id, { style: { ...selectedElement.style, fontSize: Number(e.target.value) } })}
                className="property-input"
                min="8"
                max="72"
              />
            </div>

            <div className="property-group">
              <label className="property-label">Font Weight</label>
              <select
                value={selectedElement.style.fontWeight}
                onChange={(e) => onUpdate(selectedElement.id, { style: { ...selectedElement.style, fontWeight: e.target.value } })}
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
                value={selectedElement.style.fontFamily}
                onChange={(e) => onUpdate(selectedElement.id, { style: { ...selectedElement.style, fontFamily: e.target.value } })}
                className="property-select"
              >
                <option value="Arial, sans-serif">Arial</option>
                <option value="Helvetica, sans-serif">Helvetica</option>
                <option value="'Times New Roman', serif">Times New Roman</option>
                <option value="Georgia, serif">Georgia</option>
                <option value="'Courier New', monospace">Courier New</option>
                <option value="Verdana, sans-serif">Verdana</option>
                <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                <option value="Impact, sans-serif">Impact</option>
                <option value="'Comic Sans MS', cursive">Comic Sans MS</option>
                <option value="'Lucida Console', monospace">Lucida Console</option>
                <option value="Tahoma, sans-serif">Tahoma</option>
                <option value="'Palatino Linotype', serif">Palatino Linotype</option>
                <option value="'Garamond', serif">Garamond</option>
                <option value="'Book Antiqua', serif">Book Antiqua</option>
                <option value="'Century Gothic', sans-serif">Century Gothic</option>
                <option value="'Lucida Sans Unicode', sans-serif">Lucida Sans Unicode</option>
              </select>
            </div>

            <div className="property-group">
              <label className="property-label">Color</label>
              <input
                type="color"
                value={selectedElement.style.color}
                onChange={(e) => onUpdate(selectedElement.id, { style: { ...selectedElement.style, color: e.target.value } })}
                className="property-color"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PropertiesPanel;

