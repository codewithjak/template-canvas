/**
 * LayoutTableProperties.tsx
 *
 * The main box shown when a layout table is selected. It is split into a few
 * smaller boxes, each its own little component below:
 *   - TableStyleControls  : border width, border colour, show/hide borders
 *   - TableBindingControls : repeat the row for each item in a collection
 *   - ColumnsEditor        : add / move / delete columns and set their width
 *   - MergeControls        : merge or unmerge the selected cells
 *   - SelectedCellEditor   : edit the text and data binding of one cell
 */

import type { LayoutTableElement, TableCell } from '../../../model/layoutTable';
import {
  applyHeaderMerge,
  applyRectMerge,
  insertColumnAt,
  moveColumn,
  normalizeRect,
  removeColumnAt,
  setColumnWidth,
  unmergeAt,
  unmergeHeaderAt,
} from '../../../model/layoutTable';
import type { CanvasElement, UpdateElement } from './elementTypes';
import { patchLayoutTableCell } from './layoutTableCellHelpers';

/** The rectangle of cells the user has selected by dragging or shift-clicking. */
interface SelectionRange {
  tableId: string;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

interface Props {
  element: LayoutTableElement;
  onUpdate: UpdateElement;
  layoutTableRange: SelectionRange | null;
  activeRC: { rowIndex: number; colIndex: number } | null;
  activeCell: TableCell | null;
}

function LayoutTableProperties({ element, onUpdate, layoutTableRange, activeRC, activeCell }: Props) {
  return (
    <div className="property-section">
      <div className="property-section-title">Layout table (v2)</div>
      <p className="property-hint">
        One template row on the canvas; data iteration will repeat it. Drag or Shift+click to select a cell range, then merge.
      </p>

      <TableStyleControls element={element} onUpdate={onUpdate} />

      <div className="property-section-title property-subtitle">Table binding</div>
      <TableBindingControls element={element} onUpdate={onUpdate} />

      <div className="property-section-title property-subtitle">Columns</div>
      <ColumnsEditor element={element} onUpdate={onUpdate} />

      <div className="property-section-title property-subtitle">Merge cells</div>
      <p className="property-hint">
        Drag across cells or Shift+click a second cell. Merge uses the top-left of the selection as the anchor.
      </p>
      <MergeControls
        element={element}
        onUpdate={onUpdate}
        layoutTableRange={layoutTableRange}
        activeRC={activeRC}
        activeCell={activeCell}
      />

      <div className="property-section-title property-subtitle">Selected cell</div>
      <SelectedCellEditor
        element={element}
        onUpdate={onUpdate}
        activeRC={activeRC}
        activeCell={activeCell}
      />
    </div>
  );
}

/** Border width, border colour, and the show-borders checkbox. */
function TableStyleControls({ element, onUpdate }: { element: LayoutTableElement; onUpdate: UpdateElement }) {
  const setStyle = (patch: Partial<LayoutTableElement['style']>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } } as Partial<CanvasElement>);
  };

  return (
    <>
      <div className="property-group">
        <label className="property-label">Table border (px)</label>
        <input
          type="number"
          className="property-input"
          value={element.style.borderWidth ?? 0}
          min={0}
          max={8}
          onChange={(e) => setStyle({ borderWidth: Number(e.target.value) })}
        />
      </div>
      <div className="property-group">
        <label className="property-label">Border color</label>
        <input
          type="color"
          className="property-color"
          value={element.style.borderColor ?? '#d1d5db'}
          onChange={(e) => setStyle({ borderColor: e.target.value })}
        />
      </div>
      <div className="property-group property-inline">
        <label>
          <input
            type="checkbox"
            checked={element.style.showBorders !== false}
            onChange={(e) => setStyle({ showBorders: e.target.checked })}
          />
          Show Borders
        </label>
      </div>
    </>
  );
}

/** Toggle "repeat this row for each item" and set the collection key + alias. */
function TableBindingControls({ element, onUpdate }: { element: LayoutTableElement; onUpdate: UpdateElement }) {
  const binding = element.binding;

  // Always send a complete binding object so we never drop the other fields.
  const setBinding = (patch: Partial<NonNullable<LayoutTableElement['binding']>>) => {
    onUpdate(element.id, {
      binding: {
        enabled: binding?.enabled ?? false,
        collectionKey: binding?.collectionKey ?? '',
        itemAlias: binding?.itemAlias ?? 'item',
        ...patch,
      },
    } as Partial<CanvasElement>);
  };

  return (
    <>
      <div className="property-group property-inline">
        <label>
          <input
            type="checkbox"
            checked={!!binding?.enabled}
            onChange={(e) => setBinding({ enabled: e.target.checked })}
          />
          Collection iteration (preview later)
        </label>
      </div>
      <div className="property-group">
        <label className="property-label">Collection key</label>
        <input
          type="text"
          className="property-input"
          disabled={!binding?.enabled}
          placeholder="e.g. employees"
          value={binding?.collectionKey ?? ''}
          onChange={(e) => setBinding({ collectionKey: e.target.value })}
        />
      </div>
      <div className="property-group">
        <label className="property-label">Item alias</label>
        <input
          type="text"
          className="property-input"
          disabled={!binding?.enabled}
          placeholder="item"
          value={binding?.itemAlias ?? ''}
          onChange={(e) => setBinding({ itemAlias: e.target.value || 'item' })}
        />
      </div>
    </>
  );
}

/** The list of column editors plus the "Add column" button. */
function ColumnsEditor({ element, onUpdate }: { element: LayoutTableElement; onUpdate: UpdateElement }) {
  // Several column actions return a patch object; save it if it has anything in it.
  const applyPatch = (patch: Partial<LayoutTableElement>) => {
    if (patch && Object.keys(patch).length) onUpdate(element.id, patch as Partial<CanvasElement>);
  };

  const lastIndex = element.columns.length - 1;

  return (
    <>
      {element.columns.map((col, colIndex) => {
        const headerCell = element.headerRow?.cells[colIndex];
        const headerText =
          (headerCell && !headerCell.mergedInto && headerCell.content?.value) ||
          `Column ${colIndex + 1}`;
        return (
          <div className="column-editor" key={col.id}>
            <div className="column-editor__head">
              <span className="column-editor__name" title={headerText}>
                {colIndex + 1}. {headerText}
              </span>
              <div className="column-editor__actions">
                <button
                  type="button" className="column-editor__btn" title="Move left"
                  disabled={colIndex === 0}
                  onClick={() => applyPatch(moveColumn(element, colIndex, colIndex - 1))}
                >‹</button>
                <button
                  type="button" className="column-editor__btn" title="Move right"
                  disabled={colIndex === lastIndex}
                  onClick={() => applyPatch(moveColumn(element, colIndex, colIndex + 1))}
                >›</button>
                <button
                  type="button" className="column-editor__btn" title="Insert column after"
                  onClick={() => applyPatch(insertColumnAt(element, colIndex + 1))}
                >+</button>
                <button
                  type="button" className="column-editor__btn column-editor__btn--danger" title="Delete column"
                  disabled={element.columns.length <= 1}
                  onClick={() => applyPatch(removeColumnAt(element, colIndex))}
                >×</button>
              </div>
            </div>
            <div className="property-grid-two">
              <div className="property-group">
                <label className="property-label">Width (px)</label>
                <input
                  type="number" className="property-input" min={40} max={800}
                  value={col.width}
                  onChange={(e) => applyPatch(setColumnWidth(element, colIndex, Number(e.target.value) || 40))}
                />
              </div>
              <div className="property-group">
                <label className="property-label">Align</label>
                <select
                  className="property-select"
                  value={col.alignment ?? 'left'}
                  onChange={(e) => {
                    const alignment = e.target.value as 'left' | 'center' | 'right';
                    const columns = element.columns.map((c, i) =>
                      i === colIndex ? { ...c, alignment } : c
                    );
                    applyPatch({ columns });
                  }}
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          </div>
        );
      })}
      <div className="property-group">
        <button
          type="button"
          className="property-button-secondary"
          onClick={() =>
            onUpdate(element.id, insertColumnAt(element, element.columns.length) as Partial<CanvasElement>)
          }
        >
          + Add column
        </button>
      </div>
    </>
  );
}

/** The Merge / Unmerge buttons, plus a readout of the selected range. */
function MergeControls({
  element,
  onUpdate,
  layoutTableRange,
  activeRC,
  activeCell,
}: {
  element: LayoutTableElement;
  onUpdate: UpdateElement;
  layoutTableRange: SelectionRange | null;
  activeRC: { rowIndex: number; colIndex: number } | null;
  activeCell: TableCell | null;
}) {
  // Is there a real multi-cell selection in this table?
  const hasRange = !!layoutTableRange && layoutTableRange.tableId === element.id;

  // Merge needs a selection that covers more than a single cell.
  const cannotMerge = (() => {
    if (!hasRange) return true;
    const n = normalizeRect(layoutTableRange!.r0, layoutTableRange!.c0, layoutTableRange!.r1, layoutTableRange!.c1);
    return n.r0 === n.r1 && n.c0 === n.c1;
  })();

  const mergeSelection = () => {
    if (!hasRange) return;
    const n = normalizeRect(layoutTableRange!.r0, layoutTableRange!.c0, layoutTableRange!.r1, layoutTableRange!.c1);
    if (n.r0 === n.r1 && n.c0 === n.c1) return;
    // header-only merges use headerRow as real cells
    if (n.r0 === -1 && n.r1 === -1) {
      const headerRow = applyHeaderMerge(element, n.c0, n.c1);
      if (headerRow) onUpdate(element.id, { headerRow } as Partial<CanvasElement>);
      return;
    }
    if (n.r0 < 0 || n.r1 < 0) return; // disallow spanning header + body
    const rows = applyRectMerge(element, n.r0, n.c0, n.r1, n.c1);
    onUpdate(element.id, { rows } as Partial<CanvasElement>);
  };

  // Unmerge needs an active cell that is actually merged (spans > 1 row/col).
  const cannotUnmerge = (() => {
    if (!activeRC || !activeCell) return true;
    const span = activeCell.span;
    return !span || ((span.rowSpan ?? 1) <= 1 && (span.colSpan ?? 1) <= 1);
  })();

  const unmergeSelection = () => {
    if (!activeRC) return;
    if (activeRC.rowIndex === -1) {
      const headerRow = unmergeHeaderAt(element, activeRC.colIndex);
      if (headerRow) onUpdate(element.id, { headerRow } as Partial<CanvasElement>);
      return;
    }
    const rows = unmergeAt(element, activeRC.rowIndex, activeRC.colIndex);
    onUpdate(element.id, { rows } as Partial<CanvasElement>);
  };

  return (
    <>
      {hasRange ? (
        <div className="property-group">
          <span className="property-label">
            Range: R{layoutTableRange!.r0 + 1}C{layoutTableRange!.c0 + 1} — R
            {layoutTableRange!.r1 + 1}C{layoutTableRange!.c1 + 1}
          </span>
        </div>
      ) : null}
      <div className="property-group property-row-buttons">
        <button
          type="button"
          className="property-button-secondary"
          disabled={cannotMerge}
          onClick={mergeSelection}
        >
          Merge
        </button>
        <button
          type="button"
          className="property-button-secondary"
          disabled={cannotUnmerge}
          onClick={unmergeSelection}
        >
          Unmerge
        </button>
      </div>
    </>
  );
}

/** Edit the text and data binding of the single selected cell. */
function SelectedCellEditor({
  element,
  onUpdate,
  activeRC,
  activeCell,
}: {
  element: LayoutTableElement;
  onUpdate: UpdateElement;
  activeRC: { rowIndex: number; colIndex: number } | null;
  activeCell: TableCell | null;
}) {
  if (!activeRC || !activeCell) {
    return <p className="property-hint">Click a cell on the canvas to edit it here.</p>;
  }

  // Save a change to the active cell.
  const patchCell = (patch: Partial<TableCell>) =>
    patchLayoutTableCell(element, activeRC.rowIndex, activeRC.colIndex, patch, onUpdate);

  const binding = activeCell.binding;

  return (
    <>
      <div className="property-group">
        <label className="property-label">Cell text</label>
        <textarea
          className="property-textarea"
          rows={3}
          value={activeCell.content.value}
          onChange={(e) => patchCell({ content: { type: 'text', value: e.target.value } })}
        />
      </div>
      <div className="property-group">
        <label className="property-label">Binding path (optional)</label>
        <input
          type="text"
          className="property-input"
          placeholder="e.g. client.name or line.total"
          value={binding?.path ?? ''}
          onChange={(e) => {
            const path = e.target.value.trim();
            patchCell({
              binding: path
                ? { path, scope: binding?.scope ?? 'root', fallback: binding?.fallback }
                : undefined,
            });
          }}
        />
      </div>
      <div className="property-group">
        <label className="property-label">Binding scope</label>
        <select
          className="property-select"
          value={binding?.scope ?? 'root'}
          disabled={!binding?.path}
          onChange={(e) => {
            const scope = e.target.value as 'root' | 'item';
            if (!binding?.path) return;
            patchCell({ binding: { ...binding, path: binding.path, scope } });
          }}
        >
          <option value="root">root (document data)</option>
          <option value="item">item (iteration — later)</option>
        </select>
      </div>
      <div className="property-group">
        <label className="property-label">Fallback if empty</label>
        <input
          type="text"
          className="property-input"
          disabled={!binding?.path}
          value={binding?.fallback ?? ''}
          onChange={(e) => {
            if (!binding?.path) return;
            patchCell({ binding: { ...binding, fallback: e.target.value } });
          }}
        />
      </div>
    </>
  );
}

export default LayoutTableProperties;
