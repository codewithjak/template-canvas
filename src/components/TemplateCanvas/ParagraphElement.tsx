import { useState, useRef, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';
import './TextElement.css';

interface ParagraphElementProps {
  id: string;
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    lineHeight?: number;
  };
  onUpdate: (id: string, content: string) => void;
  isSelected?: boolean;
  onSelect: () => void;
}

function ParagraphElement({ id, content, position, style, onUpdate, isSelected, onSelect }: ParagraphElementProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled: isEditing,
  });

  const style_transform = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditValue(content);
    }
    // Allow Enter for new lines, not to blur
  };

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

  const parts = parseTextWithPlaceholders(content);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (node) (elementRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }}
      className={`canvas-text-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        fontSize: `${style.fontSize}px`,
        fontWeight: style.fontWeight,
        color: style.color,
        fontFamily: style.fontFamily,
        lineHeight: style.lineHeight ? `${style.lineHeight}px` : '1.5',
        whiteSpace: 'pre-wrap',
        minWidth: '100px',
        minHeight: '40px',
        ...style_transform,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...listeners}
      {...attributes}
    >
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-element-textarea"
          style={{
            fontSize: `${style.fontSize}px`,
            fontWeight: style.fontWeight,
            color: style.color,
            fontFamily: style.fontFamily,
            lineHeight: style.lineHeight ? `${style.lineHeight}px` : '1.5',
            width: '100%',
            minHeight: '60px',
            border: 'none',
            outline: 'none',
            resize: 'both',
            background: 'transparent',
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
          }}
        />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap' }}>
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
        </div>
      )}
    </div>
  );
}

export default ParagraphElement;
