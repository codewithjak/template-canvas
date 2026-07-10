import { useState, useRef, useEffect, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { LayoutTableElement as LayoutTableModel } from '../../model/layoutTable';
import { getAnchorIndices, normalizeRect } from '../../model/layoutTable';
import './LayoutTableElement.css';

export type TableSelectionRange = { r0: number; c0: number; r1: number; c1: number };

interface LayoutTableElementProps {
  element: LayoutTableModel;
  isSelected: boolean;
  onTableChromeSelect: () => void;
  onUpdate: (id: string, updates: Partial<LayoutTableModel>) => void;
  /** Anchor cell for property editing (never a merge slave). */
  activeCell: { rowIndex: number; colIndex: number } | null;
  onCellSelect: (tableId: string, rowIndex: number, colIndex: number) => void;
  selectionRange: TableSelectionRange | null;
  onSelectionRangeChange: (tableId: string, range: TableSelectionRange | null) => void;
}

function LayoutTableElement({
  element,
  isSelected,
  onTableChromeSelect,
  onUpdate,
  activeCell,
  onCellSelect,
  selectionRange,
  onSelectionRangeChange,
}: LayoutTableElementProps) {
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelectingRef = useRef(false);
  const selectAnchorRef = useRef<{ row: number; col: number } | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: element.id,
    disabled: editing !== null,
  });

  const styleTransform = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    const endSelect = () => {
      isSelectingRef.current = false;
      selectAnchorRef.current = null;
    };
    window.addEventListener('pointerup', endSelect);
    window.addEventListener('pointercancel', endSelect);
    return () => {
      window.removeEventListener('pointerup', endSelect);
      window.removeEventListener('pointercancel', endSelect);
    };
  }, []);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const { row, col } = editing;
    const rows = element.rows.map((r, ri) => {
      if (ri !== row) return r;
      return {
        ...r,
        cells: r.cells.map((c, ci) =>
          ci === col ? { ...c, content: { type: 'text' as const, value: editValue } } : c
        ),
      };
    });
    onUpdate(element.id, { rows });
    setEditing(null);
  }, [editing, editValue, element.id, element.rows, onUpdate]);

  const handleCellDoubleClick = (rowIndex: number, colIndex: number) => {
    const { rowIndex: ar, colIndex: ac } = getAnchorIndices(element, rowIndex, colIndex);
    const cell = element.rows[ar]?.cells[ac];
    if (!cell || cell.mergedInto) return;
    onCellSelect(element.id, rowIndex, colIndex);
    setEditing({ row: ar, col: ac });
    setEditValue(cell.content?.value ?? '');
  };

  const handleCellPointerDown = (
    e: React.PointerEvent,
    rowIndex: number,
    colIndex: number
  ) => {
    if (editing) return;
    e.stopPropagation();

    const anchor = getAnchorIndices(element, rowIndex, colIndex);

    if (e.shiftKey && activeCell) {
      const nr = normalizeRect(activeCell.rowIndex, activeCell.colIndex, rowIndex, colIndex);
      onSelectionRangeChange(element.id, nr);
      onCellSelect(element.id, anchor.rowIndex, anchor.colIndex);
      return;
    }

    isSelectingRef.current = true;
    selectAnchorRef.current = { row: rowIndex, col: colIndex };
    onSelectionRangeChange(element.id, {
      r0: rowIndex,
      c0: colIndex,
      r1: rowIndex,
      c1: colIndex,
    });
    onCellSelect(element.id, anchor.rowIndex, anchor.colIndex);
  };

  const handleCellPointerEnter = (rowIndex: number, colIndex: number) => {
    if (!isSelectingRef.current || !selectAnchorRef.current) return;
    const a = selectAnchorRef.current;
    onSelectionRangeChange(
      element.id,
      normalizeRect(a.row, a.col, rowIndex, colIndex)
    );
  };

  // Drag the right edge of a header cell to resize that column. Uses window-level
  // listeners and stops propagation so it never starts a cell selection or a
  // table drag.
  const handleColResizeStart = (e: React.PointerEvent, colIndex: number) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = element.columns[colIndex]?.width ?? 96;
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(40, Math.round(startWidth + (ev.clientX - startX)));
      const columns = element.columns.map((c, i) => (i === colIndex ? { ...c, width: w } : c));
      onUpdate(element.id, { columns });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const { position, style: tableStyle, columns, rows } = element;
  const border =
    tableStyle.showBorders !== false
      ? tableStyle.borderWidth && tableStyle.borderWidth > 0
        ? `${tableStyle.borderWidth}px solid ${tableStyle.borderColor ?? '#d1d5db'}`
        : '1px solid #e5e7eb'
      : 'none';

  const normRange = selectionRange
    ? normalizeRect(selectionRange.r0, selectionRange.c0, selectionRange.r1, selectionRange.c1)
    : null;

  const inSelectionRange = (r: number, c: number) => {
    if (!normRange || !isSelected) return false;
    return r >= normRange.r0 && r <= normRange.r1 && c >= normRange.c0 && c <= normRange.c1;
  };

  const inActiveMerge = (r: number, c: number) => {
    if (!activeCell || !isSelected) return false;
    const a = getAnchorIndices(element, r, c);
    return a.rowIndex === activeCell.rowIndex && a.colIndex === activeCell.colIndex;
  };

  const effectiveCellTypography = (cell: LayoutTableModel['rows'][0]['cells'][0]) => ({
    fontSize: cell.style?.fontSize ?? tableStyle.fontSize,
    fontWeight: cell.style?.fontWeight ?? tableStyle.fontWeight,
    fontStyle: cell.style?.fontStyle ?? 'normal',
    textDecoration: cell.style?.textDecoration ?? 'none',
    color: cell.style?.color ?? tableStyle.color,
    fontFamily: cell.style?.fontFamily ?? tableStyle.fontFamily,
  });

  const validatePlaceholder = (placeholder: string): boolean => {
    const match = placeholder.match(/^\{\{([^}]+)\}\}$/);
    if (!match) return false;
    const variableName = match[1].trim();
    if (variableName.length === 0) return false;
    // Each dot-separated segment must be a valid identifier.
    // Allows: {{name}}, {{client.name}}, {{invoice.line.total}}
    // Rejects: {{.name}}, {{client.}}, {{client..name}}, {{123abc}}
    const validVariableRegex = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;
    return validVariableRegex.test(variableName);
  };

  const parseTextWithPlaceholders = (text: string) => {
    const parts: Array<{ text: string; isPlaceholder: boolean; isValid?: boolean }> = [];
    const placeholderRegex = /\{\{[^}]*\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = placeholderRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.substring(lastIndex, match.index), isPlaceholder: false });
      }
      const placeholderText = match[0];
      const isValid = validatePlaceholder(placeholderText);
      parts.push({ text: placeholderText, isPlaceholder: true, isValid });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex), isPlaceholder: false });
    }

    if (parts.length === 0) {
      parts.push({ text, isPlaceholder: false });
    }

    return parts;
  };

  return (
    <div
      ref={setNodeRef}
      className={`layout-table-wrap ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        ...styleTransform,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="layout-table-drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag table"
        title="Drag table"
        onPointerDown={(e) => {
          onTableChromeSelect();
          const l = listeners as { onPointerDown?: (ev: React.PointerEvent<HTMLButtonElement>) => void };
          l.onPointerDown?.(e);
        }}
      />
      <table
        className={`layout-table ${tableStyle.showBorders === false ? 'borderless' : ''}`}
        dir={tableStyle.direction === 'rtl' ? 'rtl' : undefined}
        style={{
          fontSize: tableStyle.fontSize,
          fontWeight: tableStyle.fontWeight,
          color: tableStyle.color,
          fontFamily: tableStyle.fontFamily,
          border,
        }}
      >
        <colgroup>
          {columns.map((col) => (
            <col key={col.id} style={{ width: col.width, minWidth: col.minWidth ?? col.width }} />
          ))}
        </colgroup>
        {element.headerRow && (
          <thead>
            <tr>
              {element.headerRow.cells.map((cell, colIndex) => {
                if (cell.mergedInto) return null;
                const rs = cell.span?.rowSpan ?? 1;
                const cs = cell.span?.colSpan ?? 1;
                const colAlign = columns[colIndex]?.alignment ?? 'left';
                const parts = parseTextWithPlaceholders(cell.content?.value ?? '');
                return (
                  <th
                    key={cell.id}
                    rowSpan={rs > 1 ? rs : undefined}
                    colSpan={cs > 1 ? cs : undefined}
                    className={`layout-table-header-cell ${
                      inSelectionRange(-1, colIndex) ? 'range' : ''
                    } ${inActiveMerge(-1, colIndex) ? 'active' : ''}`}
                    style={{
                      textAlign: cell.style?.textAlign ?? colAlign,
                      backgroundColor: cell.style?.backgroundColor,
                      ...effectiveCellTypography(cell as any),
                    }}
                    onPointerDown={(e) => handleCellPointerDown(e, -1, colIndex)}
                    onPointerEnter={() => handleCellPointerEnter(-1, colIndex)}
                    onDoubleClick={() => handleCellDoubleClick(-1, colIndex)}
                  >
                    {parts.map((part, index) =>
                      part.isPlaceholder ? (
                        <span
                          key={index}
                          className={`placeholder-text ${part.isValid === false ? 'placeholder-invalid' : ''}`}
                          title={
                            part.isValid === false
                              ? 'Invalid placeholder syntax. Use {{variable_name}} or {{parent.field_name}}'
                              : `Placeholder: ${part.text}`
                          }
                        >
                          {part.text}
                        </span>
                      ) : (
                        <span key={index}>{part.text}</span>
                      )
                    )}
                    {isSelected && (
                      <span
                        className="layout-table-col-resize"
                        title="Drag to resize column"
                        onPointerDown={(e) => handleColResizeStart(e, colIndex + cs - 1)}
                        onDoubleClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={row.id}>
              {row.cells.map((cell, colIndex) => {
                if (cell.mergedInto) return null;

                const colAlign = columns[colIndex]?.alignment ?? 'left';
                const ty = effectiveCellTypography(cell);
                const rangeOn = inSelectionRange(rowIndex, colIndex);
                const activeMerge = inActiveMerge(rowIndex, colIndex);
                const isEdit = editing?.row === rowIndex && editing?.col === colIndex;
                const showBinding = !!cell.binding?.path;
                const rs = cell.span?.rowSpan ?? 1;
                const cs = cell.span?.colSpan ?? 1;

                return (
                  <td
                    key={cell.id}
                    rowSpan={rs > 1 ? rs : undefined}
                    colSpan={cs > 1 ? cs : undefined}
                    className={`layout-table-cell ${activeMerge ? 'active' : ''} ${rangeOn ? 'range' : ''}`}
                    style={{
                      textAlign: cell.style?.textAlign ?? colAlign,
                      backgroundColor: cell.style?.backgroundColor,
                      ...ty,
                    }}
                    onPointerDown={(e) => handleCellPointerDown(e, rowIndex, colIndex)}
                    onPointerEnter={() => handleCellPointerEnter(rowIndex, colIndex)}
                    onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                  >
                    {isEdit ? (
                      <input
                        ref={inputRef}
                        className="layout-table-cell-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit();
                          if (e.key === 'Escape') {
                            setEditing(null);
                            setEditValue(cell.content?.value ?? '');
                          }
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="layout-table-cell-inner">
                        {cell.content?.value ? (
                          <span className="layout-table-text">
                            {parseTextWithPlaceholders(cell.content.value).map((part, index) =>
                              part.isPlaceholder ? (
                                <span
                                  key={index}
                                  className={`placeholder-text ${
                                    part.isValid === false ? 'placeholder-invalid' : ''
                                  }`}
                                  title={
                                    part.isValid === false
                                      ? 'Invalid placeholder syntax. Use {{variable_name}} or {{parent.field_name}}'
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
                        ) : showBinding ? (
                          <span className="layout-table-binding-hint" title={cell.binding?.path}>
                            {cell.binding?.path}
                          </span>
                        ) : (
                          <span className="layout-table-placeholder"> </span>
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
    </div>
  );
}

export default LayoutTableElement;
