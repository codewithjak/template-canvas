import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import './LineElement.css';

interface LineElementProps {
  id: string;
  position: { x: number; y: number };
  style: {
    length: number;
    thickness: number;
    direction: 'horizontal' | 'vertical';
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
    opacity?: number;
  };
  onUpdateStyle: (id: string, style: Partial<LineElementProps['style']>) => void;
  onUpdatePosition: (id: string, position: { x: number; y: number }) => void;
  isSelected?: boolean;
  onSelect: () => void;
}

function LineElement({
  id,
  position,
  style,
  onUpdateStyle,
  onUpdatePosition,
  isSelected,
  onSelect,
}: LineElementProps) {
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

  const handleResizeStart = (e: React.MouseEvent, handle: 'start' | 'end') => {
    e.stopPropagation();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startLength = style.length;
    const startPosition = { ...position };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (style.direction === 'horizontal') {
        const deltaX = moveEvent.clientX - startX;
        let newLength = startLength;
        let newX = startPosition.x;

        if (handle === 'end') {
          newLength = Math.max(20, startLength + deltaX);
        } else {
          // Start handle: move position and adjust length
          newLength = Math.max(20, startLength - deltaX);
          newX = startPosition.x + deltaX;
        }

        onUpdateStyle(id, { length: newLength });
        if (handle === 'start') {
          onUpdatePosition(id, { x: newX, y: startPosition.y });
        }
      } else {
        // Vertical line
        const deltaY = startY - moveEvent.clientY; // Inverted
        let newLength = startLength;
        let newY = startPosition.y;

        if (handle === 'end') {
          newLength = Math.max(20, startLength + deltaY);
        } else {
          newLength = Math.max(20, startLength - deltaY);
          newY = startPosition.y - deltaY;
        }

        onUpdateStyle(id, { length: newLength });
        if (handle === 'start') {
          onUpdatePosition(id, { x: startPosition.x, y: newY });
        }
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

  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: style.direction === 'horizontal' ? `${style.length}px` : `${style.thickness}px`,
    height: style.direction === 'vertical' ? `${style.length}px` : `${style.thickness}px`,
    backgroundColor: style.style === 'solid' ? style.color : 'transparent',
    opacity: style.opacity !== undefined ? style.opacity / 100 : 1,
    ...style_transform,
  };

  // Apply border style for dashed/dotted
  if (style.style === 'dashed' || style.style === 'dotted') {
    if (style.direction === 'horizontal') {
      lineStyle.borderBottom = `${style.thickness}px ${style.style} ${style.color}`;
    } else {
      lineStyle.borderLeft = `${style.thickness}px ${style.style} ${style.color}`;
    }
  }

  return (
    <div
      id={`line-${id}`}
      ref={setNodeRef}
      className={`canvas-line-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''} ${style.direction}`}
      style={lineStyle}
      onClick={handleClick}
      {...listeners}
      {...attributes}
    >
      {isSelected && !isResizing && (
        <>
          <div
            className="line-resize-handle line-resize-start"
            onMouseDown={(e) => handleResizeStart(e, 'start')}
            title="Drag to resize from start"
          />
          <div
            className="line-resize-handle line-resize-end"
            onMouseDown={(e) => handleResizeStart(e, 'end')}
            title="Drag to resize from end"
          />
        </>
      )}
    </div>
  );
}

export default LineElement;
