import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import './BoxElement.css';

interface BoxElementProps {
  id: string;
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
  onUpdateStyle: (id: string, style: Partial<BoxElementProps['style']>) => void;
  onUpdatePosition: (id: string, position: { x: number; y: number }) => void;
  isSelected?: boolean;
  onSelect: () => void;
}

function BoxElement({
  id,
  position,
  style,
  onUpdateStyle,
  onUpdatePosition,
  isSelected,
  onSelect,
}: BoxElementProps) {
  const [isResizing, setIsResizing] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id,
    disabled: isResizing,
  });

  const style_transform = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  };

  const handleResizeStart = (e: React.MouseEvent, type: 'corner' | 'right' | 'bottom' | 'left' | 'top') => {
    e.stopPropagation();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = style.width;
    const startHeight = style.height;
    const startPosition = { ...position };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = startY - moveEvent.clientY; // Inverted

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startPosition.x;
      let newY = startPosition.y;

      if (type === 'corner') {
        // Bottom-right corner: resize both dimensions
        newWidth = Math.max(50, Math.min(1000, startWidth + deltaX));
        newHeight = Math.max(50, Math.min(1000, startHeight + deltaY));
      } else if (type === 'right') {
        newWidth = Math.max(50, Math.min(1000, startWidth + deltaX));
      } else if (type === 'bottom') {
        newHeight = Math.max(50, Math.min(1000, startHeight + deltaY));
      } else if (type === 'left') {
        // Left edge: resize width and move position
        newWidth = Math.max(50, Math.min(1000, startWidth - deltaX));
        newX = startPosition.x + deltaX;
      } else if (type === 'top') {
        // Top edge: resize height and move position
        newHeight = Math.max(50, Math.min(1000, startHeight - deltaY));
        newY = startPosition.y - deltaY;
      }

      onUpdateStyle(id, { width: newWidth, height: newHeight });
      if (type === 'left' || type === 'top') {
        onUpdatePosition(id, { x: newX, y: newY });
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

  return (
    <div
      ref={setNodeRef}
      className={`canvas-box-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${style.width}px`,
        height: `${style.height}px`,
        borderWidth: `${style.borderWidth}px`,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        backgroundColor: style.backgroundColor,
        opacity: style.opacity !== undefined ? style.opacity / 100 : 1,
        borderRadius: style.borderRadius !== undefined ? `${style.borderRadius}px` : '0',
        boxSizing: 'border-box',
        ...style_transform,
      }}
      onClick={handleClick}
      {...listeners}
      {...attributes}
    >
      {isSelected && !isResizing && (
        <>
          {/* Corner handles */}
          <div
            className="box-resize-handle box-resize-corner box-resize-top-left"
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag to resize"
          />
          <div
            className="box-resize-handle box-resize-corner box-resize-top-right"
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag to resize"
          />
          <div
            className="box-resize-handle box-resize-corner box-resize-bottom-left"
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag to resize"
          />
          <div
            className="box-resize-handle box-resize-corner box-resize-bottom-right"
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag to resize"
          />
          {/* Edge handles */}
          <div
            className="box-resize-handle box-resize-edge box-resize-right"
            onMouseDown={(e) => handleResizeStart(e, 'right')}
            title="Drag to resize width"
          />
          <div
            className="box-resize-handle box-resize-edge box-resize-bottom"
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
            title="Drag to resize height"
          />
          <div
            className="box-resize-handle box-resize-edge box-resize-left"
            onMouseDown={(e) => handleResizeStart(e, 'left')}
            title="Drag to resize width (stretches from right)"
          />
          <div
            className="box-resize-handle box-resize-edge box-resize-top"
            onMouseDown={(e) => handleResizeStart(e, 'top')}
            title="Drag to resize height (stretches from bottom)"
          />
        </>
      )}
    </div>
  );
}

export default BoxElement;
