import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { ChartElementType } from '../../types/canvas';
import { DEFAULT_CHART_PALETTE } from '../../types/canvas';
import './ChartElement.css';

interface ChartElementProps {
  id: string;
  position: { x: number; y: number };
  style: ChartElementType['style'];
  chart: ChartElementType['chart'];
  isSelected?: boolean;
  onSelect: () => void;
  onUpdateStyle: (id: string, style: Partial<ChartElementType['style']>) => void;
}

const PAD = { top: 26, right: 12, bottom: 22, left: 30 };

function color(palette: string[], i: number): string {
  const p = palette && palette.length ? palette : DEFAULT_CHART_PALETTE;
  return p[i % p.length];
}

/** Render the series as an SVG. Shared geometry with the PDF drawer, kept simple on purpose. */
function ChartSvg({ chart, w, h }: { chart: ChartElementType['chart']; w: number; h: number }) {
  const data = chart.data && chart.data.length ? chart.data : [{ label: 'A', value: 1 }];
  const values = data.map(d => (Number.isFinite(d.value) ? d.value : 0));
  const max = Math.max(1, ...values);

  if (chart.kind === 'pie') {
    const total = values.reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const cx = w / 2;
    const cy = (h + (chart.title ? PAD.top : 6)) / 2;
    const r = Math.max(8, Math.min(w, h - (chart.title ? PAD.top : 0)) / 2 - 8);
    // Precompute each slice's start/end angle immutably (cumulative fractions).
    const start = -Math.PI / 2;
    const slices = values.map((v, i) => {
      const before = values.slice(0, i).reduce((s, x) => s + Math.max(0, x), 0);
      const a0 = start + (before / total) * Math.PI * 2;
      const a1 = start + ((before + Math.max(0, v)) / total) * Math.PI * 2;
      return { a0, a1 };
    });
    return (
      <>
        {slices.map(({ a0, a1 }, i) => {
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
          const path = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
          return <path key={i} d={path} fill={color(chart.palette, i)} stroke="#fff" strokeWidth={1} />;
        })}
      </>
    );
  }

  const plotX = PAD.left;
  const plotTop = chart.title ? PAD.top : 8;
  const plotW = w - PAD.left - PAD.right;
  const plotH = h - plotTop - PAD.bottom;
  const baseY = plotTop + plotH;

  if (chart.kind === 'line') {
    const step = data.length > 1 ? plotW / (data.length - 1) : 0;
    const pts = values.map((v, i) => {
      const x = plotX + step * i;
      const y = baseY - (v / max) * plotH;
      return { x, y };
    });
    const dPath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    return (
      <>
        <line x1={plotX} y1={baseY} x2={plotX + plotW} y2={baseY} stroke="#cbd5e1" strokeWidth={1} />
        <path d={dPath} fill="none" stroke={color(chart.palette, 0)} strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color(chart.palette, 0)} />
        ))}
        {chart.showValues && pts.map((p, i) => (
          <text key={i} x={p.x} y={p.y - 5} className="chart-svg__value" textAnchor="middle">{values[i]}</text>
        ))}
      </>
    );
  }

  // bar
  const gap = plotW / data.length * 0.25;
  const bw = plotW / data.length - gap;
  return (
    <>
      <line x1={plotX} y1={baseY} x2={plotX + plotW} y2={baseY} stroke="#cbd5e1" strokeWidth={1} />
      {values.map((v, i) => {
        const bh = (v / max) * plotH;
        const x = plotX + (plotW / data.length) * i + gap / 2;
        const y = baseY - bh;
        return (
          <g key={i}>
            <rect x={x} y={y} width={Math.max(1, bw)} height={Math.max(0, bh)} fill={color(chart.palette, i)} rx={2} />
            {chart.showValues && (
              <text x={x + bw / 2} y={y - 4} className="chart-svg__value" textAnchor="middle">{v}</text>
            )}
            <text x={x + bw / 2} y={baseY + 13} className="chart-svg__axis" textAnchor="middle">
              {String(data[i].label).slice(0, 6)}
            </text>
          </g>
        );
      })}
    </>
  );
}

export default function ChartElement({
  id, position, style, chart, isSelected, onSelect, onUpdateStyle,
}: ChartElementProps) {
  const [isResizing, setIsResizing] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled: isResizing });

  const style_transform = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX, startY = e.clientY;
    const startW = style.width, startH = style.height;

    const onMove = (mv: MouseEvent) => {
      const newW = Math.max(120, Math.min(1000, startW + (mv.clientX - startX)));
      const newH = Math.max(90, Math.min(1000, startH + (mv.clientY - startY)));
      onUpdateStyle(id, { width: newW, height: newH });
    };
    const onUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const w = style.width;
  const h = style.height;
  const data = chart.data && chart.data.length ? chart.data : [];

  return (
    <div
      ref={setNodeRef}
      className={`chart-element ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${w}px`,
        height: `${h}px`,
        opacity: style.opacity !== undefined ? style.opacity / 100 : 1,
        ...style_transform,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      {...listeners}
      {...attributes}
    >
      <svg className="chart-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        {chart.title && (
          <text x={w / 2} y={15} className="chart-svg__title" textAnchor="middle">{chart.title}</text>
        )}
        <ChartSvg chart={chart} w={w} h={h} />
      </svg>

      {chart.binding?.enabled && (
        <div className="chart-element__bound-badge" title={`Bound to ${chart.binding.collectionKey}`}>
          ⛓ {chart.binding.collectionKey || 'unbound'}
        </div>
      )}

      {chart.showLegend && chart.kind === 'pie' && (
        <div className="chart-element__legend">
          {data.map((d, i) => (
            <span key={i} className="chart-element__legend-item">
              <i style={{ background: color(chart.palette, i) }} />{String(d.label).slice(0, 10)}
            </span>
          ))}
        </div>
      )}

      {isSelected && !isResizing && (
        <div className="chart-resize-handle" onMouseDown={handleResizeStart} title="Drag to resize" />
      )}
    </div>
  );
}
