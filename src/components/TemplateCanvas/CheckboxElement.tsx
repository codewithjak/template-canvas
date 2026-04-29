import { useDraggable } from '@dnd-kit/core';
import './TextElement.css';

interface CheckboxElementProps {
  id: string;
  count?: number;
  checkedValues?: string[];
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number };
  onUpdate: (id: string, updates: { checkedValues?: string[]; orientation?: 'horizontal' | 'vertical' }) => void;
  onElementSelect?: () => void;
}

function CheckboxElement({ id, count = 1, checkedValues = [], orientation = 'vertical', position, onUpdate, onElementSelect }: CheckboxElementProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  });

  const style_transform = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const handleToggle = (index: number) => {
    onElementSelect?.();
    const optionKey = `option${index + 1}`;
    const newCheckedValues = checkedValues.includes(optionKey)
      ? checkedValues.filter(v => v !== optionKey)
      : [...checkedValues, optionKey];
    onUpdate(id, { checkedValues: newCheckedValues });
  };

  const handleElementClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onElementSelect?.();
  };

  return (
    <div
      ref={setNodeRef}
      className={`canvas-checkbox-element ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        display: 'flex',
        flexDirection: orientation === 'horizontal' ? 'row' : 'column',
        gap: '8px',
        ...style_transform,
      }}
      onClick={handleElementClick}
      {...listeners}
      {...attributes}
    >
      {Array.from({ length: count }, (_, i) => {
        const optionKey = `option${i + 1}`;
        return (
          <input
            key={optionKey}
            type="checkbox"
            checked={checkedValues.includes(optionKey)}
            onChange={() => handleToggle(i)}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: 'pointer' }}
          />
        );
      })}
    </div>
  );
}

export default CheckboxElement;
