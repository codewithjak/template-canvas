/**
 * Toolbar.tsx
 * Added: onAddPage prop + "Add Page" button in its own section.
 */

import React from 'react';
import StructuresDropdown from './StructuresDropdown';
import './Toolbar.css';

interface ToolbarProps {
  onAddParagraph  ?: () => void;
  onAddRadio      ?: () => void;
  onAddCheckbox   ?: () => void;
  onAddDate       ?: () => void;
  onAddText        : () => void;
  onAddTable      ?: () => void;
  onAddImage      ?: () => void;
  onAddLine       ?: () => void;
  onAddBox        ?: () => void;
  onAddRectangle  ?: () => void;
  onAddTriangle   ?: () => void;
  onAddEllipse    ?: () => void;
  onDelete        ?: () => void;
  onSave          ?: () => void;
  onLoad          ?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload        ?: () => void;
  onExportPDF     ?: () => void;
  onAddPage       ?: () => void;   // ← NEW
  hasSelection    ?: boolean;
  hasElements     ?: boolean;
}

function Toolbar({
  onAddParagraph, onAddRadio, onAddCheckbox, onAddDate,
  onAddText, onAddTable, onAddImage, onAddLine,
  onAddBox, onAddRectangle, onAddTriangle, onAddEllipse,
  onDelete, onSave, onLoad, onUpload, onExportPDF,
  onAddPage,
  hasSelection, hasElements,
}: ToolbarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="toolbar">

      {/* ── Elements ── */}
      <div className="toolbar-section">
        <button className="toolbar-icon-button" onClick={onAddText} title="Add text element" aria-label="Add text">
          <span className="toolbar-icon" aria-hidden="true">📝</span>
          <span className="toolbar-label">Text</span>
        </button>
        {onAddTable && (
          <button className="toolbar-icon-button" onClick={onAddTable} title="Add table" aria-label="Add table">
            <span className="toolbar-icon" aria-hidden="true">▦</span>
            <span className="toolbar-label">Table</span>
          </button>
        )}
        {onAddImage && (
          <button className="toolbar-icon-button" onClick={onAddImage} title="Add image" aria-label="Add image">
            <span className="toolbar-icon" aria-hidden="true">🖼️</span>
            <span className="toolbar-label">Image</span>
          </button>
        )}
      </div>

      {/* ── Form elements ── */}
      <div className="toolbar-section">
        {onAddParagraph && (
          <button className="toolbar-icon-button" onClick={onAddParagraph} title="Add paragraph" aria-label="Add paragraph">
            <span className="toolbar-icon" aria-hidden="true">📄</span>
            <span className="toolbar-label">Paragraph</span>
          </button>
        )}
        {onAddRadio && (
          <button className="toolbar-icon-button" onClick={onAddRadio} title="Add radio buttons" aria-label="Add radio">
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

      {/* ── Shapes ── */}
      <div className="toolbar-section">
        {(onAddLine || onAddBox || onAddRectangle || onAddTriangle || onAddEllipse) && (
          <StructuresDropdown
            onAddLine       ={onAddLine       || (() => {})}
            onAddBox        ={onAddBox        || (() => {})}
            onAddRectangle  ={onAddRectangle  || (() => {})}
            onAddTriangle   ={onAddTriangle   || (() => {})}
            onAddEllipse    ={onAddEllipse    || (() => {})}
          />
        )}
      </div>

      {/* ── Pages ── */}
      {onAddPage && (
        <div className="toolbar-section">
          <button
            className="toolbar-icon-button toolbar-icon-button-page"
            onClick={onAddPage}
            title="Add a new canvas page"
            aria-label="Add page"
          >
            <span className="toolbar-icon" aria-hidden="true">＋</span>
            <span className="toolbar-label">Add Page</span>
          </button>
        </div>
      )}

      {/* ── File actions ── */}
      <div className="toolbar-section">
        {onSave && (
          <button
            className="toolbar-icon-button toolbar-icon-button-secondary"
            onClick={onSave}
            disabled={!hasElements}
            title="Save template as JSON"
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
              onClick={() => fileInputRef.current?.click()}
              title="Load template from JSON"
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
            title="Upload data file"
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
            title="Export as PDF"
            aria-label="Export PDF"
          >
            <span className="toolbar-icon" aria-hidden="true">📄</span>
            <span className="toolbar-label">Export</span>
          </button>
        )}
      </div>

      {/* ── Delete ── */}
      <div className="toolbar-section">
        {hasSelection && onDelete && (
          <button
            className="toolbar-icon-button toolbar-icon-button-danger"
            onClick={onDelete}
            title="Delete selected element"
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