/**
 * elementRenderers.js
 * Pure HTML rendering functions for each canvas element type.
 * No data substitution happens here – callers pass already-resolved values.
 */

// ── Utilities ───────────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function px(v, fallback = 0) {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

/** Build a CSS style string from common element properties. */
function commonStyle(element) {
  const parts = [];
  const { position, style } = element;
  if (position) {
    parts.push(`position:absolute`, `left:${px(position.x)}px`, `top:${px(position.y)}px`);
  }
  if (style) {
    if (style.width) parts.push(`width:${px(style.width)}px`);
    if (style.height) parts.push(`height:${px(style.height)}px`);
    if (style.color) parts.push(`color:${style.color}`);
    if (style.fontSize) parts.push(`font-size:${px(style.fontSize)}px`);
    if (style.fontWeight) parts.push(`font-weight:${style.fontWeight}`);
    if (style.fontFamily) parts.push(`font-family:${style.fontFamily}`);
    if (style.backgroundColor) parts.push(`background-color:${style.backgroundColor}`);
    if (style.borderColor && style.borderWidth !== undefined) {
      parts.push(`border:${px(style.borderWidth)}px solid ${style.borderColor}`);
    }
    if (style.textAlign) parts.push(`text-align:${style.textAlign}`);
    if (style.lineHeight) parts.push(`line-height:${px(style.lineHeight)}px`);
    if (style.borderRadius) parts.push(`border-radius:${px(style.borderRadius)}px`);
    if (style.opacity !== undefined) {
      const o = Number(style.opacity);
      if (!isNaN(o)) parts.push(`opacity:${o / 100}`);
    }
  }
  return parts.join(';');
}

// ── Element renderers ────────────────────────────────────────────────────────

function renderText(element) {
  return `<div style="${commonStyle(element)}">${escapeHtml(element.content || '')}</div>`;
}

function renderParagraph(element) {
  const style = commonStyle(element);
  // preserve newlines
  const content = escapeHtml(element.content || '').replace(/\n/g, '<br>');
  return `<div style="${style};white-space:pre-wrap;">${content}</div>`;
}

function renderImage(element) {
  const { x = 0, y = 0 } = element.position || {};
  const s = element.style || {};
  const w = s.width ? `width:${px(s.width)}px;` : '';
  const h = s.height ? `height:${px(s.height)}px;` : '';
  const fit = s.objectFit ? `object-fit:${s.objectFit};` : '';
  const op = s.opacity !== undefined ? `opacity:${Number(s.opacity) / 100};` : '';
  return `<img src="${escapeHtml(element.src || '')}" alt="" style="position:absolute;left:${x}px;top:${y}px;${w}${h}${fit}${op}" />`;
}

function renderLine(element) {
  const { color = '#000', thickness = 1, style: lineStyle = 'solid', length = 100, direction = 'horizontal' } = element.style || {};
  const { x = 0, y = 0 } = element.position || {};
  const isV = direction === 'vertical';
  const svgW = isV ? thickness : length;
  const svgH = isV ? length : thickness;
  const dashArray = lineStyle === 'dashed' ? '6,4' : lineStyle === 'dotted' ? '2,3' : null;
  const dash = dashArray ? `stroke-dasharray="${dashArray}"` : '';
  return `<div style="position:absolute;left:${x}px;top:${y}px;">
    <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${isV ? svgW / 2 : 0}" y1="${isV ? 0 : svgH / 2}"
            x2="${isV ? svgW / 2 : svgW}" y2="${isV ? svgH : svgH / 2}"
            stroke="${escapeHtml(color)}" stroke-width="${thickness}" ${dash} stroke-linecap="round"/>
    </svg>
  </div>`;
}

function renderBox(element) {
  return `<div style="${commonStyle(element)}"></div>`;
}

function renderRadio(element) {
  const style = commonStyle(element);
  const opts = Array.from({ length: element.options || 2 }, (_, i) =>
    `<div>${element.selected === String(i) ? '◉' : '○'} Option ${i + 1}</div>`
  ).join('');
  return `<div style="${style}">${opts}</div>`;
}

function renderCheckbox(element) {
  const style = commonStyle(element);
  const items = Array.from({ length: element.count || 1 }, (_, i) =>
    `<div>${(element.checkedValues || []).includes(String(i)) ? '☑' : '☐'} Item ${i + 1}</div>`
  ).join('');
  return `<div style="${style}">${items}</div>`;
}

function renderDate(element) {
  const style = commonStyle(element);
  const val = element.value ? escapeHtml(element.value) : '';
  const time = element.time ? ` ${escapeHtml(element.time)}` : '';
  return `<div style="${style}">${val}${time}</div>`;
}

// ── Table renderer ──────────────────────────────────────────────────────────

/**
 * Render a layout table element that has ALREADY had its cells resolved
 * (cell.content.value is the final display string).
 * The table is positioned absolutely at element.position.x/y.
 */
function renderLayoutTable(element) {
  const { x = 0, y = 0 } = element.position || {};
  const cols = element.columns || [];
  const st = element.style || {};
  const borderW = st.borderWidth != null ? Number(st.borderWidth) : 1;
  const borderC = st.borderColor || '#d1d5db';
  const defaultFS = st.fontSize || 13;
  const defaultFW = st.fontWeight || 'normal';
  const defaultColor = st.color || '#111827';
  const defaultFF = st.fontFamily || 'Arial,sans-serif';
  const border = `border:1px solid ${escapeHtml(borderC)}`;
  const tableBorder = borderW > 0
    ? `border:${borderW}px solid ${escapeHtml(borderC)};border-collapse:collapse;`
    : 'border-collapse:collapse;';

  const colgroup = cols.map(c => `<col style="width:${px(c.width)}px" />`).join('');

  // Header row
  const headerRow = element.headerRow;
  const thead = headerRow?.cells ? `<thead><tr>${
    headerRow.cells.map((cell, idx) => {
      if (cell.mergedInto) return '';
      const cs = cell.style || {};
      const align = cs.textAlign || cols[idx]?.alignment || 'left';
      const fs = cs.fontSize != null ? cs.fontSize : defaultFS;
      const fw = cs.fontWeight || 'bold';
      const bg = cs.backgroundColor ? `background-color:${escapeHtml(cs.backgroundColor)};` : 'background:#f3f4f6;';
      const rs = cell.span?.rowSpan > 1 ? ` rowspan="${cell.span.rowSpan}"` : '';
      const cs2 = cell.span?.colSpan > 1 ? ` colspan="${cell.span.colSpan}"` : '';
      const text = escapeHtml(cell.content?.value ?? '');
      return `<th${rs}${cs2} style="padding:6px 8px;${border};text-align:${align};font-size:${fs}px;font-weight:${fw};${bg}">${text}</th>`;
    }).join('')
  }</tr></thead>` : '';

  // Data rows
  const tbody = (element.rows || []).map(row => {
    const tds = (row.cells || []).map((cell, idx) => {
      if (cell.mergedInto) return '';
      const cs = cell.style || {};
      const align = cs.textAlign || cols[idx]?.alignment || 'left';
      const fs = cs.fontSize != null ? cs.fontSize : defaultFS;
      const fw = cs.fontWeight || defaultFW;
      const bg = cs.backgroundColor ? `background-color:${escapeHtml(cs.backgroundColor)};` : '';
      const rs = cell.span?.rowSpan > 1 ? ` rowspan="${cell.span.rowSpan}"` : '';
      const cs2 = cell.span?.colSpan > 1 ? ` colspan="${cell.span.colSpan}"` : '';
      const text = escapeHtml(cell.content?.value ?? '');
      return `<td${rs}${cs2} style="padding:4px 8px;${border};text-align:${align};font-size:${fs}px;font-weight:${fw};${bg}">${text}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const tableW = cols.reduce((s, c) => s + px(c.width), 0) || 'auto';
  const baseFont = `font-size:${defaultFS}px;font-family:${escapeHtml(defaultFF)};color:${escapeHtml(defaultColor)};`;
  return `<table style="position:absolute;left:${x}px;top:${y}px;width:${tableW}px;${tableBorder}${baseFont}"><colgroup>${colgroup}</colgroup>${thead}<tbody>${tbody}</tbody></table>`;
}

// ── Default fallback ─────────────────────────────────────────────────────────

function renderDefault(element) {
  return `<div style="${commonStyle(element)}"></div>`;
}

// ── Dispatch map ─────────────────────────────────────────────────────────────

const RENDERERS = {
  text: renderText,
  paragraph: renderParagraph,
  image: renderImage,
  line: renderLine,
  box: renderBox,
  table: renderLayoutTable,
  radio: renderRadio,
  checkbox: renderCheckbox,
  date: renderDate,
};

function renderElement(element) {
  const fn = RENDERERS[element.type] || renderDefault;
  return fn(element);
}

module.exports = { renderElement, escapeHtml };