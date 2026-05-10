import './PropertiesPanel.css';
import type { LayoutTableElement, TableCell } from '../../model/layoutTable';
import {
  applyHeaderMerge,
  applyRectMerge,
  isLayoutTable,
  newStableId,
  normalizeRect,
  stripAllMerges,
  stripMergesFromRow,
  unmergeAt,
  unmergeHeaderAt,
} from '../../model/layoutTable';

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

type CanvasElement =
  | TextElementType
  | ImageElementType
  | LineElementType
  | BoxElementType
  | ParagraphElementType
  | RadioElementType
  | CheckboxElementType
  | DateElementType
  | LayoutTableElement;

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
  layoutTableActiveCell: { tableId: string; rowIndex: number; colIndex: number } | null;
  layoutTableRange: { tableId: string; r0: number; c0: number; r1: number; c1: number } | null;
}

function PropertiesPanel({
  selectedElement,
  onUpdate,
  layoutTableActiveCell,
  layoutTableRange,
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

  let layoutActiveCell: TableCell | null = null;
  let layoutActiveRC: { rowIndex: number; colIndex: number } | null = null;
  if (isLayoutTable(selectedElement) && layoutTableActiveCell?.tableId === selectedElement.id) {
    layoutActiveRC = {
      rowIndex: layoutTableActiveCell.rowIndex,
      colIndex: layoutTableActiveCell.colIndex,
    };
    layoutActiveCell =
      layoutTableActiveCell.rowIndex === -1
        ? (selectedElement.headerRow?.cells[layoutTableActiveCell.colIndex] ?? null)
        : (selectedElement.rows[layoutTableActiveCell.rowIndex]?.cells[
            layoutTableActiveCell.colIndex
          ] ?? null);
  }

  const patchLayoutTableCell = (
    table: LayoutTableElement,
    rowIndex: number,
    colIndex: number,
    patch: Partial<TableCell>
  ) => {
    if (rowIndex === -1) {
      const headerRow = table.headerRow;
      if (!headerRow) return;
      const patched = {
        ...headerRow,
        cells: headerRow.cells.map((cell, ci) => (ci === colIndex ? { ...cell, ...patch } : cell)),
      };
      onUpdate(table.id, { headerRow: patched } as Partial<CanvasElement>);
      return;
    }
    const rows = table.rows.map((row, ri) => {
      if (ri !== rowIndex) return row;
      return {
        ...row,
        cells: row.cells.map((cell, ci) => (ci === colIndex ? { ...cell, ...patch } : cell)),
      };
    });
    onUpdate(table.id, { rows } as Partial<CanvasElement>);
  };

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
        ) : selectedElement.type === 'table' && isLayoutTable(selectedElement) ? (
          <div className="property-section">
            <div className="property-section-title">Layout table (v2)</div>
            <p className="property-hint">
              One template row on the canvas; data iteration will repeat it. Drag or Shift+click to select a cell range, then merge.
            </p>
            <div className="property-group">
              <label className="property-label">Table border (px)</label>
              <input
                type="number"
                className="property-input"
                value={selectedElement.style.borderWidth ?? 0}
                min={0}
                max={8}
                onChange={(e) =>
                  onUpdate(selectedElement.id, {
                    style: {
                      ...selectedElement.style,
                      borderWidth: Number(e.target.value),
                    },
                  } as Partial<CanvasElement>)
                }
              />
            </div>
            <div className="property-group">
              <label className="property-label">Border color</label>
              <input
                type="color"
                className="property-color"
                value={selectedElement.style.borderColor ?? '#d1d5db'}
                onChange={(e) =>
                  onUpdate(selectedElement.id, {
                    style: { ...selectedElement.style, borderColor: e.target.value },
                  } as Partial<CanvasElement>)
                }
              />
            </div>
            <div className="property-section-title property-subtitle">Table binding</div>
            <div className="property-group property-inline">
              <label>
                <input
                  type="checkbox"
                  checked={!!selectedElement.binding?.enabled}
                  onChange={(e) =>
                    onUpdate(selectedElement.id, {
                      binding: {
                        enabled: e.target.checked,
                        collectionKey: selectedElement.binding?.collectionKey ?? '',
                        itemAlias: selectedElement.binding?.itemAlias ?? 'item',
                      },
                    } as Partial<CanvasElement>)
                  }
                />
                Collection iteration (preview later)
              </label>
            </div>
            <div className="property-group">
              <label className="property-label">Collection key</label>
              <input
                type="text"
                className="property-input"
                disabled={!selectedElement.binding?.enabled}
                placeholder="e.g. employees"
                value={selectedElement.binding?.collectionKey ?? ''}
                onChange={(e) =>
                  onUpdate(selectedElement.id, {
                    binding: {
                      enabled: selectedElement.binding?.enabled ?? false,
                      collectionKey: e.target.value,
                      itemAlias: selectedElement.binding?.itemAlias ?? 'item',
                    },
                  } as Partial<CanvasElement>)
                }
              />
            </div>
            <div className="property-group">
              <label className="property-label">Item alias</label>
              <input
                type="text"
                className="property-input"
                disabled={!selectedElement.binding?.enabled}
                placeholder="item"
                value={selectedElement.binding?.itemAlias ?? ''}
                onChange={(e) =>
                  onUpdate(selectedElement.id, {
                    binding: {
                      enabled: selectedElement.binding?.enabled ?? false,
                      collectionKey: selectedElement.binding?.collectionKey ?? '',
                      itemAlias: e.target.value || 'item',
                    },
                  } as Partial<CanvasElement>)
                }
              />
            </div>
            <div className="property-section-title property-subtitle">Columns</div>
            {selectedElement.columns.map((col, colIndex) => (
              <div className="property-grid-two" key={col.id}>
                <div className="property-group">
                  <label className="property-label">Width (px)</label>
                  <input
                    type="number"
                    className="property-input"
                    min={40}
                    max={800}
                    value={col.width}
                    onChange={(e) => {
                      const w = Math.max(40, Number(e.target.value) || 40);
                      const columns = selectedElement.columns.map((c, i) =>
                        i === colIndex ? { ...c, width: w } : c
                      );
                      onUpdate(selectedElement.id, { columns } as Partial<CanvasElement>);
                    }}
                  />
                </div>
                <div className="property-group">
                  <label className="property-label">Align</label>
                  <select
                    className="property-select"
                    value={col.alignment ?? 'left'}
                    onChange={(e) => {
                      const alignment = e.target.value as 'left' | 'center' | 'right';
                      const columns = selectedElement.columns.map((c, i) =>
                        i === colIndex ? { ...c, alignment } : c
                      );
                      onUpdate(selectedElement.id, { columns } as Partial<CanvasElement>);
                    }}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
            ))}
            <div className="property-group property-row-buttons">
              <button
                type="button"
                className="property-button-secondary"
                onClick={() => {
                  const col = {
                    id: newStableId(),
                    width: 96,
                    widthMode: 'fixed' as const,
                    alignment: 'left' as const,
                  };
                  const cleared = stripAllMerges(selectedElement.rows);
                  const rows = cleared.map((r) => ({
                    ...r,
                    cells: [
                      ...r.cells,
                      { id: newStableId(), content: { type: 'text' as const, value: '' } },
                    ],
                  }));
                  const headerRow = selectedElement.headerRow
                    ? {
                        ...stripMergesFromRow(selectedElement.headerRow),
                        cells: [
                          ...stripMergesFromRow(selectedElement.headerRow).cells,
                          { id: newStableId(), content: { type: 'text' as const, value: `Header ${selectedElement.columns.length + 1}` } },
                        ],
                      }
                    : undefined;
                  onUpdate(selectedElement.id, {
                    columns: [...selectedElement.columns, col],
                    headerRow,
                    rows,
                  } as Partial<CanvasElement>);
                }}
              >
                + Column
              </button>
              <button
                type="button"
                className="property-button-secondary"
                disabled={selectedElement.columns.length <= 1}
                onClick={() => {
                  if (selectedElement.columns.length <= 1) return;
                  const cleared = stripAllMerges(selectedElement.rows);
                  const columns = selectedElement.columns.slice(0, -1);
                  const rows = cleared.map((r) => ({
                    ...r,
                    cells: r.cells.slice(0, -1),
                  }));
                  const headerRow = selectedElement.headerRow
                    ? {
                        ...stripMergesFromRow(selectedElement.headerRow),
                        cells: stripMergesFromRow(selectedElement.headerRow).cells.slice(0, -1),
                      }
                    : undefined;
                  onUpdate(selectedElement.id, { columns, headerRow, rows } as Partial<CanvasElement>);
                }}
              >
                − Column
              </button>
            </div>
            <div className="property-section-title property-subtitle">Merge cells</div>
            <p className="property-hint">
              Drag across cells or Shift+click a second cell. Merge uses the top-left of the selection as the anchor.
            </p>
            {layoutTableRange && layoutTableRange.tableId === selectedElement.id ? (
              <div className="property-group">
                <span className="property-label">
                  Range: R{layoutTableRange.r0 + 1}C{layoutTableRange.c0 + 1} — R
                  {layoutTableRange.r1 + 1}C{layoutTableRange.c1 + 1}
                </span>
              </div>
            ) : null}
            <div className="property-group property-row-buttons">
              <button
                type="button"
                className="property-button-secondary"
                disabled={(() => {
                  if (!layoutTableRange || layoutTableRange.tableId !== selectedElement.id) return true;
                  const n = normalizeRect(
                    layoutTableRange.r0,
                    layoutTableRange.c0,
                    layoutTableRange.r1,
                    layoutTableRange.c1
                  );
                  return n.r0 === n.r1 && n.c0 === n.c1;
                })()}
                onClick={() => {
                  if (!layoutTableRange || layoutTableRange.tableId !== selectedElement.id) return;
                  const n = normalizeRect(
                    layoutTableRange.r0,
                    layoutTableRange.c0,
                    layoutTableRange.r1,
                    layoutTableRange.c1
                  );
                  if (n.r0 === n.r1 && n.c0 === n.c1) return;
                  // header-only merges use headerRow as real cells
                  if (n.r0 === -1 && n.r1 === -1) {
                    const headerRow = applyHeaderMerge(selectedElement, n.c0, n.c1);
                    if (headerRow) onUpdate(selectedElement.id, { headerRow } as Partial<CanvasElement>);
                    return;
                  }
                  if (n.r0 < 0 || n.r1 < 0) return; // disallow spanning header + body
                  const rows = applyRectMerge(selectedElement, n.r0, n.c0, n.r1, n.c1);
                  onUpdate(selectedElement.id, { rows } as Partial<CanvasElement>);
                }}
              >
                Merge
              </button>
              <button
                type="button"
                className="property-button-secondary"
                disabled={(() => {
                  if (!layoutActiveRC || !layoutActiveCell) return true;
                  const sp = layoutActiveCell.span;
                  return !sp || ((sp.rowSpan ?? 1) <= 1 && (sp.colSpan ?? 1) <= 1);
                })()}
                onClick={() => {
                  if (!layoutActiveRC) return;
                  if (layoutActiveRC.rowIndex === -1) {
                    const headerRow = unmergeHeaderAt(selectedElement, layoutActiveRC.colIndex);
                    if (headerRow) onUpdate(selectedElement.id, { headerRow } as Partial<CanvasElement>);
                    return;
                  }
                  const rows = unmergeAt(selectedElement, layoutActiveRC.rowIndex, layoutActiveRC.colIndex);
                  onUpdate(selectedElement.id, { rows } as Partial<CanvasElement>);
                }}
              >
                Unmerge
              </button>
            </div>
            <div className="property-section-title property-subtitle">Selected cell</div>
            {layoutActiveRC && layoutActiveCell ? (
              <>
                <div className="property-group">
                  <label className="property-label">Cell text</label>
                  <textarea
                    className="property-textarea"
                    rows={3}
                    value={layoutActiveCell.content.value}
                    onChange={(e) =>
                      patchLayoutTableCell(
                        selectedElement,
                        layoutActiveRC.rowIndex,
                        layoutActiveRC.colIndex,
                        { content: { type: 'text', value: e.target.value } }
                      )
                    }
                  />
                </div>
                <div className="property-group">
                  <label className="property-label">Binding path (optional)</label>
                  <input
                    type="text"
                    className="property-input"
                    placeholder="e.g. client.name or line.total"
                    value={layoutActiveCell.binding?.path ?? ''}
                    onChange={(e) => {
                      const path = e.target.value.trim();
                      patchLayoutTableCell(
                        selectedElement,
                        layoutActiveRC.rowIndex,
                        layoutActiveRC.colIndex,
                        {
                          binding: path
                            ? {
                                path,
                                scope: layoutActiveCell.binding?.scope ?? 'root',
                                fallback: layoutActiveCell.binding?.fallback,
                              }
                            : undefined,
                        }
                      );
                    }}
                  />
                </div>
                <div className="property-group">
                  <label className="property-label">Binding scope</label>
                  <select
                    className="property-select"
                    value={layoutActiveCell.binding?.scope ?? 'root'}
                    disabled={!layoutActiveCell.binding?.path}
                    onChange={(e) => {
                      const scope = e.target.value as 'root' | 'item';
                      if (!layoutActiveCell.binding?.path) return;
                      patchLayoutTableCell(
                        selectedElement,
                        layoutActiveRC.rowIndex,
                        layoutActiveRC.colIndex,
                        {
                          binding: {
                            ...layoutActiveCell.binding,
                            path: layoutActiveCell.binding.path,
                            scope,
                          },
                        }
                      );
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
                    disabled={!layoutActiveCell.binding?.path}
                    value={layoutActiveCell.binding?.fallback ?? ''}
                    onChange={(e) => {
                      if (!layoutActiveCell.binding?.path) return;
                      patchLayoutTableCell(
                        selectedElement,
                        layoutActiveRC.rowIndex,
                        layoutActiveRC.colIndex,
                        {
                          binding: {
                            ...layoutActiveCell.binding,
                            fallback: e.target.value,
                          },
                        }
                      );
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="property-hint">Click a cell on the canvas to edit it here.</p>
            )}
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

        {isLayoutTable(selectedElement) && (
          <div className="property-section">
            <div className="property-section-title">
              {layoutActiveCell ? 'Cell typography' : 'Table default typography'}
            </div>
            {!layoutActiveCell ? (
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
                value={
                  layoutActiveCell
                    ? layoutActiveCell.style?.fontSize ?? selectedElement.style.fontSize
                    : selectedElement.style.fontSize
                }
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (layoutActiveRC && layoutActiveCell) {
                    patchLayoutTableCell(selectedElement, layoutActiveRC.rowIndex, layoutActiveRC.colIndex, {
                      style: { ...layoutActiveCell.style, fontSize: v },
                    });
                  } else {
                    onUpdate(selectedElement.id, {
                      style: { ...selectedElement.style, fontSize: v },
                    } as Partial<CanvasElement>);
                  }
                }}
                className="property-input"
                min="8"
                max="72"
              />
            </div>
            <div className="property-group">
              <label className="property-label">Font Weight</label>
              <select
                value={
                  layoutActiveCell
                    ? layoutActiveCell.style?.fontWeight ?? selectedElement.style.fontWeight
                    : selectedElement.style.fontWeight
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (layoutActiveRC && layoutActiveCell) {
                    patchLayoutTableCell(selectedElement, layoutActiveRC.rowIndex, layoutActiveRC.colIndex, {
                      style: { ...layoutActiveCell.style, fontWeight: v },
                    });
                  } else {
                    onUpdate(selectedElement.id, {
                      style: { ...selectedElement.style, fontWeight: v },
                    } as Partial<CanvasElement>);
                  }
                }}
                className="property-select"
              >
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
                <option value="lighter">Lighter</option>
              </select>
            </div>
            {layoutActiveCell && layoutActiveRC ? (
              <>
                <div className="property-group">
                  <label className="property-label">Font Style</label>
                  <select
                    value={layoutActiveCell.style?.fontStyle ?? 'normal'}
                    onChange={(e) =>
                      patchLayoutTableCell(selectedElement, layoutActiveRC.rowIndex, layoutActiveRC.colIndex, {
                        style: { ...layoutActiveCell.style, fontStyle: e.target.value },
                      })
                    }
                    className="property-select"
                  >
                    <option value="normal">Normal</option>
                    <option value="italic">Italic</option>
                  </select>
                </div>
                <div className="property-group">
                  <label className="property-label">Decoration</label>
                  <select
                    value={layoutActiveCell.style?.textDecoration ?? 'none'}
                    onChange={(e) =>
                      patchLayoutTableCell(selectedElement, layoutActiveRC.rowIndex, layoutActiveRC.colIndex, {
                        style: { ...layoutActiveCell.style, textDecoration: e.target.value },
                      })
                    }
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
                value={
                  layoutActiveCell
                    ? layoutActiveCell.style?.fontFamily ?? selectedElement.style.fontFamily
                    : selectedElement.style.fontFamily
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (layoutActiveRC && layoutActiveCell) {
                    patchLayoutTableCell(selectedElement, layoutActiveRC.rowIndex, layoutActiveRC.colIndex, {
                      style: { ...layoutActiveCell.style, fontFamily: v },
                    });
                  } else {
                    onUpdate(selectedElement.id, {
                      style: { ...selectedElement.style, fontFamily: v },
                    } as Partial<CanvasElement>);
                  }
                }}
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
                value={
                  layoutActiveCell
                    ? layoutActiveCell.style?.color ?? selectedElement.style.color
                    : selectedElement.style.color
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (layoutActiveRC && layoutActiveCell) {
                    patchLayoutTableCell(selectedElement, layoutActiveRC.rowIndex, layoutActiveRC.colIndex, {
                      style: { ...layoutActiveCell.style, color: v },
                    });
                  } else {
                    onUpdate(selectedElement.id, {
                      style: { ...selectedElement.style, color: v },
                    } as Partial<CanvasElement>);
                  }
                }}
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

