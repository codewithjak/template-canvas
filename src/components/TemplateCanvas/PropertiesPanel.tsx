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

interface TableElementType {
  id: string;
  type: 'table';
  data: string[][];
  merges?: Array<{ r0: number; c0: number; r1: number; c1: number }>;
  cellStyles?: Record<
    string,
    {
      fontSize?: number;
      fontWeight?: string;
      fontStyle?: string;
      textDecoration?: string;
      textAlign?: 'left' | 'center' | 'right';
      color?: string;
      fontFamily?: string;
      backgroundColor?: string;
    }
  >;
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

type CanvasElement = TextElementType | TableElementType | ImageElementType | LineElementType | BoxElementType;

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
  tableSelection?: { r0: number; c0: number; r1: number; c1: number } | null;
  tableSelectionMode?: 'cell' | 'row' | 'column';
  onTableSelectionModeChange?: (mode: 'cell' | 'row' | 'column') => void;
}

function PropertiesPanel({
  selectedElement,
  onUpdate,
  tableSelection = null,
  tableSelectionMode = 'cell',
  onTableSelectionModeChange,
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

  const normalizeSelection = (s: { r0: number; c0: number; r1: number; c1: number }) => ({
    r0: Math.min(s.r0, s.r1),
    c0: Math.min(s.c0, s.c1),
    r1: Math.max(s.r0, s.r1),
    c1: Math.max(s.c0, s.c1),
  });

  const selectionToA1 = (sel: { r0: number; c0: number; r1: number; c1: number }) => {
    const s = normalizeSelection(sel);
    const colName = (c: number) => String.fromCharCode(65 + (c % 26));
    const a = `${colName(s.c0)}${s.r0 + 1}`;
    const b = `${colName(s.c1)}${s.r1 + 1}`;
    return a === b ? a : `${a}:${b}`;
  };

  const intersects = (
    a: { r0: number; c0: number; r1: number; c1: number },
    b: { r0: number; c0: number; r1: number; c1: number }
  ) => !(a.r1 < b.r0 || a.r0 > b.r1 || a.c1 < b.c0 || a.c0 > b.c1);

  const adjustMergesAfterRemoveRow = (
    merges: Array<{ r0: number; c0: number; r1: number; c1: number }>,
    removedRow: number
  ) =>
    merges
      .map((m) => {
        // If row is above merge, shift up
        if (removedRow < m.r0) return { ...m, r0: m.r0 - 1, r1: m.r1 - 1 };
        // If row is below merge, unchanged
        if (removedRow > m.r1) return m;
        // Row is inside merge: shrink merge
        const shrunk = { ...m, r1: m.r1 - 1 };
        return shrunk;
      })
      .filter((m) => m.r0 <= m.r1);

  const adjustMergesAfterRemoveCol = (
    merges: Array<{ r0: number; c0: number; r1: number; c1: number }>,
    removedCol: number
  ) =>
    merges
      .map((m) => {
        if (removedCol < m.c0) return { ...m, c0: m.c0 - 1, c1: m.c1 - 1 };
        if (removedCol > m.c1) return m;
        const shrunk = { ...m, c1: m.c1 - 1 };
        return shrunk;
      })
      .filter((m) => m.c0 <= m.c1);

  const handleMergeSelection = () => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    const sel = normalizeSelection(tableSelection);
    const merges = selectedElement.merges || [];
    const isMultiCell = sel.r0 !== sel.r1 || sel.c0 !== sel.c1;
    if (!isMultiCell) return;
    const overlap = merges.some((m) => intersects(m, sel));
    if (overlap) {
      alert('Cannot merge: selection overlaps an existing merged region. Unmerge first.');
      return;
    }
    onUpdate(selectedElement.id, { merges: [...merges, sel] } as any);
  };

  const handleUnmergeSelection = () => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    const sel = normalizeSelection(tableSelection);
    const merges = selectedElement.merges || [];
    const remaining = merges.filter((m) => !intersects(m, sel));
    if (remaining.length === merges.length) return;
    onUpdate(selectedElement.id, { merges: remaining } as any);
  };

  const handleContentChange = (value: string) => {
    onUpdate(selectedElement.id, { content: value });
  };

  const applyTableCellStylesToSelection = (
    patch: {
      fontSize?: number;
      fontWeight?: string;
      fontStyle?: string;
      textDecoration?: string;
      textAlign?: 'left' | 'center' | 'right';
      color?: string;
      fontFamily?: string;
      backgroundColor?: string;
    }
  ) => {
    if (selectedElement.type !== 'table') return false;
    if (!tableSelection) return false;
    const s = normalizeSelection(tableSelection);
    const existing = selectedElement.cellStyles || {};
    const updated = { ...existing };
    for (let r = s.r0; r <= s.r1; r += 1) {
      for (let c = s.c0; c <= s.c1; c += 1) {
        const key = `${r}:${c}`;
        updated[key] = { ...(updated[key] || {}), ...patch };
      }
    }
    onUpdate(selectedElement.id, { cellStyles: updated } as any);
    return true;
  };

  const handleFontSizeChange = (value: number) => {
    if (selectedElement.type === 'table' && tableSelection) {
      applyTableCellStylesToSelection({ fontSize: value });
      return;
    }
    if (selectedElement.type === 'text' || selectedElement.type === 'table') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, fontSize: value },
      } as any);
    }
  };

  const handleFontWeightChange = (value: string) => {
    if (selectedElement.type === 'table' && tableSelection) {
      applyTableCellStylesToSelection({ fontWeight: value });
      return;
    }
    if (selectedElement.type === 'text' || selectedElement.type === 'table') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, fontWeight: value },
      } as any);
    }
  };

  const handleColorChange = (value: string) => {
    if (selectedElement.type === 'table' && tableSelection) {
      applyTableCellStylesToSelection({ color: value });
      return;
    }
    if (selectedElement.type === 'text' || selectedElement.type === 'table') {
      onUpdate(selectedElement.id, {
        style: { ...selectedElement.style, color: value },
      } as any);
    }
  };

  const handleFontFamilyChange = (value: string) => {
    if (selectedElement.type === 'table' && tableSelection) {
      applyTableCellStylesToSelection({ fontFamily: value });
      return;
    }
    if (selectedElement.type === 'text' || selectedElement.type === 'table') {
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

  const handleTableBackgroundChange = (value: string) => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    applyTableCellStylesToSelection({ backgroundColor: value });
  };

  const handleTableBoldToggle = () => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    const s = normalizeSelection(tableSelection);
    const existing = selectedElement.cellStyles || {};
    let hasBold = false;
    for (let r = s.r0; r <= s.r1; r += 1) {
      for (let c = s.c0; c <= s.c1; c += 1) {
        if ((existing[`${r}:${c}`]?.fontWeight || selectedElement.style.fontWeight) === 'bold') {
          hasBold = true;
        }
      }
    }
    applyTableCellStylesToSelection({ fontWeight: hasBold ? 'normal' : 'bold' });
  };

  const handleTableItalicToggle = () => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    const s = normalizeSelection(tableSelection);
    const existing = selectedElement.cellStyles || {};
    let hasItalic = false;
    for (let r = s.r0; r <= s.r1; r += 1) {
      for (let c = s.c0; c <= s.c1; c += 1) {
        if ((existing[`${r}:${c}`]?.fontStyle || 'normal') === 'italic') {
          hasItalic = true;
        }
      }
    }
    applyTableCellStylesToSelection({ fontStyle: hasItalic ? 'normal' : 'italic' });
  };

  const handleTableUnderlineToggle = () => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    const s = normalizeSelection(tableSelection);
    const existing = selectedElement.cellStyles || {};
    let hasUnderline = false;
    for (let r = s.r0; r <= s.r1; r += 1) {
      for (let c = s.c0; c <= s.c1; c += 1) {
        if ((existing[`${r}:${c}`]?.textDecoration || 'none') === 'underline') {
          hasUnderline = true;
        }
      }
    }
    applyTableCellStylesToSelection({ textDecoration: hasUnderline ? 'none' : 'underline' });
  };

  const handleTableTextAlignChange = (textAlign: 'left' | 'center' | 'right') => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    applyTableCellStylesToSelection({ textAlign });
  };

  const handleClearTableFormatting = () => {
    if (selectedElement.type !== 'table' || !tableSelection) return;
    const s = normalizeSelection(tableSelection);
    const existing = selectedElement.cellStyles || {};
    const updated = { ...existing };
    for (let r = s.r0; r <= s.r1; r += 1) {
      for (let c = s.c0; c <= s.c1; c += 1) {
        delete updated[`${r}:${c}`];
      }
    }
    onUpdate(selectedElement.id, { cellStyles: updated } as any);
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
      const merges = selectedElement.merges || [];
      const newMerges = adjustMergesAfterRemoveRow(merges, rowIndex);
      onUpdate(selectedElement.id, { data: newData, merges: newMerges } as any);
    }
  };

  const handleRemoveTableColumn = (colIndex: number) => {
    if (selectedElement.type === 'table' && selectedElement.data[0] && selectedElement.data[0].length > 1) {
      const newData = selectedElement.data.map((row) => row.filter((_, idx) => idx !== colIndex));
      const merges = selectedElement.merges || [];
      const newMerges = adjustMergesAfterRemoveCol(merges, colIndex);
      onUpdate(selectedElement.id, { data: newData, merges: newMerges } as any);
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
        ) : (
          <div className="property-section">
            <div className="property-section-title">Table</div>
            <div className="property-group">
              <label className="property-label">Table Data</label>
              <div className="table-editor">
                <div className="table-range-controls">
                  <div className="table-range-label">
                    Range: {tableSelection ? selectionToA1(tableSelection) : '—'}
                  </div>
                  <div className="table-range-buttons">
                    <button
                      className="table-editor-button-add"
                      onClick={handleMergeSelection}
                      disabled={
                        !tableSelection ||
                        (() => {
                          const s = tableSelection ? normalizeSelection(tableSelection) : null;
                          return !s || (s.r0 === s.r1 && s.c0 === s.c1);
                        })()
                      }
                      title="Merge selected cells (creates colSpan/rowSpan)"
                    >
                      Merge
                    </button>
                    <button
                      className="table-editor-button-add"
                      onClick={handleUnmergeSelection}
                      disabled={!tableSelection}
                      title="Unmerge cells intersecting the selected range"
                    >
                      Unmerge
                    </button>
                  </div>
                </div>
                <div className="table-format-toolbar">
                  <div className="table-format-toolbar-row">
                    <label className="property-label">Selection Scope</label>
                    <select
                      className="property-select"
                      value={tableSelectionMode}
                      onChange={(e) =>
                        onTableSelectionModeChange?.(e.target.value as 'cell' | 'row' | 'column')
                      }
                      title="Choose whether clicks select cells, full rows, or full columns"
                    >
                      <option value="cell">Cell</option>
                      <option value="row">Row</option>
                      <option value="column">Column</option>
                    </select>
                  </div>
                  <div className="table-format-toolbar-row table-format-controls">
                    <button
                      className="table-editor-button-add"
                      onClick={handleTableBoldToggle}
                      disabled={!tableSelection}
                      title="Toggle bold on selected cells/rows/columns"
                    >
                      Bold
                    </button>
                    <button
                      className="table-editor-button-add"
                      onClick={handleTableItalicToggle}
                      disabled={!tableSelection}
                      title="Toggle italic on selected cells/rows/columns"
                    >
                      Italic
                    </button>
                    <button
                      className="table-editor-button-add"
                      onClick={handleTableUnderlineToggle}
                      disabled={!tableSelection}
                      title="Toggle underline on selected cells/rows/columns"
                    >
                      Underline
                    </button>
                    <input
                      type="color"
                      className="property-color"
                      onChange={(e) => handleTableBackgroundChange(e.target.value)}
                      title="Background color for selected cells/rows/columns"
                    />
                  </div>
                  <div className="table-format-toolbar-row table-format-controls">
                    <button
                      className="table-editor-button-add"
                      onClick={() => handleTableTextAlignChange('left')}
                      disabled={!tableSelection}
                      title="Align selected cells left"
                    >
                      Align Left
                    </button>
                    <button
                      className="table-editor-button-add"
                      onClick={() => handleTableTextAlignChange('center')}
                      disabled={!tableSelection}
                      title="Align selected cells center"
                    >
                      Align Center
                    </button>
                    <button
                      className="table-editor-button-add"
                      onClick={() => handleTableTextAlignChange('right')}
                      disabled={!tableSelection}
                      title="Align selected cells right"
                    >
                      Align Right
                    </button>
                    <button
                      className="table-editor-button-add"
                      onClick={handleClearTableFormatting}
                      disabled={!tableSelection}
                      title="Remove all direct formatting from selected cells"
                    >
                      Clear
                    </button>
                  </div>
                </div>
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
          </div>
        )}

        {(selectedElement.type === 'text' || selectedElement.type === 'table') && (
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
      </div>
    </div>
  );
}

export default PropertiesPanel;

