/**
 * BoundaryLine.tsx
 *
 * Page number settings + "Add Page Number" button are now shown only when
 * BOTH footer is enabled AND repeatOnOverflow is true — because page numbers
 * only make sense when the footer repeats on every PDF overflow page.
 */

import React, { useCallback, useRef } from 'react';
import type { HeaderConfig, FooterConfig } from '../../types/canvas';
import './BoundaryLine.css';

type ZoneConfig = HeaderConfig | FooterConfig;

interface BoundaryLineProps {
  type            : 'header' | 'footer';
  config          : ZoneConfig;
  isSelected      : boolean;
  canvasH         : number;
  onSelect        : () => void;
  onDeselect      : () => void;
  onChange        : (updated: ZoneConfig) => void;
  onDelete        : () => void;
  onAddPageNumber ?: (atY: number) => void;
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
  onAddPageNumber,
}) => {
  const isDragging = useRef(false);
  const startY     = useRef(0);
  const startBY    = useRef(config.boundaryY);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    isDragging.current = true;
    startY.current     = e.clientY;
    startBY.current    = config.boundaryY;

    const onMove = (me: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = me.clientY - startY.current;
      const minY  = type === 'header' ? 20  : 200;
      const maxY  = type === 'header' ? canvasH - 200 : canvasH - 20;
      const newY  = Math.max(minY, Math.min(maxY, startBY.current + delta));
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

  const isHeader   = type === 'header';
  const label      = isHeader ? 'Header' : 'Footer';
  const icon       = isHeader ? '⬆' : '⬇';
  const footerCfg  = config as any;
  const repeatIsOn = !isHeader && config.enabled && config.repeatOnOverflow;

  return (
    <div
      className={`boundary-line boundary-line--${type} ${isSelected ? 'boundary-line--selected' : ''} ${config.enabled ? 'boundary-line--enabled' : ''}`}
      style={{ top: `${config.boundaryY}px` }}
    >
      {/* Drag handle */}
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

      {/* Settings panel */}
      {isSelected && (
        <div
          className={`boundary-line__panel boundary-line__panel--${type}`}
          onClick={e => e.stopPropagation()}
        >
          {/* Enable toggle */}
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

          {config.enabled && (
            <>
              {/* Repeat on overflow */}
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

              {/* Zone style */}
              <div className="bl-field">
                <span className="bl-label">Background</span>
                <input
                  type="color"
                  className="bl-color"
                  value={config.style.backgroundColor === 'transparent' ? '#ffffff' : config.style.backgroundColor}
                  onChange={e => onChange({ ...config, style: { ...config.style, backgroundColor: e.target.value } })}
                />
              </div>

              <div className="bl-field">
                <span className="bl-label">Border color</span>
                <input
                  type="color"
                  className="bl-color"
                  value={config.style.borderColor}
                  onChange={e => onChange({ ...config, style: { ...config.style, borderColor: e.target.value } })}
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
                  onChange={e => onChange({ ...config, style: { ...config.style, borderWidth: Number(e.target.value) } })}
                />
              </div>

              <div className="bl-field">
                <span className="bl-label">Background opacity</span>
                <div className="bl-opacity-control">
                  <input
                    type="range"
                    className="bl-slider"
                    min={0}
                    max={100}
                    step={1}
                    value={(config.style.opacity ?? 1) * 100}
                    onChange={e => onChange({ ...config, style: { ...config.style, opacity: Number(e.target.value) / 100 } })}
                  />
                  <span className="bl-opacity-value">{Math.round((config.style.opacity ?? 1) * 100)}%</span>
                </div>
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

              {/* Page number section — only when footer + repeatOnOverflow */}
              {!isHeader && repeatIsOn && (
                <>
                  <div className="bl-separator" />
                  <div className="bl-section-title">
                    Page Number
                    <span className="bl-section-hint"> — repeats on every overflow page</span>
                  </div>

                  <div className="bl-field">
                    <span className="bl-label">Format</span>
                    <div className="bl-radio-group">
                      {(['Page X of Y', 'X / Y', 'X'] as const).map(fmt => (
                        <label
                          key={fmt}
                          className={`bl-radio-option ${footerCfg.pageNumberFormat === fmt ? 'bl-radio-option--selected' : ''}`}
                        >
                          <input
                            type="radio"
                            name="pn-format"
                            value={fmt}
                            checked={footerCfg.pageNumberFormat === fmt}
                            onChange={() => onChange({ ...config, pageNumberFormat: fmt } as any)}
                          />
                          <span>{fmt}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bl-field">
                    <span className="bl-label">Alignment</span>
                    <div className="bl-align-group">
                      {(['left', 'center', 'right'] as const).map(align => (
                        <button
                          key={align}
                          type="button"
                          className={`bl-align-btn ${footerCfg.pageNumberAlignment === align ? 'bl-align-btn--active' : ''}`}
                          onClick={() => onChange({ ...config, pageNumberAlignment: align } as any)}
                          title={align}
                        >
                          {align === 'left' ? '⬅' : align === 'center' ? '↔' : '➡'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bl-field">
                    <span className="bl-label">Start numbering from</span>
                    <input
                      type="number"
                      className="bl-input"
                      min={1}
                      max={999}
                      value={footerCfg.pageNumberStartFrom ?? 1}
                      onChange={e => onChange({ ...config, pageNumberStartFrom: Math.max(1, Number(e.target.value)) } as any)}
                    />
                  </div>

                  <p className="bl-hint bl-hint--preview">
                    Preview:{' '}
                    <strong>
                      {footerCfg.pageNumberFormat === 'X / Y'
                        ? `${footerCfg.pageNumberStartFrom ?? 1} / N`
                        : footerCfg.pageNumberFormat === 'X'
                        ? String(footerCfg.pageNumberStartFrom ?? 1)
                        : `Page ${footerCfg.pageNumberStartFrom ?? 1} of N`}
                    </strong>
                  </p>

                  {onAddPageNumber && (
                    <button
                      className="bl-add-pagenum"
                      type="button"
                      onClick={() => {
                        onAddPageNumber(config.boundaryY + 16);
                        onDeselect();
                      }}
                    >
                      # Add Page Number to Footer
                    </button>
                  )}
                </>
              )}

              {/* Nudge when repeat is off */}
              {!isHeader && !repeatIsOn && (
                <p className="bl-hint bl-hint--muted">
                  Turn on <strong>Repeat on overflow pages</strong> to enable page numbering.
                </p>
              )}
            </>
          )}

          <button className="bl-delete" type="button" onClick={onDelete}>
            🗑 Remove {label} zone
          </button>
        </div>
      )}
    </div>
  );
};

export default BoundaryLine;