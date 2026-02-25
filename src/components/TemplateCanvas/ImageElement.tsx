import { useState, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import './ImageElement.css';

interface ImageElementProps {
  id: string;
  src: string;
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    opacity?: number;
  };
  onUpdate: (id: string, src: string) => void;
  onUpdateStyle: (id: string, style: Partial<ImageElementProps['style']>) => void;
  isSelected?: boolean;
  onSelect: () => void;
}

function ImageElement({ 
  id, 
  src, 
  position, 
  style, 
  onUpdate, 
  onUpdateStyle,
  isSelected, 
  onSelect 
}: ImageElementProps) {
  const [isResizing, setIsResizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleDoubleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        onUpdate(id, base64);
      }
    };
    reader.readAsDataURL(file);
    
    // Reset input
    e.target.value = '';
  };

  const handleResizeStart = (e: React.MouseEvent, type: 'corner' | 'right' | 'bottom') => {
    e.stopPropagation();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = style.width;
    const startHeight = style.height;
    const aspectRatio = startWidth / startHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = startY - moveEvent.clientY; // Inverted because Y increases downward

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (type === 'corner') {
        // Resize both dimensions, maintain aspect ratio
        const widthChange = deltaX;
        const heightChange = deltaY;
        const widthRatio = (startWidth + widthChange) / startWidth;
        const heightRatio = (startHeight + heightChange) / startHeight;
        const ratio = (widthRatio + heightRatio) / 2;
        
        newWidth = Math.max(50, Math.min(1000, startWidth * ratio));
        newHeight = Math.max(50, Math.min(1000, startWidth * ratio / aspectRatio));
      } else if (type === 'right') {
        newWidth = Math.max(50, Math.min(1000, startWidth + deltaX));
      } else if (type === 'bottom') {
        newHeight = Math.max(50, Math.min(1000, startHeight + deltaY));
      }

      onUpdateStyle(id, { width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const isPlaceholder = typeof src === 'string' && src.trim().startsWith('{{') && src.trim().endsWith('}}');
  const displaySrc = isPlaceholder ? '' : src;

  return (
    <div
      ref={setNodeRef}
      className={`canvas-image-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${style.width}px`,
        height: `${style.height}px`,
        opacity: style.opacity !== undefined ? style.opacity / 100 : 1,
        ...style_transform,
      }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...listeners}
      {...attributes}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      {isPlaceholder ? (
        <div className="image-placeholder">
          <div className="image-placeholder-icon">🖼️</div>
          <div className="image-placeholder-text">{src}</div>
        </div>
      ) : (
        <img
          src={displaySrc}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: style.objectFit,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
          onError={(e) => {
            // Show error placeholder if image fails to load
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            if (!target.parentElement?.querySelector('.image-error')) {
              const errorDiv = document.createElement('div');
              errorDiv.className = 'image-error';
              errorDiv.textContent = 'Failed to load image';
              target.parentElement?.appendChild(errorDiv);
            }
          }}
        />
      )}
      {isSelected && !isResizing && (
        <>
          {/* Corner resize handle */}
          <div
            className="resize-handle resize-handle-corner"
            onMouseDown={(e) => handleResizeStart(e, 'corner')}
            title="Drag to resize (maintains aspect ratio)"
          />
          {/* Right edge resize handle */}
          <div
            className="resize-handle resize-handle-right"
            onMouseDown={(e) => handleResizeStart(e, 'right')}
            title="Drag to resize width"
          />
          {/* Bottom edge resize handle */}
          <div
            className="resize-handle resize-handle-bottom"
            onMouseDown={(e) => handleResizeStart(e, 'bottom')}
            title="Drag to resize height"
          />
        </>
      )}
    </div>
  );
}

export default ImageElement;
