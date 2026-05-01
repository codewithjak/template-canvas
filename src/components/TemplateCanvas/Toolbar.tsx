import React from 'react';
import StructuresDropdown from './StructuresDropdown';
import './Toolbar.css';

interface ToolbarProps {
  onAddParagraph?: () => void;
  onAddRadio?: () => void;
  onAddCheckbox?: () => void;
  onAddDate?: () => void;
  onAddText: () => void;
  onAddTable?: () => void;
  onAddImage?: () => void;
  onAddLine?: () => void;
  onAddBox?: () => void;
  onAddRectangle?: () => void;
  onAddTriangle?: () => void;
  onAddEllipse?: () => void;
  onDelete?: () => void;
  onSave?: () => void;
  onLoad?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload?: () => void;
  onExportPDF?: () => void;
  hasSelection?: boolean;
  hasElements?: boolean;
}

function Toolbar({ onAddParagraph, onAddRadio, onAddCheckbox, onAddDate, onAddText, onAddTable, onAddImage, onAddLine, onAddBox, onAddRectangle, onAddTriangle, onAddEllipse, onDelete, onSave, onLoad, onUpload, onExportPDF, hasSelection, hasElements }: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="toolbar">
      <div className="toolbar-section">
        <button className="toolbar-icon-button" onClick={onAddText} title="Add text element (T)" aria-label="Add text">
          <span className="toolbar-icon" aria-hidden="true">📝</span>
          <span className="toolbar-label">Text</span>
        </button>
        {onAddTable && (
          <button className="toolbar-icon-button" onClick={onAddTable} title="Add table element" aria-label="Add table">
            <span className="toolbar-icon" aria-hidden="true">📊</span>
            <span className="toolbar-label">Table</span>
          </button>
        )}
        {onAddImage && (
          <button className="toolbar-icon-button" onClick={onAddImage} title="Add image element" aria-label="Add image">
            <span className="toolbar-icon" aria-hidden="true">🖼️</span>
            <span className="toolbar-label">Image</span>
          </button>
        )}
      </div>
      <div className="toolbar-section">
        {onAddParagraph && (
          <button className="toolbar-icon-button" onClick={onAddParagraph} title="Add paragraph" aria-label="Add paragraph">
            <span className="toolbar-icon" aria-hidden="true">📄</span>
            <span className="toolbar-label">Paragraph</span>
          </button>
        )}
        {onAddRadio && (
          <button className="toolbar-icon-button" onClick={onAddRadio} title="Add radio buttons" aria-label="Add radio buttons">
            <span className="toolbar-icon" aria-hidden="true">🔘</span>
            <span className="toolbar-label">Radio</span>
          </button>
        )}
        {onAddCheckbox && (
          <button className="toolbar-icon-button" onClick={onAddCheckbox} title="Add checkbox" aria-label="Add checkbox">
            <span className="toolbar-icon" aria-hidden="true">☑️</span>
            <span className="toolbar-label">Checkbox</span>
          </button>
        )}
        {onAddDate && (
          <button className="toolbar-icon-button" onClick={onAddDate} title="Add date field" aria-label="Add date">
            <span className="toolbar-icon" aria-hidden="true">📅</span>
            <span className="toolbar-label">Date</span>
          </button>
        )}
      </div>
      <div className="toolbar-section">
        {(onAddLine || onAddBox || onAddRectangle || onAddTriangle || onAddEllipse) && (
          <StructuresDropdown
            onAddLine={onAddLine || (() => {})}
            onAddBox={onAddBox || (() => {})}
            onAddRectangle={onAddRectangle || (() => {})}
            onAddTriangle={onAddTriangle || (() => {})}
            onAddEllipse={onAddEllipse || (() => {})}
          />
        )}
      </div>
      <div className="toolbar-section">
        {onSave && (
          <button 
            className="toolbar-icon-button toolbar-icon-button-secondary"
            onClick={onSave}
            disabled={!hasElements}
            title="Save template as JSON file"
            aria-label="Save template"
          >
            <span className="toolbar-icon" aria-hidden="true">💾</span>
            <span className="toolbar-label">Save</span>
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
              className="toolbar-icon-button toolbar-icon-button-secondary"
              onClick={handleLoadClick}
              title="Load template from JSON file"
              aria-label="Load template"
            >
              <span className="toolbar-icon" aria-hidden="true">📂</span>
              <span className="toolbar-label">Load</span>
            </button>
          </>
        )}
        {onUpload && (
          <button
            className="toolbar-icon-button toolbar-icon-button-secondary"
            onClick={onUpload}
            title="Upload file"
            aria-label="Upload file"
          >
            <span className="toolbar-icon" aria-hidden="true">📁</span>
            <span className="toolbar-label">Upload File</span>
          </button>
        )}
        {onExportPDF && (
          <button 
            className="toolbar-icon-button toolbar-icon-button-secondary"
            onClick={onExportPDF}
            disabled={!hasElements}
            title="Export template as PDF (A4 size)"
            aria-label="Export PDF"
          >
            <span className="toolbar-icon" aria-hidden="true">📄</span>
            <span className="toolbar-label">Export</span>
          </button>
        )}
      </div>
      <div className="toolbar-section">
        {hasSelection && onDelete && (
          <button 
            className="toolbar-icon-button toolbar-icon-button-danger"
            onClick={onDelete}
            title="Delete selected element (Delete key)"
            aria-label="Delete selected element"
          >
            <span className="toolbar-icon" aria-hidden="true">🗑️</span>
            <span className="toolbar-label">Delete</span>
          </button>
        )}
      </div>
    </div>
  );
}

export default Toolbar;

