import { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import './TextElement.css';

interface TextElementProps {
  id: string;
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
  onUpdate: (id: string, content: string) => void;
  isSelected?: boolean;
  onSelect: () => void;
  onResize?: (id: string, fontSize: number) => void;
}

function TextElement({ id, content, position, style, onUpdate, isSelected, onSelect, onResize }: TextElementProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [isResizing, setIsResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
    disabled: isEditing,
  });

  const style_transform = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isEditing) {
      onSelect();
    }
  };

  const handleDoubleClick = () => {
    setIsEditing(true);
    setEditValue(content);
  };

  const handleBlur = () => {
    setIsEditing(false);
    onUpdate(id, editValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(content);
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
    setIsResizing(true);
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
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const parts = parseTextWithPlaceholders(content);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (node) {
          (elementRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      }}
      className={`canvas-text-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        fontSize: `${style.fontSize}px`,
        fontWeight: style.fontWeight,
        color: style.color,
        ...style_transform,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...listeners}
      {...attributes}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-element-input"
          style={{
            fontSize: `${style.fontSize}px`,
            fontWeight: style.fontWeight,
            color: style.color,
          }}
        />
      ) : (
        <span>
          {parts.map((part, index) =>
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
      {isSelected && !isEditing && (
        <div
          className="resize-handle"
          onMouseDown={handleResizeStart}
          title="Drag to resize font size"
        />
      )}
    </div>
  );
}

export default TextElement;

