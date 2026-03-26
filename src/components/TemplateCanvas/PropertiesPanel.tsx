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

type CanvasElement = TextElementType | TableElementType;

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
    onUpdate(selectedElement.id, {
      style: { ...selectedElement.style, fontSize: value },
    });
  };

  const handleFontWeightChange = (value: string) => {
    onUpdate(selectedElement.id, {
      style: { ...selectedElement.style, fontWeight: value },
    });
  };

  const handleColorChange = (value: string) => {
    onUpdate(selectedElement.id, {
      style: { ...selectedElement.style, color: value },
    });
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

