/**
 * PageNumberProperties.tsx
 *
 * Shown in the PropertiesPanel when a text element inside the footer zone
 * is selected. Lets the user toggle "is page number" and configure format,
 * alignment, and start number.
 *
 * This is a standalone section component — PropertiesPanel imports and
 * renders it when:
 *   1. selectedElement.type === 'text'
 *   2. selectedElement is inside the footer zone of its canvas page
 *      (position.y >= page.footer.boundaryY)
 */

import React from 'react';
import './PageNumberProperties.css';

export interface PageNumberConfig {
  enabled   : boolean;
  format    : 'Page X of Y' | 'X / Y' | 'X';
  alignment : 'left' | 'center' | 'right';
  startFrom : number;
}

interface PageNumberPropertiesProps {
  config   : PageNumberConfig | undefined;
  onChange : (updated: PageNumberConfig) => void;
}

const DEFAULT: PageNumberConfig = {
  enabled   : false,
  format    : 'Page X of Y',
  alignment : 'right',
  startFrom : 1,
};

const PageNumberProperties: React.FC<PageNumberPropertiesProps> = ({ config, onChange }) => {
  const cfg = config ?? DEFAULT;

  const update = (partial: Partial<PageNumberConfig>) =>
    onChange({ ...cfg, ...partial });

  return (
    <div className="pn-section">
      <div className="pn-header">
        <span className="pn-title">Page Number</span>
        <div
          className={`pn-toggle ${cfg.enabled ? 'pn-toggle--on' : ''}`}
          onClick={() => update({ enabled: !cfg.enabled })}
          role="switch"
          aria-checked={cfg.enabled}
        >
          <div className="pn-toggle__knob" />
        </div>
      </div>

      {cfg.enabled && (
        <>
          {/* Format */}
          <div className="pn-field">
            <label className="pn-label">Format</label>
            <div className="pn-radio-group">
              {(['Page X of Y', 'X / Y', 'X'] as const).map(fmt => (
                <label key={fmt} className={`pn-radio-option ${cfg.format === fmt ? 'pn-radio-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="pn-format"
                    value={fmt}
                    checked={cfg.format === fmt}
                    onChange={() => update({ format: fmt })}
                  />
                  <span>{fmt}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Alignment */}
          <div className="pn-field">
            <label className="pn-label">Alignment</label>
            <div className="pn-align-group">
              {(['left', 'center', 'right'] as const).map(align => (
                <button
                  key={align}
                  type="button"
                  className={`pn-align-btn ${cfg.alignment === align ? 'pn-align-btn--active' : ''}`}
                  onClick={() => update({ alignment: align })}
                  title={align}
                >
                  {align === 'left' ? '⬅' : align === 'center' ? '↔' : '➡'}
                </button>
              ))}
            </div>
          </div>

          {/* Start from */}
          <div className="pn-field">
            <label className="pn-label">Start numbering from</label>
            <input
              type="number"
              className="pn-input"
              min={1}
              max={999}
              value={cfg.startFrom}
              onChange={e => update({ startFrom: Math.max(1, Number(e.target.value)) })}
            />
          </div>

          <p className="pn-hint">
            Preview: <strong>
              {cfg.format === 'Page X of Y' ? `Page ${cfg.startFrom} of N` :
               cfg.format === 'X / Y'        ? `${cfg.startFrom} / N`      :
               String(cfg.startFrom)}
            </strong>
          </p>
        </>
      )}
    </div>
  );
};

export default PageNumberProperties;