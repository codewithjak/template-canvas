import { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import './TableElement.css';

interface TableElementProps {
  id: string;
  data: string[][];
  merges: Array<{ r0: number; c0: number; r1: number; c1: number }>;
  cellStyles: Record<
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
  onUpdate: (id: string, data: string[][]) => void;
  isSelected?: boolean;
  onSelect: () => void;
  onResize?: (id: string, fontSize: number) => void;
  selection: { r0: number; c0: number; r1: number; c1: number } | null;
  selectionMode: 'cell' | 'row' | 'column';
  onSelectionChange: (id: string, selection: { r0: number; c0: number; r1: number; c1: number } | null) => void;
}

function TableElement({ 
  id, 
  data, 
  merges,
  cellStyles,
  position, 
  style, 
  onUpdate, 
  isSelected, 
  onSelect,
  onResize,
  selection,
  selectionMode,
  onSelectionChange
}: TableElementProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const selectionAnchorRef = useRef<{ row: number; col: number } | null>(null);
  const didDragSelectRef = useRef(false);
  const isSelectingRef = useRef(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
    disabled: !!editingCell || isSelectingRef.current,
  });

  const style_transform = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingCell]);

  const normalizeSelection = (s: { r0: number; c0: number; r1: number; c1: number }) => ({
    r0: Math.min(s.r0, s.r1),
    c0: Math.min(s.c0, s.c1),
    r1: Math.max(s.r0, s.r1),
    c1: Math.max(s.c0, s.c1),
  });

  const buildScopedSelection = (
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ) => {
    const rowCount = data.length || 1;
    const colCount = data[0]?.length || 1;
    if (selectionMode === 'row') {
      return { r0: startRow, c0: 0, r1: endRow, c1: colCount - 1 };
    }
    if (selectionMode === 'column') {
      return { r0: 0, c0: startCol, r1: rowCount - 1, c1: endCol };
    }
    return { r0: startRow, c0: startCol, r1: endRow, c1: endCol };
  };

  const isCellInSelection = (row: number, col: number) => {
    if (!selection) return false;
    const s = normalizeSelection(selection);
    return row >= s.r0 && row <= s.r1 && col >= s.c0 && col <= s.c1;
  };

  const getCellMergeInfo = (row: number, col: number) => {
    for (const m of merges) {
      const inside = row >= m.r0 && row <= m.r1 && col >= m.c0 && col <= m.c1;
      if (!inside) continue;
      const isAnchor = row === m.r0 && col === m.c0;
      return {
        isMerged: true,
        isAnchor,
        rowSpan: m.r1 - m.r0 + 1,
        colSpan: m.c1 - m.c0 + 1,
      };
    }
    return { isMerged: false, isAnchor: true, rowSpan: 1, colSpan: 1 };
  };

  const handleCellClick = (row: number, col: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingCell) {
      onSelect();
      // If a drag-selection just happened, don't collapse the selection back to a single cell.
      if (didDragSelectRef.current) {
        didDragSelectRef.current = false;
        return;
      }
      // If shift is held, range is handled by shift-click handler.
      if (e.shiftKey) return;
      setActiveCell({ row, col });
      onSelectionChange(id, buildScopedSelection(row, col, row, col));
    }
  };

  const handleCellDoubleClick = (row: number, col: number) => {
    setEditingCell({ row, col });
    setEditValue(data[row][col] || '');
  };

  const handleCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (editingCell) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    didDragSelectRef.current = false;
    setIsSelecting(true);
    isSelectingRef.current = true;
    selectionAnchorRef.current = { row, col };
    setActiveCell({ row, col });
    onSelectionChange(id, buildScopedSelection(row, col, row, col));
  };

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isSelecting) return;
    const anchor = selectionAnchorRef.current;
    if (!anchor) return;
    didDragSelectRef.current = true;
    onSelectionChange(id, buildScopedSelection(anchor.row, anchor.col, row, col));
  };

  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
        isSelectingRef.current = false;
        selectionAnchorRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isSelecting]);

  const handleCellShiftClick = (row: number, col: number, e: React.MouseEvent) => {
    if (!e.shiftKey || editingCell) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    const anchor = activeCell || { row, col };
    onSelectionChange(id, buildScopedSelection(anchor.row, anchor.col, row, col));
  };

  const handleCellBlur = () => {
    if (editingCell) {
      const newData = data.map((row, rIdx) =>
        rIdx === editingCell.row
          ? row.map((cell, cIdx) => (cIdx === editingCell.col ? editValue : cell))
          : row
      );
      onUpdate(id, newData);
      setEditingCell(null);
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const validatePlaceholder = (placeholder: string): boolean => {
    const match = placeholder.match(/^\{\{([^}]+)\}\}$/);
    if (!match) return false;
    const variableName = match[1].trim();
    if (variableName.length === 0) return false;
    const validVariableRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    return validVariableRegex.test(variableName);
  };

  const parseTextWithPlaceholders = (text: string) => {
    const parts: Array<{ text: string; isPlaceholder: boolean; isValid?: boolean }> = [];
    const placeholderRegex = /\{\{[^}]*\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = placeholderRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({
          text: text.substring(lastIndex, match.index),
          isPlaceholder: false,
        });
      }
      const placeholderText = match[0];
      const isValid = validatePlaceholder(placeholderText);
      parts.push({
        text: placeholderText,
        isPlaceholder: true,
        isValid,
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({
        text: text.substring(lastIndex),
        isPlaceholder: false,
      });
    }

    if (parts.length === 0) {
      parts.push({ text, isPlaceholder: false });
    }

    return parts;
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    const startY = e.clientY;
    const startFontSize = style.fontSize;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = startY - moveEvent.clientY;
      const scaleFactor = 1 + deltaY / 100;
      const newFontSize = Math.max(8, Math.min(72, Math.round(startFontSize * scaleFactor)));
      if (onResize) {
        onResize(id, newFontSize);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={setNodeRef}
      className={`canvas-table-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        fontSize: `${style.fontSize}px`,
        fontWeight: style.fontWeight,
        color: style.color,
        fontFamily: style.fontFamily,
        ...style_transform,
      }}
      onClick={onSelect}
    >
      <div
        className="table-drag-handle"
        onMouseDown={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        title="Drag table"
        {...listeners}
        {...attributes}
      />
      <table className="table-element-table">
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, colIndex) => {
                const mergeInfo = getCellMergeInfo(rowIndex, colIndex);
                if (mergeInfo.isMerged && !mergeInfo.isAnchor) {
                  return null;
                }
                const selected = isCellInSelection(rowIndex, colIndex);
                const cellStyle = cellStyles[`${rowIndex}:${colIndex}`] || {};
                return (
                  <td
                    key={colIndex}
                    className={`table-cell ${selected ? 'table-cell-selected' : ''}`}
                    colSpan={mergeInfo.colSpan}
                    rowSpan={mergeInfo.rowSpan}
                    onClick={(e) => {
                      // shift-click creates a range; normal click selects a single cell
                      handleCellShiftClick(rowIndex, colIndex, e);
                      handleCellClick(rowIndex, colIndex, e);
                    }}
                    onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
                    onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
                    onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      fontSize: `${cellStyle.fontSize ?? style.fontSize}px`,
                      fontWeight: cellStyle.fontWeight ?? style.fontWeight,
                      fontStyle: cellStyle.fontStyle,
                      textDecoration: cellStyle.textDecoration,
                      textAlign: cellStyle.textAlign,
                      color: cellStyle.color ?? style.color,
                      fontFamily: cellStyle.fontFamily ?? style.fontFamily,
                      backgroundColor: cellStyle.backgroundColor,
                    }}
                  >
                    {editingCell?.row === rowIndex && editingCell?.col === colIndex ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleCellBlur}
                        onKeyDown={handleCellKeyDown}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="table-cell-input"
                      />
                    ) : (
                      <span className="table-cell-content">
                        {parseTextWithPlaceholders(cell || '').map((part, index) =>
                          part.isPlaceholder ? (
                            <span
                              key={index}
                              className={`placeholder-text ${
                                part.isValid === false ? 'placeholder-invalid' : ''
                              }`}
                              title={
                                part.isValid === false
                                  ? 'Invalid placeholder syntax. Use {{variable_name}}'
                                  : `Placeholder: ${part.text}`
                              }
                            >
                              {part.text}
                            </span>
                          ) : (
                            <span key={index}>{part.text}</span>
                          )
                        )}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {isSelected && !editingCell && (
        <div
          className="resize-handle"
          onMouseDown={handleResizeStart}
          title="Drag to resize font size"
        />
      )}
    </div>
  );
}

export default TableElement;

