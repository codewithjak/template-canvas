/**
 * ChartProperties.tsx
 *
 * Shown when a chart is selected. Lets the user pick the chart type, title,
 * size, and labels. The chart's numbers can either be bound to a collection
 * in the data (so they fill in automatically) or typed in by hand as sample
 * data points.
 */

import type { ChartElementType, UpdateElement } from './elementTypes';

interface Props {
  element: ChartElementType;
  onUpdate: UpdateElement;
}

// What we use for the binding when the chart doesn't have one yet.
const EMPTY_BINDING = { enabled: false, collectionKey: '', labelField: '', valueField: '' };

function ChartProperties({ element, onUpdate }: Props) {
  const chart = element.chart;
  const binding = chart.binding ?? EMPTY_BINDING;

  // Save a change to one field inside the chart's settings.
  const setChart = (patch: Partial<ChartElementType['chart']>) => {
    onUpdate(element.id, { chart: { ...chart, ...patch } });
  };

  // Save a change to one field inside the chart's data binding.
  const setBinding = (patch: Partial<typeof binding>) => {
    setChart({ binding: { ...binding, ...patch } });
  };

  // Save a change to one field inside the chart's "style" object.
  const setStyle = (patch: Partial<ChartElementType['style']>) => {
    onUpdate(element.id, { style: { ...element.style, ...patch } });
  };

  return (
    <div className="property-section">
      <div className="property-section-title">Chart Properties</div>

      <div className="property-group">
        <label className="property-label">Type</label>
        <select
          className="property-select"
          value={chart.kind}
          onChange={(e) => setChart({ kind: e.target.value as ChartElementType['chart']['kind'] })}
        >
          <option value="bar">Bar</option>
          <option value="line">Line</option>
          <option value="pie">Pie</option>
        </select>
      </div>

      <div className="property-group">
        <label className="property-label">Title</label>
        <input
          type="text"
          className="property-input"
          value={chart.title ?? ''}
          placeholder="(none)"
          onChange={(e) => setChart({ title: e.target.value })}
        />
      </div>

      <div className="property-group">
        <label className="property-label">Show values</label>
        <input
          type="checkbox"
          className="property-checkbox"
          checked={!!chart.showValues}
          onChange={(e) => setChart({ showValues: e.target.checked })}
        />
      </div>

      <div className="property-group">
        <label className="property-label">Show legend (pie)</label>
        <input
          type="checkbox"
          className="property-checkbox"
          checked={!!chart.showLegend}
          onChange={(e) => setChart({ showLegend: e.target.checked })}
        />
      </div>

      <div className="property-grid-two">
        <div className="property-group">
          <label className="property-label">Width</label>
          <input
            type="number" min={120} max={1000} className="property-input"
            value={element.style.width}
            onChange={(e) => setStyle({ width: Number(e.target.value) })}
          />
        </div>
        <div className="property-group">
          <label className="property-label">Height</label>
          <input
            type="number" min={90} max={1000} className="property-input"
            value={element.style.height}
            onChange={(e) => setStyle({ height: Number(e.target.value) })}
          />
        </div>
      </div>

      {/* ── Data binding ───────────────────────────────────────── */}
      <div className="property-section-title property-subtitle">Data binding</div>
      <div className="property-group">
        <label className="property-label">Bind to collection</label>
        <input
          type="checkbox"
          className="property-checkbox"
          checked={binding.enabled}
          onChange={(e) => setBinding({ enabled: e.target.checked })}
        />
      </div>
      <div className="property-group">
        <label className="property-label">Collection key</label>
        <input
          type="text" className="property-input" disabled={!binding.enabled}
          placeholder="e.g. sales"
          value={binding.collectionKey}
          onChange={(e) => setBinding({ collectionKey: e.target.value })}
        />
      </div>
      <div className="property-grid-two">
        <div className="property-group">
          <label className="property-label">Label field</label>
          <input
            type="text" className="property-input" disabled={!binding.enabled}
            placeholder="e.g. month"
            value={binding.labelField}
            onChange={(e) => setBinding({ labelField: e.target.value })}
          />
        </div>
        <div className="property-group">
          <label className="property-label">Value field</label>
          <input
            type="text" className="property-input" disabled={!binding.enabled}
            placeholder="e.g. revenue"
            value={binding.valueField}
            onChange={(e) => setBinding({ valueField: e.target.value })}
          />
        </div>
      </div>

      {/* ── Sample data (used when not bound) ──────────────────── */}
      <div className="property-section-title property-subtitle">
        {binding.enabled ? 'Sample data (preview only)' : 'Data'}
      </div>
      {chart.data.map((point, i) => (
        <div className="property-grid-two" key={i}>
          <div className="property-group">
            <input
              type="text" className="property-input"
              value={point.label}
              onChange={(e) => {
                const data = chart.data.map((row, idx) => idx === i ? { ...row, label: e.target.value } : row);
                setChart({ data });
              }}
            />
          </div>
          <div className="property-group" style={{ display: 'flex', gap: 4 }}>
            <input
              type="number" className="property-input"
              value={point.value}
              onChange={(e) => {
                const data = chart.data.map((row, idx) => idx === i ? { ...row, value: Number(e.target.value) } : row);
                setChart({ data });
              }}
            />
            <button
              type="button"
              className="property-button-secondary chart-data-remove"
              title="Remove row"
              disabled={chart.data.length <= 1}
              onClick={() => setChart({ data: chart.data.filter((_, idx) => idx !== i) })}
            >×</button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="property-button"
        onClick={() => setChart({ data: [...chart.data, { label: `Item ${chart.data.length + 1}`, value: 0 }] })}
      >+ Add data point</button>
    </div>
  );
}

export default ChartProperties;
