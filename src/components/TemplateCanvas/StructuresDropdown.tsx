import { useState, useRef, useEffect } from 'react';
import './StructuresDropdown.css';

interface StructuresDropdownProps {
  onAddLine: () => void;
  onAddBox: () => void;
  onAddRectangle: () => void;
  onAddTriangle: () => void;
  onAddEllipse: () => void;
}

function StructuresDropdown({ onAddLine, onAddBox, onAddRectangle, onAddTriangle, onAddEllipse }: StructuresDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleAddLine = () => {
    onAddLine();
    setIsOpen(false);
  };

  const handleAddBox = () => {
    onAddBox();
    setIsOpen(false);
  };

  const handleAddRectangle = () => {
    onAddRectangle();
    setIsOpen(false);
  };

  const handleAddTriangle = () => {
    onAddTriangle();
    setIsOpen(false);
  };

  const handleAddEllipse = () => {
    onAddEllipse();
    setIsOpen(false);
  };

  return (
    <div className="structures-dropdown" ref={dropdownRef}>
      <button
        className="toolbar-icon-button structures-button"
        onClick={handleToggle}
        title="Add structural elements (lines and boxes)"
        aria-label="Add structural elements"
      >
        <span className="toolbar-icon" aria-hidden="true">{isOpen ? '▼' : '✚'}</span>
        <span className="toolbar-label">Shapes</span>
      </button>
      {isOpen && (
        <div className="structures-menu">
          <div className="structures-menu-item" onClick={handleAddLine}>
            <span className="structures-icon">📏</span>
            <span>Add Line</span>
          </div>
          <div className="structures-menu-item" onClick={handleAddBox}>
            <span className="structures-icon">▢</span>
            <span>Add Box</span>
          </div>
          <div className="structures-menu-item" onClick={handleAddRectangle}>
            <span className="structures-icon">▭</span>
            <span>Add Rectangle</span>
          </div>
          <div className="structures-menu-item" onClick={handleAddTriangle}>
            <span className="structures-icon">▲</span>
            <span>Add Triangle</span>
          </div>
          <div className="structures-menu-item" onClick={handleAddEllipse}>
            <span className="structures-icon">◯</span>
            <span>Add Ellipse</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default StructuresDropdown;
