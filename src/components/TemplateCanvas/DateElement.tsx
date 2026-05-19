import { useDraggable } from '@dnd-kit/core';
import './DateElement.css';

interface DateElementProps {
  id: string;
  value?: string;
  time?: string;
  includeTime?: boolean;
  format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD Mon YYYY';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
  onUpdate: (id: string, updates: { value?: string; time?: string; includeTime?: boolean; format?: string }) => void;
  onElementSelect?: () => void;
  isSelected?: boolean;
}

function DateElement({ id, value = '', time = '', includeTime = false, format = 'MM/DD/YYYY', position, style, onElementSelect, isSelected }: DateElementProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
  });

  const style_transform = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  const handleElementClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onElementSelect?.();
  };

  const formatDate = (dateString: string): string => {
    if (!dateString) return 'Date';

    try {
      const date = new Date(dateString + 'T00:00:00');
      if (isNaN(date.getTime())) return dateString;

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const monthName = date.toLocaleString('en-US', { month: 'short' });

      switch (format) {
        case 'MM/DD/YYYY':
          return `${month}/${day}/${year}`;
        case 'DD/MM/YYYY':
          return `${day}/${month}/${year}`;
        case 'YYYY-MM-DD':
          return `${year}-${month}-${day}`;
        case 'MMM DD, YYYY':
          return `${monthName} ${day}, ${year}`;
        case 'DD Mon YYYY':
          return `${day} ${monthName} ${year}`;
        default:
          return `${month}/${day}/${year}`;
      }
    } catch {
      return dateString;
    }
  };

  const formatTime = (timeString: string): string => {
    if (!timeString) return '';

    try {
      const [hours, minutes] = timeString.split(':');
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 || 12;
      return `${displayHour}:${minutes} ${ampm}`;
    } catch {
      return timeString;
    }
  };

  return (
    <div
      ref={setNodeRef}
      className={`canvas-date-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        ...style_transform,
      }}
      onClick={handleElementClick}
      {...listeners}
      {...attributes}
    >
      <input
        type="text"
        value={value ? `${formatDate(value)}${includeTime && time ? ` ${formatTime(time)}` : ''}` : 'Date'}
        readOnly
        className="date-element-input"
        style={{
          fontSize: `${style.fontSize}px`,
          fontWeight: style.fontWeight,
          color: style.color,
          fontFamily: style.fontFamily,
        }}
      />
    </div>
  );
}

export default DateElement;
