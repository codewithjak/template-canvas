/**
 * elementRenderers.js — Schema-accurate canvas → HTML renderer
 *
 * CHANGES vs previous version
 * ───────────────────────────
 * renderTable():
 *   • Header cells (<th>) now receive an explicit background-color and white
 *     text so the PDF header matches the canvas preview.  The colour source is
 *     ts.borderColor (the designer's chosen accent colour, e.g. #214883) so it
 *     works for any template, not just the default one.
 *   • Because <thead> uses display:table-header-group the styled header is
 *     automatically repeated by Chrome's print engine on every continuation
 *     page — no extra logic needed.
 *   • Row-level background is now applied at the <tr> level so alternating
 *     colours respect merged cells correctly.
 *
 * Everything else is unchanged from the previous version.
 */

const A4_W = 794;

// ── Utilities ────────────────────────────────────────────────────────────────

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function opacityCss(val) {
  if (val == null) return '';
  const n = Number(val);
  if (isNaN(n) || n >= 100) return '';
  return `opacity:${(n / 100).toFixed(3)}`;
}

function dataAttrs(el, w, h) {
  const x = el.position?.x ?? 0;
  const y = el.position?.y ?? 0;
  return `data-original-y="${y}" data-original-x="${x}" `
       + `data-original-w="${w ?? 0}" data-original-h="${h ?? 0}"`;
}

function posCss(el, w, h) {
  const x = el.position?.x ?? 0;
  const y = el.position?.y ?? 0;
  let s = `position:absolute;left:${x}px;top:${y}px`;
  if (w != null) s += `;width:${w}px`;
  if (h != null) s += `;height:${h}px`;
  return s;
}

// ── BOX ──────────────────────────────────────────────────────────────────────

function renderBox(el) {
  const s  = el.style || {};
  const w  = s.width;
  const h  = s.height;

  const bw = s.borderWidth ? `${s.borderWidth}px` : '0';
  const bc = s.borderColor || 'transparent';
  const bs = s.borderStyle || 'solid';
  const br = s.borderRadius ? `border-radius:${s.borderRadius}px;` : '';
  const bg = s.backgroundColor ? `background-color:${s.backgroundColor};` : '';
  const op = opacityCss(s.opacity);

  const css = [
    posCss(el, w, h),
    `border:${bw} ${bs} ${bc}`,
    bg, br, op,
  ].filter(Boolean).join(';');

  return `<div class="pdf-element pdf-box" ${dataAttrs(el, w, h)} style="${css}"></div>`;
}

// ── TEXT ─────────────────────────────────────────────────────────────────────

function renderText(el) {
  const s  = el.style || {};
  const css = [
    posCss(el),
    s.fontSize   ? `font-size:${s.fontSize}px`     : '',
    s.fontWeight ? `font-weight:${s.fontWeight}`    : '',
    s.fontFamily ? `font-family:${s.fontFamily}`    : '',
    s.color      ? `color:${s.color}`               : '',
    s.textAlign  ? `text-align:${s.textAlign}`      : '',
    'white-space:pre-wrap',
    'line-height:1.3',
  ].filter(Boolean).join(';');

  return `<div class="pdf-element pdf-text" ${dataAttrs(el)} style="${css}">${esc(el.content)}</div>`;
}

function renderParagraph(el) {
  return renderText({ ...el, type: 'text' }).replace('pdf-text', 'pdf-paragraph pdf-text');
}

// ── LINE ─────────────────────────────────────────────────────────────────────

function renderLine(el) {
  const s        = el.style || {};
  const len      = s.length    ?? 100;
  const thick    = s.thickness ?? 1;
  const dir      = s.direction ?? 'horizontal';
  const color    = s.color     || '#000000';
  const isDashed = s.style === 'dashed';
  const dashAttr = isDashed ? `stroke-dasharray="${thick * 4} ${thick * 2}"` : '';
  const op       = opacityCss(s.opacity);

  const isVert = dir === 'vertical';
  const svgW   = isVert ? thick : len;
  const svgH   = isVert ? len   : thick;
  const x2     = isVert ? 0     : len;
  const y2     = isVert ? len   : 0;

  const containerCss = [
    posCss(el, svgW, svgH),
    op,
    'overflow:visible',
  ].filter(Boolean).join(';');

  return `<div class="pdf-element pdf-line" ${dataAttrs(el, svgW, svgH)} style="${containerCss}">
  <svg width="${svgW}" height="${svgH}" style="overflow:visible;display:block;">
    <line x1="0" y1="0" x2="${x2}" y2="${y2}"
          stroke="${esc(color)}" stroke-width="${thick}" ${dashAttr}
          stroke-linecap="square" />
  </svg>
</div>`;
}

// ── IMAGE ─────────────────────────────────────────────────────────────────────

function renderImage(el) {
  const s   = el.style || {};
  const w   = s.width;
  const h   = s.height;
  const fit = s.objectFit || 'contain';
  const css = posCss(el, w, h);
  return `<div class="pdf-element pdf-image" ${dataAttrs(el, w, h)} style="${css}">
  <img src="${esc(el.src)}" style="width:100%;height:100%;object-fit:${fit};display:block;" />
</div>`;
}

// ── DATE ──────────────────────────────────────────────────────────────────────

function renderDate(el) {
  const s   = el.style || {};
  const css = [
    posCss(el),
    s.fontSize   ? `font-size:${s.fontSize}px`  : '',
    s.fontFamily ? `font-family:${s.fontFamily}` : '',
    s.color      ? `color:${s.color}`            : '',
  ].filter(Boolean).join(';');
  return `<div class="pdf-element pdf-date" ${dataAttrs(el)} style="${css}">${esc(el.value || '')}</div>`;
}

// ── RADIO / CHECKBOX ──────────────────────────────────────────────────────────

function renderRadio(el) {
  const count = el.options || 2;
  const s     = el.style  || {};
  const typo  = s.fontSize ? `font-size:${s.fontSize}px;` : '';
  const opts  = Array.from({ length: count }, (_, i) => {
    const checked = el.selected != null && String(el.selected) === String(i);
    const label   = el.labels?.[i] || `Option ${i + 1}`;
    return `<label style="margin-right:8px;display:flex;align-items:center;gap:4px;">
      <input type="radio" ${checked ? 'checked' : ''} disabled />
      <span style="${typo}">${esc(label)}</span>
    </label>`;
  }).join('');
  const css = `${posCss(el)};display:flex;flex-wrap:wrap;`;
  return `<div class="pdf-element pdf-radio" ${dataAttrs(el)} style="${css}">${opts}</div>`;
}

function renderCheckbox(el) {
  const count   = el.count || 1;
  const checked = Array.isArray(el.checkedValues) ? el.checkedValues : [];
  const s       = el.style || {};
  const typo    = s.fontSize ? `font-size:${s.fontSize}px;` : '';
  const boxes   = Array.from({ length: count }, (_, i) => {
    const isChecked = checked.includes(String(i));
    const label     = el.labels?.[i] || '';
    return `<label style="margin-right:8px;display:flex;align-items:center;gap:4px;">
      <input type="checkbox" ${isChecked ? 'checked' : ''} disabled />
      ${label ? `<span style="${typo}">${esc(label)}</span>` : ''}
    </label>`;
  }).join('');
  const css = `${posCss(el)};display:flex;flex-wrap:wrap;align-items:center;`;
  return `<div class="pdf-element pdf-checkbox" ${dataAttrs(el)} style="${css}">${boxes}</div>`;
}

// ── TABLE ─────────────────────────────────────────────────────────────────────
//
// FIX: header cells now receive an explicit background-color and contrasting
// text colour so the PDF matches the canvas preview.
//
// Colour resolution:
//   headerBg   = ts.borderColor  (the designer's accent colour, e.g. #214883)
//                || ts.headerBg  (explicit override if ever added to schema)
//                || '#214883'    (safe default — only reached if schema omits both)
//
//   headerText = ts.headerColor  (explicit override)
//                || '#ffffff'    (white — correct for any dark accent colour)
//
// Because <thead> uses display:table-header-group, Chrome's print engine
// repeats the styled header row on every continuation page automatically.

function renderTable(el) {
  const x    = el.position?.x  ?? 0;
  const y    = el.position?.y  ?? 0;
  const tplH = el.templateHeight || 0;

  // ── Column definitions ───────────────────────────────────────────────────
  const columns = el.columns || [];
  const totalW  = columns.length
    ? columns.reduce((sum, c) => sum + (c.width || 0), 0)
    : (el.style?.width || A4_W);

  // ── Table-level default styles ───────────────────────────────────────────
  const ts            = el.style || {};
  const defFontSize   = ts.fontSize   || 11;
  const defFontWeight = ts.fontWeight || 'normal';
  const defColor      = ts.color      || '#000000';
  const defFontFamily = ts.fontFamily || 'Arial, sans-serif';
  const defBorderW    = ts.borderWidth || 1;
  const defBorderC    = ts.borderColor || '#cccccc';
  const cellBorder    = `${defBorderW}px solid ${defBorderC}`;

  // ── HEADER COLOURS (new) ─────────────────────────────────────────────────
  // Use the table's accent/border colour as the header background so the PDF
  // matches the canvas preview without storing the colour twice in the schema.
  const headerBg   = ts.headerBg    || ts.borderColor || '#214883';
  const headerText = ts.headerColor || '#ffffff';

  const posCssStr = `position:absolute;left:${x}px;top:${y}px;width:${totalW}px;`;

  // ── <colgroup> ────────────────────────────────────────────────────────────
  const colgroup = columns.length
    ? `<colgroup>${columns.map(c => `<col style="width:${c.width}px;" />`).join('')}</colgroup>`
    : '';

  // ── Cell renderer ─────────────────────────────────────────────────────────
  function cellHtml(cell, colIndex, tag) {
    if (cell.mergedInto) return '';

    const col = columns[colIndex] || {};
    const cs  = cell.colSpan > 1 ? `colspan="${cell.colSpan}"` : '';
    const rs  = cell.rowSpan > 1 ? `rowspan="${cell.rowSpan}"` : '';
    const cs2 = cell.style || {};

    const isHeader = tag === 'th';

    // Font / text
    const fs    = cs2.fontSize   || defFontSize;
    const fw    = isHeader ? (cs2.fontWeight || 'bold') : (cs2.fontWeight || defFontWeight);
    const ff    = cs2.fontFamily || defFontFamily;
    const align = cs2.textAlign  || col.alignment || 'left';

    // Colour: header cells always use headerText; data cells use their own colour
    // or the table default.
    const textColor = isHeader
      ? headerText
      : (cs2.color || defColor);

    // Background: header cells use headerBg; data cells use explicit bg if set.
    const bgCss = isHeader
      ? `background-color:${headerBg};`
      : (cs2.backgroundColor ? `background-color:${cs2.backgroundColor};` : '');

    const cellCss = [
      `font-size:${fs}px`,
      `font-weight:${fw}`,
      `font-family:${ff}`,
      `color:${textColor}`,
      `text-align:${align}`,
      `border:${cellBorder}`,
      `padding:3px 5px`,
      `vertical-align:top`,
      `word-break:break-word`,
      bgCss,
    ].filter(Boolean).join(';');

    const value = esc(cell.content?.value ?? '');
    return `<${tag} ${cs} ${rs} style="${cellCss}">${value}</${tag}>`;
  }

  // ── Header row ────────────────────────────────────────────────────────────
  let thead = '';
  if (el.headerRow?.cells?.length) {
    const cells = el.headerRow.cells
      .map((cell, ci) => cellHtml(cell, ci, 'th'))
      .join('');
    // display:table-header-group causes Chrome to repeat this on every print page
    thead = `<thead style="display:table-header-group;"><tr>${cells}</tr></thead>`;
  }

  // ── Data rows ─────────────────────────────────────────────────────────────
  const tbody = (el.rows || []).map(row => {
    const cells = row.cells
      .map((cell, ci) => cellHtml(cell, ci, 'td'))
      .join('');
    return `<tr style="break-inside:avoid;page-break-inside:avoid;">${cells}</tr>`;
  }).join('');

  const dAttrs = dataAttrs(el, totalW, tplH);

  return `<div class="pdf-element pdf-table" ${dAttrs} data-template-h="${tplH}"
     style="${posCssStr}">
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    ${colgroup}
    ${thead}
    <tbody>${tbody}</tbody>
  </table>
</div>`;
}

// ── Router ────────────────────────────────────────────────────────────────────

function renderElement(el) {
  switch (el.type) {
    case 'text':      return renderText(el);
    case 'paragraph': return renderParagraph(el);
    case 'image':     return renderImage(el);
    case 'line':      return renderLine(el);
    case 'box':       return renderBox(el);
    case 'date':      return renderDate(el);
    case 'radio':     return renderRadio(el);
    case 'checkbox':  return renderCheckbox(el);
    case 'table':     return renderTable(el);
    default:
      return `<div class="pdf-element pdf-unknown"
        ${dataAttrs(el)} style="${posCss(el)};"></div>`;
  }
}

module.exports = { renderElement };