/**
 * BoundaryLine.tsx
 *
 * A draggable horizontal line rendered inside the canvas that marks the
 * boundary between the header/footer zone and the content zone.
 *
 * Behaviour:
 *  - Always visible as a faint line (even when disabled)
 *  - Clicking it selects it and shows its settings panel
 *  - Dragging moves the boundaryY position
 *  - Settings panel: enable toggle, repeat toggle, zone style, delete
 *  - Footer only: page number settings appear when a page number element
 *    is selected (handled in PropertiesPanel, not here)
 */

import React, { useCallback, useRef } from 'react';
import type { HeaderConfig, FooterConfig } from '../../types/canvas';
import './BoundaryLine.css';

type ZoneConfig = HeaderConfig | FooterConfig;

interface BoundaryLineProps {
  type       : 'header' | 'footer';
  config     : ZoneConfig;
  isSelected : boolean;
  canvasH    : number;   // canvas height in px (1123)
  onSelect   : () => void;
  onDeselect : () => void;
  onChange   : (updated: ZoneConfig) => void;
  onDelete   : () => void;
}

const BoundaryLine: React.FC<BoundaryLineProps> = ({
  type,
  config,
  isSelected,
  canvasH,
  onSelect,
  onDeselect,
  onChange,
  onDelete,
}) => {
  const isDragging = useRef(false);
  const startY     = useRef(0);
  const startBY    = useRef(config.boundaryY);

  // ── Drag handling ─────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    startY.current     = e.clientY;
    startBY.current    = config.boundaryY;

    const onMove = (me: MouseEvent) => {
      if (!isDragging.current) return;
      const delta    = me.clientY - startY.current;
      const minY     = type === 'header' ? 20  : 200;
      const maxY     = type === 'header' ? canvasH - 200 : canvasH - 20;
      const newY     = Math.max(minY, Math.min(maxY, startBY.current + delta));
      onChange({ ...config, boundaryY: Math.round(newY) });
    };

    const onUp = () => {
      isDragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [config, type, canvasH, onChange]);

  const handleLineClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected) onDeselect();
    else onSelect();
  };

  // ── Style helpers ─────────────────────────────────────────────────────────

  const isHeader = type === 'header';
  const label    = isHeader ? 'Header' : 'Footer';
  const icon     = isHeader ? '⬆' : '⬇';

  return (
    <div
      className={`boundary-line boundary-line--${type} ${isSelected ? 'boundary-line--selected' : ''} ${config.enabled ? 'boundary-line--enabled' : ''}`}
      style={{ top: `${config.boundaryY}px` }}
    >
      {/* ── Drag handle + line ── */}
      <div
        className="boundary-line__track"
        onClick={handleLineClick}
        onMouseDown={handleMouseDown}
        title={`Drag to move ${label} boundary`}
      >
        <div className="boundary-line__dash" />
        <div className="boundary-line__pill">
          <span>{icon} {label}</span>
          <span className="boundary-line__chevron">{isSelected ? '▲' : '▼'}</span>
        </div>
        <div className="boundary-line__dash" />
      </div>

      {/* ── Settings panel ── */}
      {isSelected && (
        <div
          className={`boundary-line__panel boundary-line__panel--${type}`}
          onClick={e => e.stopPropagation()}
        >
          {/* Enable */}
          <div className="bl-field bl-field--toggle">
            <span className="bl-label">
              Enable {label}
              <span className="bl-hint">
                Elements {isHeader ? 'above' : 'below'} this line form the {label.toLowerCase()} zone.
              </span>
            </span>
            <div
              className={`bl-toggle ${config.enabled ? 'bl-toggle--on' : ''}`}
              onClick={() => onChange({ ...config, enabled: !config.enabled })}
              role="switch"
              aria-checked={config.enabled}
            >
              <div className="bl-toggle__knob" />
            </div>
          </div>

          {/* Repeat on overflow */}
          {config.enabled && (
            <div className="bl-field bl-field--toggle">
              <span className="bl-label">
                Repeat on overflow pages
                <span className="bl-hint">
                  {label} redrawn on every PDF page this canvas page produces.
                </span>
              </span>
              <div
                className={`bl-toggle ${config.repeatOnOverflow ? 'bl-toggle--on' : ''}`}
                onClick={() => onChange({ ...config, repeatOnOverflow: !config.repeatOnOverflow })}
                role="switch"
                aria-checked={config.repeatOnOverflow}
              >
                <div className="bl-toggle__knob" />
              </div>
            </div>
          )}

          {/* Zone style — only when enabled */}
          {config.enabled && (
            <>
              <div className="bl-field">
                <span className="bl-label">Background</span>
                <input
                  type="color"
                  className="bl-color"
                  value={config.style.backgroundColor === 'transparent' ? '#ffffff' : config.style.backgroundColor}
                  onChange={e => onChange({
                    ...config,
                    style: { ...config.style, backgroundColor: e.target.value },
                  })}
                />
              </div>

              <div className="bl-field">
                <span className="bl-label">Border color</span>
                <input
                  type="color"
                  className="bl-color"
                  value={config.style.borderColor}
                  onChange={e => onChange({
                    ...config,
                    style: { ...config.style, borderColor: e.target.value },
                  })}
                />
              </div>

              <div className="bl-field">
                <span className="bl-label">Border width (px)</span>
                <input
                  type="number"
                  className="bl-input"
                  min={0}
                  max={8}
                  value={config.style.borderWidth}
                  onChange={e => onChange({
                    ...config,
                    style: { ...config.style, borderWidth: Number(e.target.value) },
                  })}
                />
              </div>

              <div className="bl-field">
                <span className="bl-label">Boundary Y (px)</span>
                <input
                  type="number"
                  className="bl-input"
                  min={20}
                  max={canvasH - 20}
                  value={config.boundaryY}
                  onChange={e => onChange({ ...config, boundaryY: Number(e.target.value) })}
                />
              </div>
            </>
          )}

          {/* Delete */}
          <button className="bl-delete" type="button" onClick={onDelete}>
            🗑 Remove {label} zone
          </button>
        </div>
      )}
    </div>
  );
};

export default BoundaryLine;