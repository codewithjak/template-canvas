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

interface PropertiesPanelProps {
  selectedElement: TextElementType | null;
  onUpdate: (id: string, updates: Partial<TextElementType>) => void;
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

  return (
    <div className="properties-panel">
      <div className="properties-panel-header">Properties</div>
      <div className="properties-panel-content">
        <div className="property-group">
          <label className="property-label">Content</label>
          <input
            type="text"
            value={selectedElement.content}
            onChange={(e) => handleContentChange(e.target.value)}
            className="property-input"
          />
        </div>

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

