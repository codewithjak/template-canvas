/**
 * ShapesMenu.tsx
 *
 * The toolbar's "Shapes" dropdown. Click the button to open a little menu of
 * shapes (line, box, rectangle, triangle, ellipse); clicking one adds it and
 * closes the menu. Clicking anywhere outside also closes it.
 */

import { useEffect, useRef, useState } from 'react';
import { Icons } from './icons';
import { Tooltip } from './IconButton';

interface ShapesMenuProps {
  onAddLine: () => void;
  onAddBox: () => void;
  onAddRectangle: () => void;
  onAddTriangle: () => void;
  onAddEllipse: () => void;
}

function ShapesMenu({ onAddLine, onAddBox, onAddRectangle, onAddTriangle, onAddEllipse }: ShapesMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu when the user clicks outside of it.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const shapes = [
    { icon: <Icons.Line />,      label: 'Line',      action: onAddLine },
    { icon: <Icons.Box />,       label: 'Box',       action: onAddBox },
    { icon: <Icons.Rectangle />, label: 'Rectangle', action: onAddRectangle },
    { icon: <Icons.Triangle />,  label: 'Triangle',  action: onAddTriangle },
    { icon: <Icons.Ellipse />,   label: 'Ellipse',   action: onAddEllipse },
  ];

  return (
    <div className="tb-shapes-wrap" ref={ref}>
      <Tooltip label="Shapes">
        <button
          className={`tb-btn tb-btn--default ${open ? 'tb-btn--active' : ''}`}
          onClick={() => setOpen(v => !v)}
          aria-label="Shapes"
          aria-expanded={open}
          aria-haspopup="true"
        >
          <Icons.Shapes />
          <span className="tb-btn__label">Shapes</span>
          <svg className="tb-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2.5 3.5 5 6l2.5-2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </Tooltip>

      {open && (
        <div className="tb-shapes-menu" role="menu">
          <div className="tb-shapes-menu__label">Shapes</div>
          {shapes.map(({ icon, label, action }) => (
            <button
              key={label}
              className="tb-shapes-item"
              role="menuitem"
              onClick={() => { action(); setOpen(false); }}
            >
              <span className="tb-shapes-item__icon">{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ShapesMenu;
