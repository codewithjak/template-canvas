import { useDraggable } from '@dnd-kit/core';
import './TextElement.css';

interface RadioElementProps {
  id: string;
  options: number;
  selected?: string;
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
  onSelect: (id: string, option: string) => void;
  onUpdate: (id: string, updates: { selected?: string; orientation?: 'horizontal' | 'vertical' }) => void;
  onElementSelect?: () => void;
}

function RadioElement({ id, options = 2, selected = '', orientation = 'vertical', position, onSelect, onUpdate, onElementSelect }: RadioElementProps) {
  const handleOptionClick = (optionKey: string) => {
    onElementSelect?.();
    onSelect(id, optionKey);
    onUpdate(id, { selected: optionKey });
  };

  const handleElementClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onElementSelect?.();
  };

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  });

  const style_transform = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div
      ref={setNodeRef}
      className={`canvas-radio-element ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        display: 'flex',
        flexDirection: orientation === 'horizontal' ? 'row' : 'column',
        gap: `${position.relativeOffset || 8}px`,
        ...style_transform,
      }}
      onClick={handleElementClick}
      {...listeners}
      {...attributes}
    >
      {Array.from({ length: options }, (_, i) => {
        const optionKey = `option${i + 1}`;
        return (
          <input
            key={optionKey}
            type="radio"
            name={id}
            value={optionKey}
            checked={selected === optionKey}
            onChange={() => handleOptionClick(optionKey)}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </div>
  );
}

export default RadioElement;
