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
  };
}

interface TableElementType {
  id: string;
  type: 'table';
  data: string[][];
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
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

type CanvasElement = TextElementType | TableElementType | ImageElementType | LineElementType | BoxElementType;

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
}

function PropertiesPanel({ selectedElement, onUpdate }: PropertiesPanelProps) {
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
    if (selectedElement.type === 'text' || selectedElement.type === 'table') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, fontSize: value },
      } as any);
    }
  };

  const handleFontWeightChange = (value: string) => {
    if (selectedElement.type === 'text' || selectedElement.type === 'table') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, fontWeight: value },
      } as any);
    }
  };

  const handleColorChange = (value: string) => {
    if (selectedElement.type === 'text' || selectedElement.type === 'table') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, color: value },
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

  const handleTableDataChange = (rowIndex: number, colIndex: number, value: string) => {
    if (selectedElement.type === 'table') {
      const newData = selectedElement.data.map((row, rIdx) =>
        rIdx === rowIndex
          ? row.map((cell, cIdx) => (cIdx === colIndex ? value : cell))
          : row
      );
      onUpdate(selectedElement.id, { data: newData });
    }
  };

  const handleAddTableRow = () => {
    if (selectedElement.type === 'table' && selectedElement.data.length > 0) {
      const newRow = new Array(selectedElement.data[0].length).fill('');
      onUpdate(selectedElement.id, { data: [...selectedElement.data, newRow] });
    }
  };

  const handleAddTableColumn = () => {
    if (selectedElement.type === 'table') {
      const newData = selectedElement.data.map((row) => [...row, '']);
      onUpdate(selectedElement.id, { data: newData });
    }
  };

  const handleRemoveTableRow = (rowIndex: number) => {
    if (selectedElement.type === 'table' && selectedElement.data.length > 1) {
      const newData = selectedElement.data.filter((_, idx) => idx !== rowIndex);
      onUpdate(selectedElement.id, { data: newData });
    }
  };

  const handleRemoveTableColumn = (colIndex: number) => {
    if (selectedElement.type === 'table' && selectedElement.data[0] && selectedElement.data[0].length > 1) {
      const newData = selectedElement.data.map((row) => row.filter((_, idx) => idx !== colIndex));
      onUpdate(selectedElement.id, { data: newData });
    }
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
      <div className="properties-panel-header">Properties</div>
      <div className="properties-panel-content">
        {selectedElement.type === 'text' ? (
          <>
            <div className="property-group">
              <label className="property-label">Content</label>
              <input
                type="text"
                value={selectedElement.content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="property-input"
              />
            </div>
          </>
        ) : selectedElement.type === 'image' ? (
          <>
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
                style={{ marginTop: '8px', width: '100%' }}
              >
                Upload Image
              </button>
            </div>
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
          </>
        ) : selectedElement.type === 'line' ? (
          <>
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
          </>
        ) : selectedElement.type === 'box' ? (
          <>
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
          </>
        ) : (
          <>
            <div className="property-group">
              <label className="property-label">Table Data</label>
              <div className="table-editor">
                <table className="table-editor-table">
                  <tbody>
                    {selectedElement.data.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, colIndex) => (
                          <td key={colIndex}>
                            <input
                              type="text"
                              value={cell}
                              onChange={(e) => handleTableDataChange(rowIndex, colIndex, e.target.value)}
                              className="table-editor-cell"
                              placeholder={`Row ${rowIndex + 1}, Col ${colIndex + 1}`}
                            />
                          </td>
                        ))}
                        <td className="table-editor-actions">
                          <button
                            className="table-editor-button"
                            onClick={() => handleRemoveTableRow(rowIndex)}
                            disabled={selectedElement.data.length <= 1}
                            title="Remove row"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      {selectedElement.data[0]?.map((_, colIndex) => (
                        <td key={colIndex} className="table-editor-actions">
                          <button
                            className="table-editor-button"
                            onClick={() => handleRemoveTableColumn(colIndex)}
                            disabled={selectedElement.data[0] && selectedElement.data[0].length <= 1}
                            title="Remove column"
                          >
                            ×
                          </button>
                        </td>
                      ))}
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                <div className="table-editor-controls">
                  <button className="table-editor-button-add" onClick={handleAddTableRow}>
                    + Add Row
                  </button>
                  <button className="table-editor-button-add" onClick={handleAddTableColumn}>
                    + Add Column
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {(selectedElement.type === 'text' || selectedElement.type === 'table') && (
          <>
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
              <label className="property-label">Color</label>
              <input
                type="color"
                value={selectedElement.style.color}
                onChange={(e) => handleColorChange(e.target.value)}
                className="property-color"
              />
            </div>
          </>
        )}

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
  );
}

export default PropertiesPanel;

