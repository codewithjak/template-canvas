import React from 'react';
import StructuresDropdown from './StructuresDropdown';
import './Toolbar.css';

interface ToolbarProps {
  onAddText: () => void;
  onAddTable?: () => void;
  onAddImage?: () => void;
  onAddLine?: () => void;
  onAddBox?: () => void;
  onDelete?: () => void;
  onSave?: () => void;
  onLoad?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  hasSelection?: boolean;
  hasElements?: boolean;
}

function Toolbar({ onAddText, onAddTable, onAddImage, onAddLine, onAddBox, onDelete, onSave, onLoad, hasSelection, hasElements }: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button className="toolbar-button" onClick={onAddText}>
          Add Text
        </button>
        {onAddTable && (
          <button className="toolbar-button" onClick={onAddTable}>
            Add Table
          </button>
        )}
        {onAddImage && (
          <button className="toolbar-button" onClick={onAddImage}>
            Add Image
          </button>
        )}
      </div>
      <div className="toolbar-section">
        {(onAddLine || onAddBox) && (
          <StructuresDropdown
            onAddLine={onAddLine || (() => {})}
            onAddBox={onAddBox || (() => {})}
          />
        )}
      </div>
      <div className="toolbar-section">
        {onSave && (
          <button 
            className="toolbar-button toolbar-button-secondary" 
            onClick={onSave}
            disabled={!hasElements}
            title="Save template as JSON file"
          >
            Save Template
          </button>
        )}
        {onLoad && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={onLoad}
              style={{ display: 'none' }}
            />
            <button 
              className="toolbar-button toolbar-button-secondary" 
              onClick={handleLoadClick}
              title="Load template from JSON file"
            >
              Load Template
            </button>
          </>
        )}
      </div>
      <div className="toolbar-section">
        {hasSelection && onDelete && (
          <button 
            className="toolbar-button toolbar-button-danger" 
            onClick={onDelete}
            title="Delete selected element (Delete key)"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default Toolbar;

