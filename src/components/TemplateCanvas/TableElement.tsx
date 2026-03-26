import { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import './TableElement.css';

interface TableElementProps {
  id: string;
  data: string[][];
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
  onUpdate: (id: string, data: string[][]) => void;
  isSelected?: boolean;
  onSelect: () => void;
  onResize?: (id: string, fontSize: number) => void;
}

function TableElement({ 
  id, 
  data, 
  position, 
  style, 
  onUpdate, 
  isSelected, 
  onSelect,
  onResize 
}: TableElementProps) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
    disabled: !!editingCell,
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

  const handleCellClick = (row: number, col: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingCell) {
      onSelect();
    }
  };

  const handleCellDoubleClick = (row: number, col: number) => {
    setEditingCell({ row, col });
    setEditValue(data[row][col] || '');
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
        ...style_transform,
      }}
      onClick={onSelect}
      {...listeners}
      {...attributes}
    >
      <table className="table-element-table">
        <tbody>
          {data.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, colIndex) => (
                <td
                  key={colIndex}
                  className="table-cell"
                  onClick={(e) => handleCellClick(rowIndex, colIndex, e)}
                  onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
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
              ))}
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

