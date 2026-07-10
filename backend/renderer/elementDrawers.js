/**
 * elementDrawers.js
 *
 * One draw function per canvas element type.
 * Each function draws directly to the pdf-lib page at the given PDF coordinates.
 *
 * Convention:
 *   - All x, y, w, h parameters are in PDF POINTS (already converted via px())
 *   - y is the TOP edge of the element in PDF bottom-left coordinates
 *     (i.e., the caller passes pageManager.y, which is the top of where to draw)
 *   - Each function returns the height it consumed in pt (so caller can advance)
 *
 * Coordinate note:
 *   pdf-lib draws text at the BASELINE. To draw text whose top edge is at y:
 *     baseline = y - fontAscent
 *   We approximate ascent as fontSize * 0.8 (good enough for Helvetica/Times).
 */

const { rgb }          = require('pdf-lib');
const { parseColor, wrapText, measureTextHeight } = require('./coordinateUtils');
const { safeWidth, drawTextSafe } = require('./textLayout');

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set fill color from a CSS color string.
 */
function setFill(page, color) {
  const [r, g, b] = parseColor(color);
  page.drawRectangle({ x: 0, y: 0, width: 0, height: 0, color: rgb(r, g, b) }); // noop to set context
  return rgb(r, g, b);
}

function colorOf(str) {
  const [r, g, b] = parseColor(str || '#000000');
  return rgb(r, g, b);
}

// ── BOX ──────────────────────────────────────────────────────────────────────

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {object} el   canvas element
 * @param {number} x    left edge in pt
 * @param {number} y    top edge in pt (pdf-lib bottom-left origin)
 * @param {number} wPt  width in pt
 * @param {number} hPt  height in pt
 */
function drawBox(page, el, x, y, wPt, hPt) {
  const s  = el.style || {};
  const bw = s.borderWidth || 0;

  // pdf-lib rect y = bottom-left corner
  const rectY = y - hPt;

  if (s.backgroundColor && s.backgroundColor !== 'transparent') {
    page.drawRectangle({
      x, y: rectY, width: wPt, height: hPt,
      color: colorOf(s.backgroundColor),
    });
  }

  if (bw > 0) {
    page.drawRectangle({
      x, y: rectY, width: wPt, height: hPt,
      borderColor : colorOf(s.borderColor || '#000000'),
      borderWidth : Math.max(0.5, bw),
      color       : undefined,
    });
  }

  return hPt;
}

// ── LINE ─────────────────────────────────────────────────────────────────────

function drawLine(page, el, x, y) {
  const s       = el.style || {};
  const lenPt   = (s.length    || 100) * (595.28 / 794);
  const thickPt = Math.max(0.5, (s.thickness || 1) * (595.28 / 794));
  const isVert  = (s.direction || 'horizontal') === 'vertical';
  const color   = colorOf(s.color || '#000000');

  if (isVert) {
    page.drawLine({
      start     : { x, y },
      end       : { x, y: y - lenPt },
      thickness : thickPt,
      color,
      dashArray : s.style === 'dashed' ? [thickPt * 4, thickPt * 2] : undefined,
    });
    return lenPt;
  } else {
    page.drawLine({
      start     : { x, y },
      end       : { x: x + lenPt, y },
      thickness : thickPt,
      color,
      dashArray : s.style === 'dashed' ? [thickPt * 4, thickPt * 2] : undefined,
    });
    return thickPt;
  }
}

// ── TEXT (single-line label) ──────────────────────────────────────────────────

/**
 * @param {import('pdf-lib').PDFPage} page
 * @param {string} text
 * @param {import('pdf-lib').PDFFont} font
 * @param {number} fontSizePt
 * @param {number} x        left edge in pt
 * @param {number} y        TOP edge in pt
 * @param {number} maxWPt   available width in pt
 * @param {string} color    CSS color
 * @param {number} lineHeightPt
 * @param {string} align    'left' | 'center' | 'right'
 * @returns {number}  total height consumed in pt
 */
function drawText(page, text, font, fontSizePt, x, y, maxWPt, color, lineHeightPt, align = 'left') {
  const lh    = lineHeightPt || fontSizePt * 1.3;
  const lines = wrapText(String(text || ''), font, fontSizePt, maxWPt);
  const col   = colorOf(color || '#000000');

  let curY = y;
  for (const line of lines) {
    if (!line && lines.length > 1) { curY -= lh; continue; }
    // baseline = curY - ascent (≈ 80% of fontSize)
    const baseline = curY - fontSizePt * 0.8;
    
    let drawX = x;
    if (align === 'center') {
      const lineWidth = font.widthOfTextAtSize(line, fontSizePt);
      drawX = x + (maxWPt - lineWidth) / 2;
    } else if (align === 'right') {
      const lineWidth = font.widthOfTextAtSize(line, fontSizePt);
      drawX = x + maxWPt - lineWidth;
    }
    
    try {
      page.drawText(line, { x: drawX, y: baseline, size: fontSizePt, font, color: col });
    } catch (e) {
      // swallow individual line errors
    }
    curY -= lh;
  }

  return lines.length * lh;
}

// ── IMAGE ─────────────────────────────────────────────────────────────────────

async function drawImage(page, pdfDoc, el, x, y, wPt, hPt) {
  if (!el._imgBytes) return hPt;

  try {
    let embedded;
    const bytes = el._imgBytes;

    // Detect format by magic bytes
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
      embedded = await pdfDoc.embedJpg(bytes);
    } else if (bytes[0] === 0x89 && bytes[1] === 0x50) {
      embedded = await pdfDoc.embedPng(bytes);
    } else {
      // Try PNG first, then JPG
      try { embedded = await pdfDoc.embedPng(bytes); }
      catch { embedded = await pdfDoc.embedJpg(bytes); }
    }

    page.drawImage(embedded, {
      x,
      y    : y - hPt,   // pdf-lib: bottom-left
      width : wPt,
      height: hPt,
    });
  } catch (err) {
    // Draw placeholder box if image fails
    page.drawRectangle({
      x, y: y - hPt, width: wPt, height: hPt,
      borderColor: colorOf('#cccccc'),
      borderWidth: 1,
    });
  }

  return hPt;
}

// ── TABLE ─────────────────────────────────────────────────────────────────────

/**
 * Draws a single table row (header or data).
 *
 * @param {import('pdf-lib').PDFPage} page
 * @param {object[]} cells        array of cell objects
 * @param {object[]} columns      column definition array
 * @param {number}   tableX       table left edge in pt
 * @param {number}   rowTopY      top edge of row in pt (pdf-lib coords)
 * @param {number}   rowHPt       row height in pt
 * @param {object}   tableStyle   table-level style object
 * @param {object}   fonts        { normal, bold } PDFFont
 * @param {boolean}  isHeader
 */
function drawTableRow(page, cells, columns, tableX, rowTopY, rowHPt, tableStyle, fonts, isHeader) {
  const SCALE   = 595.28 / 794;
  const ts      = tableStyle || {};
  const bw      = Math.max(0.5, (ts.borderWidth || 1) * SCALE);
  const bColor  = colorOf(ts.borderColor || '#cccccc');
  const defFs   = (ts.fontSize || 11) * SCALE;
  const defCol  = ts.color || '#000000';
  const headerBg   = ts.headerBg || ts.borderColor || '#214883';
  const headerText = ts.headerColor || '#ffffff';

  const rowBottomY = rowTopY - rowHPt;

  let curX = tableX;

  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    if (cell.mergedInto) { curX += (columns[ci]?.width || 0) * SCALE; continue; }

    const colW   = (columns[ci]?.width || (ts.width || 794) / cells.length) * SCALE;
    const cs2    = cell.style || {};
    const fsPt   = (cs2.fontSize || ts.fontSize || 11) * SCALE;
    const bold   = isHeader || cs2.fontWeight === 'bold';
    const font   = bold ? fonts.bold : fonts.normal;
    const align  = cs2.textAlign || columns[ci]?.alignment || 'left';

    // Background
    const bgColor = isHeader
      ? colorOf(headerBg)
      : (cs2.backgroundColor ? colorOf(cs2.backgroundColor) : null);

    if (bgColor) {
      page.drawRectangle({ x: curX, y: rowBottomY, width: colW, height: rowHPt, color: bgColor });
    }

    // Border
    if (tableStyle.showBorders !== false) {
      page.drawRectangle({
        x: curX, y: rowBottomY, width: colW, height: rowHPt,
        borderColor: bColor, borderWidth: bw,
      });
    }

    // Text
    const textColor = isHeader ? headerText : (cs2.color || defCol);
    const cellText  = cell.content?.value || '';
    const padPt     = 3 * SCALE;
    const textX     = curX + padPt;
    const textWPt   = Math.max(1, colW - padPt * 2);
    const textTopY  = rowTopY - padPt;

    drawText(page, cellText, font, fsPt, textX, textTopY, textWPt, textColor, fsPt * 1.3, align);

    curX += colW;
  }
}

/**
 * Full table draw with pagination.
 * Returns the total height consumed on the FIRST page (for single-page tables).
 * For multi-page tables, the PageManager is advanced internally.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @param {object}      el         resolved table element
 * @param {PageManager} manager
 * @param {object}      fonts      { normal, bold }
 * @returns {number}  height consumed on entry page in pt
 */
function drawTable(pdfDoc, el, manager, fonts) {
  const SCALE   = 595.28 / 794;
  const ts      = el.style || {};
  const columns = el.columns || [];
  const totalWpx = columns.length
    ? columns.reduce((s, c) => s + (c.width || 0), 0)
    : (ts.width || 794);
  const tableXpt = (el.position?.x || 0) * SCALE;

  const HDR_H_PT  = el.headerRow?.cells?.length ? 32 * SCALE : 0;
  const ROW_H_PT  = 26 * SCALE;
  const hasHeader = HDR_H_PT > 0;

  let totalConsumed = 0;

  // ── Draw header ────────────────────────────────────────────────────────────
  function drawHeader() {
    if (!hasHeader) return;
    if (!manager.fits(HDR_H_PT)) manager.newPage();
    drawTableRow(
      manager.page,
      el.headerRow.cells,
      columns,
      tableXpt,
      manager.y,
      HDR_H_PT,
      ts,
      fonts,
      true
    );
    manager.advance(HDR_H_PT);
    totalConsumed += HDR_H_PT;
  }

  drawHeader();

  // ── Draw data rows ─────────────────────────────────────────────────────────
  for (const row of (el.rows || [])) {
    if (!manager.fits(ROW_H_PT)) {
      manager.newPage();
      drawHeader();  // repeat header on continuation pages
    }

    drawTableRow(
      manager.page,
      row.cells,
      columns,
      tableXpt,
      manager.y,
      ROW_H_PT,
      ts,
      fonts,
      false
    );
    manager.advance(ROW_H_PT);
    totalConsumed += ROW_H_PT;
  }

  return totalConsumed;
}

// ── BARCODE ──────────────────────────────────────────────────────────────────

async function drawBarcode(page, pdfDoc, el, x, y, wPt, hPt) {
  const bwipjs = require('bwip-js');
  const barcodeConfig = el.barcode || {};
  const value = el.content || el.barcodeValue || '12345';
  const format = barcodeConfig.format || 'code128';

  // Map friendly names to bwip-js bcid values
  const formatMap = {
    'code128': 'code128',
    'code39': 'code39',
    'qrcode': 'qrcode',
    'ean13': 'ean13',
    'upca': 'upca',
    'itf14': 'itf14',
  };

  const bcid = formatMap[format] || 'code128';
  const isQR = bcid === 'qrcode';

  try {
    const opts = {
      bcid,
      text: String(value),
      scale: 3,
      includetext: !isQR && (barcodeConfig.showText !== false),
      textxalign: 'center',
    };

    // For non-QR codes, set height; for QR, it auto-sizes
    if (!isQR) {
      opts.height = 10;
    }

    const pngBuffer = await bwipjs.toBuffer(opts);

    // Embed as PNG in the PDF
    const embedded = await pdfDoc.embedPng(pngBuffer);
    const dims = embedded.scale(1);

    // Scale to fit within wPt x hPt while maintaining aspect ratio
    const scaleX = wPt / dims.width;
    const scaleY = hPt / dims.height;
    const s = Math.min(scaleX, scaleY);
    const drawW = dims.width * s;
    const drawH = dims.height * s;

    // Center within the element bounds
    const drawX = x + (wPt - drawW) / 2;
    const drawY = (y - hPt) + (hPt - drawH) / 2;

    page.drawImage(embedded, {
      x: drawX,
      y: drawY,
      width: drawW,
      height: drawH,
    });
  } catch (err) {
    // Fallback: draw a placeholder rectangle with error text
    const { rgb } = require('pdf-lib');
    page.drawRectangle({
      x, y: y - hPt, width: wPt, height: hPt,
      borderColor: rgb(0.8, 0.2, 0.2),
      borderWidth: 1,
    });
  }

  return hPt;
}

// ── CHART ──────────────────────────────────────────────────────────────────

const CHART_PALETTE = [
  '#4f46e5', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6',
];

/**
 * Draw a bar / line / pie chart to the page.
 *
 * @param {import('pdf-lib').PDFPage} page
 * @param {object} fonts  { normal, bold } embedded fonts
 * @param {object} el     chart canvas element (may carry resolved `_series`)
 * @param {number} x      left edge in pt
 * @param {number} yTop   top edge in pt (pdf-lib bottom-left origin)
 * @param {number} wPt    width in pt
 * @param {number} hPt    height in pt
 */
function drawChart(page, fonts, el, x, yTop, wPt, hPt) {
  const chart  = el.chart || {};
  const raw    = (Array.isArray(el._series) && el._series.length) ? el._series : (chart.data || []);
  const data   = (raw.length ? raw : [{ label: '', value: 1 }])
    .map(d => ({ label: String(d.label ?? ''), value: Number(d.value) || 0 }));
  const palette = (chart.palette && chart.palette.length) ? chart.palette : CHART_PALETTE;
  const colAt   = i => colorOf(palette[i % palette.length]);
  const font    = fonts && fonts.normal;
  const fontB   = (fonts && fonts.bold) || font;
  const white   = rgb(1, 1, 1);
  const ink     = rgb(0.2, 0.22, 0.28);
  const axisCol = rgb(0.8, 0.84, 0.88);

  const yBottom  = yTop - hPt;
  const padTop   = chart.title ? 18 : 6;
  const padBot   = 14;
  const padSide  = 6;

  // Title — chart text bypasses the resolver's WinAnsi sanitizer, so it must
  // measure and draw through the crash-proof helpers (a raw CJK/Arabic title
  // used to abort the whole export — MULTILINGUAL_EXPORT_ARCHITECTURE.md F4).
  if (chart.title && fontB) {
    const size = 9;
    const tw   = safeWidth(fontB, String(chart.title), size);
    drawTextSafe(page, String(chart.title), {
      x: x + Math.max(0, (wPt - tw) / 2), y: yTop - size - 3, size, font: fontB, color: rgb(0.12, 0.16, 0.22),
    });
  }

  // ── Pie ──────────────────────────────────────────────────────────────────
  if (chart.kind === 'pie') {
    const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    const cx = wPt / 2;
    const cy = padTop + (hPt - padTop) / 2;            // svg-space (y-down from yTop)
    const r  = Math.max(6, Math.min(wPt, hPt - padTop) / 2 - 6);
    let a0 = -Math.PI / 2;
    for (let i = 0; i < data.length; i++) {
      const frac = Math.max(0, data[i].value) / total;
      if (frac <= 0) continue;
      const a1   = a0 + frac * Math.PI * 2;
      const segs = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 30)));
      let path = `M ${cx} ${cy}`;
      for (let sIdx = 0; sIdx <= segs; sIdx++) {
        const a = a0 + (a1 - a0) * (sIdx / segs);
        path += ` L ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
      }
      path += ' Z';
      // drawSvgPath maps svg-(0,0) → (x, yTop) with svg +y going down the page.
      page.drawSvgPath(path, { x, y: yTop, color: colAt(i), borderColor: white, borderWidth: 0.75 });
      a0 = a1;
    }
    return hPt;
  }

  // ── Bar / Line plot area (native pdf coords, y-up) ─────────────────────────
  const plotLeft   = x + padSide;
  const plotRight  = x + wPt - padSide;
  const plotTop    = yTop - padTop;
  const plotBottom = yBottom + padBot;
  const plotW      = Math.max(1, plotRight - plotLeft);
  const plotH      = Math.max(1, plotTop - plotBottom);
  const max        = Math.max(1, ...data.map(d => d.value));

  page.drawLine({ start: { x: plotLeft, y: plotBottom }, end: { x: plotRight, y: plotBottom }, thickness: 0.5, color: axisCol });

  if (chart.kind === 'line') {
    const step = data.length > 1 ? plotW / (data.length - 1) : 0;
    const pts  = data.map((d, i) => ({ x: plotLeft + step * i, y: plotBottom + (d.value / max) * plotH }));
    for (let i = 1; i < pts.length; i++)
      page.drawLine({ start: pts[i - 1], end: pts[i], thickness: 1.2, color: colAt(0) });
    pts.forEach(p => page.drawCircle({ x: p.x, y: p.y, size: 1.8, color: colAt(0) }));
    if (chart.showValues && font)
      pts.forEach((p, i) => {
        const t = String(data[i].value), sz = 6.5;
        drawTextSafe(page, t, { x: p.x - safeWidth(font, t, sz) / 2, y: p.y + 3, size: sz, font, color: ink });
      });
    if (font)
      data.forEach((d, i) => {
        const lbl = String(d.label).slice(0, 8), sz = 6.5;
        drawTextSafe(page, lbl, { x: plotLeft + step * i - safeWidth(font, lbl, sz) / 2, y: plotBottom - 9, size: sz, font, color: rgb(0.39, 0.45, 0.55) });
      });
    return hPt;
  }

  // bar
  const slot = plotW / data.length;
  const bw   = slot * 0.62;
  data.forEach((d, i) => {
    const bh = (d.value / max) * plotH;
    const bx = plotLeft + slot * i + (slot - bw) / 2;
    page.drawRectangle({ x: bx, y: plotBottom, width: bw, height: Math.max(0, bh), color: colAt(i) });
    if (chart.showValues && font) {
      const t = String(d.value), sz = 6.5;
      drawTextSafe(page, t, { x: bx + (bw - safeWidth(font, t, sz)) / 2, y: plotBottom + bh + 2, size: sz, font, color: ink });
    }
    if (font) {
      const lbl = String(d.label).slice(0, 8), sz = 6.5;
      drawTextSafe(page, lbl, { x: bx + (bw - safeWidth(font, lbl, sz)) / 2, y: plotBottom - 9, size: sz, font, color: rgb(0.39, 0.45, 0.55) });
    }
  });
  return hPt;
}

module.exports = { drawBox, drawLine, drawText, drawImage, drawTable, drawBarcode, drawChart };