/**
 * HeaderFooterProperties.tsx
 *
 * Properties panel section rendered when user clicks a boundary line.
 * Plugs into your existing PropertiesPanel — render this component
 * when selectedBoundary === 'header' | 'footer'.
 *
 * Usage in PropertiesPanel.tsx:
 *   import { HeaderFooterProperties } from './HeaderFooterProperties';
 *
 *   {selectedBoundary && (
 *     <HeaderFooterProperties
 *       type={selectedBoundary}
 *       config={activePage.header or activePage.footer}
 *       onChange={handleHeaderFooterChange}
 *     />
 *   )}
 */

import React from 'react';
import type { HeaderConfig, FooterConfig, PageNumberConfig } from '../../types/canvas';

type ZoneType = 'header' | 'footer';
type ZoneConfig = HeaderConfig | FooterConfig;

interface Props {
  type    : ZoneType;
  config  : ZoneConfig;
  onChange: (updated: ZoneConfig) => void;
}

// ── Small reusable toggle ─────────────────────────────────────────────────────

const Toggle: React.FC<{
  label   : string;
  checked : boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
        background: checked ? '#6366f1' : '#d1d5db',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: 'white',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
    <span style={{ fontSize: 12, color: '#374151' }}>{label}</span>
  </label>
);

// ── Main component ────────────────────────────────────────────────────────────

export const HeaderFooterProperties: React.FC<Props> = ({ type, config, onChange }) => {
  const isFooter = type === 'footer';
  const footer   = isFooter ? (config as FooterConfig) : null;
  const accent   = type === 'header' ? '#6366f1' : '#f59e0b';

  const update = (patch: Partial<ZoneConfig>) =>
    onChange({ ...config, ...patch } as ZoneConfig);

  const updateStyle = (patch: Partial<HeaderConfig['style']>) =>
    onChange({ ...config, style: { ...(config.style || {}), ...patch } } as ZoneConfig);

  const updatePageNumber = (patch: Partial<PageNumberConfig>) => {
    if (!isFooter || !footer) return;
    onChange({
      ...footer,
      pageNumber: { ...(footer.pageNumber || { elementId: '', format: 'Page X of Y', alignment: 'right', startFrom: 1 }), ...patch },
    } as FooterConfig);
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: accent,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 10, marginTop: 14,
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3,
  };

  const input: React.CSSProperties = {
    width: '100%', padding: '4px 8px', fontSize: 12, border: '1px solid #d1d5db',
    borderRadius: 4, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '12px 16px' }}>

      {/* ── Header / Footer title ── */}
      <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginBottom: 14 }}>
        {type === 'header' ? '↑ Header Zone' : '↓ Footer Zone'}
      </div>

      {/* ── Enable / Repeat toggles ── */}
      <Toggle
        label={`Enable ${type}`}
        checked={config.enabled}
        onChange={v => update({ enabled: v })}
      />
      <Toggle
        label="Repeat on every overflow page"
        checked={config.repeatOnOverflow}
        onChange={v => update({ repeatOnOverflow: v })}
      />

      {/* ── Footer-only: page numbers ── */}
      {isFooter && footer && (
        <>
          <div style={sectionTitle}>Page Numbers</div>
          <Toggle
            label="Show page numbers"
            checked={footer.showPageNumbers}
            onChange={v => update({ showPageNumbers: v } as Partial<FooterConfig>)}
          />

          {footer.showPageNumbers && (
            <div style={{ paddingLeft: 8 }}>

              <label style={fieldLabel}>Format</label>
              <select
                style={{ ...input, marginBottom: 8 }}
                value={footer.pageNumber?.format || 'Page X of Y'}
                onChange={e => updatePageNumber({ format: e.target.value as PageNumberConfig['format'] })}
              >
                <option value="Page X of Y">Page X of Y</option>
                <option value="X / Y">X / Y</option>
                <option value="X">X only</option>
              </select>

              <label style={fieldLabel}>Alignment</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {(['left', 'center', 'right'] as const).map(a => (
                  <button
                    key={a}
                    onClick={() => updatePageNumber({ alignment: a })}
                    style={{
                      flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer',
                      border: '1px solid',
                      borderColor: footer.pageNumber?.alignment === a ? accent : '#d1d5db',
                      borderRadius: 4,
                      background: footer.pageNumber?.alignment === a ? accent : 'white',
                      color: footer.pageNumber?.alignment === a ? 'white' : '#374151',
                      fontWeight: footer.pageNumber?.alignment === a ? 600 : 400,
                    }}
                  >
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>

              <label style={fieldLabel}>Start numbering from</label>
              <input
                type="number" min={1} style={{ ...input, marginBottom: 8 }}
                value={footer.pageNumber?.startFrom ?? 1}
                onChange={e => updatePageNumber({ startFrom: Math.max(1, Number(e.target.value)) })}
              />
            </div>
          )}
        </>
      )}

      {/* ── Zone style ── */}
      <div style={sectionTitle}>Zone Style</div>

      <label style={fieldLabel}>Background color</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="color"
          style={{ width: 36, height: 28, border: '1px solid #d1d5db', borderRadius: 4, padding: 2, cursor: 'pointer' }}
          value={config.style?.backgroundColor || '#ffffff'}
          onChange={e => updateStyle({ backgroundColor: e.target.value })}
        />
        <input
          type="text" style={{ ...input }}
          value={config.style?.backgroundColor || ''}
          onChange={e => updateStyle({ backgroundColor: e.target.value })}
          placeholder="transparent"
        />
      </div>

      {type === 'header' ? (
        <>
          <label style={fieldLabel}>Border bottom</label>
          <input
            type="text" style={{ ...input, marginBottom: 8 }}
            value={config.style?.borderBottom || ''}
            onChange={e => updateStyle({ borderBottom: e.target.value })}
            placeholder="e.g. 1px solid #e2e8f0"
          />
        </>
      ) : (
        <>
          <label style={fieldLabel}>Border top</label>
          <input
            type="text" style={{ ...input, marginBottom: 8 }}
            value={(config as FooterConfig).style?.borderTop || ''}
            onChange={e => updateStyle({ borderTop: e.target.value })}
            placeholder="e.g. 1px solid #e2e8f0"
          />
        </>
      )}

      <label style={fieldLabel}>Padding (px)</label>
      <input
        type="number" min={0} style={{ ...input, marginBottom: 8 }}
        value={config.style?.padding ?? 0}
        onChange={e => updateStyle({ padding: Math.max(0, Number(e.target.value)) })}
      />

    </div>
  );
};

export default HeaderFooterProperties;