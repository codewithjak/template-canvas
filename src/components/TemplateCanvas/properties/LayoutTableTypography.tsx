/**
 * LayoutTableTypography.tsx
 *
 * The typography box for a layout table. It works in two modes:
 *   - No cell selected : you are editing the table's DEFAULT font for new text.
 *   - A cell selected  : you are editing just THAT cell, which overrides the
 *                        defaults. A selected cell also unlocks a few extra
 *                        controls (italic, underline, alignment, background).
 */

import type { LayoutTableElement, TableCell } from '../../../model/layoutTable';
import FontFamilyOptions from './FontFamilyOptions';
import type { CanvasElement, UpdateElement } from './elementTypes';
import { patchLayoutTableCell } from './layoutTableCellHelpers';

interface Props {
  element: LayoutTableElement;
  onUpdate: UpdateElement;
  activeRC: { rowIndex: number; colIndex: number } | null;
  activeCell: TableCell | null;
}

function LayoutTableTypography({ element, onUpdate, activeRC, activeCell }: Props) {
  const editingCell = !!(activeCell && activeRC);

  // The "shared" controls (size, weight, family, colour) edit the selected
  // cell when there is one, otherwise the table's defaults.
  const setShared = (patch: Partial<TableCell['style']> & Record<string, unknown>) => {
    if (activeCell && activeRC) {
      patchLayoutTableCell(element, activeRC.rowIndex, activeRC.colIndex, {
        style: { ...activeCell.style, ...patch },
      }, onUpdate);
    } else {
      onUpdate(element.id, { style: { ...element.style, ...patch } } as Partial<CanvasElement>);
    }
  };

  // The cell-only controls always edit the selected cell.
  const setCell = (patch: Partial<TableCell['style']>) => {
    if (!activeCell || !activeRC) return;
    patchLayoutTableCell(element, activeRC.rowIndex, activeRC.colIndex, {
      style: { ...activeCell.style, ...patch },
    }, onUpdate);
  };

  // Show the cell's own value when editing a cell, else the table default.
  // Only the four keys below live on both a cell and the table defaults.
  type SharedKey = 'fontSize' | 'fontWeight' | 'fontFamily' | 'color';
  const sharedValue = (key: SharedKey) =>
    activeCell ? (activeCell.style?.[key] ?? element.style[key]) : element.style[key];

  return (
    <div className="property-section">
      <div className="property-section-title">
        {activeCell ? 'Cell typography' : 'Table default typography'}
      </div>
      {!activeCell ? (
        <p className="property-hint">
          Select a cell to set its own font; otherwise you are editing defaults for new content.
        </p>
      ) : (
        <p className="property-hint">These values apply only to the selected cell (overrides table defaults).</p>
      )}

      <div className="property-group">
        <label className="property-label">Font Size</label>
        <input
          type="number"
          value={sharedValue('fontSize')}
          onChange={(e) => setShared({ fontSize: Number(e.target.value) })}
          className="property-input"
          min="8"
          max="72"
        />
      </div>

      <div className="property-group">
        <label className="property-label">Font Weight</label>
        <select
          value={sharedValue('fontWeight')}
          onChange={(e) => setShared({ fontWeight: e.target.value })}
          className="property-select"
        >
          <option value="normal">Normal</option>
          <option value="bold">Bold</option>
          <option value="lighter">Lighter</option>
        </select>
      </div>

      {editingCell ? (
        <>
          <div className="property-group">
            <label className="property-label">Font Style</label>
            <select
              value={activeCell!.style?.fontStyle ?? 'normal'}
              onChange={(e) => setCell({ fontStyle: e.target.value })}
              className="property-select"
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
            </select>
          </div>
          <div className="property-group">
            <label className="property-label">Decoration</label>
            <select
              value={activeCell!.style?.textDecoration ?? 'none'}
              onChange={(e) => setCell({ textDecoration: e.target.value })}
              className="property-select"
            >
              <option value="none">None</option>
              <option value="underline">Underline</option>
            </select>
          </div>
        </>
      ) : null}

      <div className="property-group">
        <label className="property-label">Font Family</label>
        <select
          value={sharedValue('fontFamily')}
          onChange={(e) => setShared({ fontFamily: e.target.value })}
          className="property-select"
        >
          <FontFamilyOptions />
        </select>
      </div>

      <div className="property-group">
        <label className="property-label">Color</label>
        <input
          type="color"
          value={sharedValue('color')}
          onChange={(e) => setShared({ color: e.target.value })}
          className="property-color"
        />
      </div>

      {editingCell ? (
        <div className="property-group">
          <label className="property-label">Text Align</label>
          <select
            value={activeCell!.style?.textAlign ?? 'left'}
            onChange={(e) => setCell({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
            className="property-select"
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      ) : null}

      <div className="property-group">
        <label className="property-label">Background Color</label>
        <input
          type="color"
          value={activeCell ? (activeCell.style?.backgroundColor ?? 'transparent') : 'transparent'}
          onChange={(e) => setCell({ backgroundColor: e.target.value })}
          disabled={!activeCell}
          className="property-color"
        />
      </div>
    </div>
  );
}

export default LayoutTableTypography;
