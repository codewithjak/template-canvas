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

module.exports = { drawBox, drawLine, drawText, drawImage, drawTable };