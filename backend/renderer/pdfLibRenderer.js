/**
 * renderer/pdfLibRenderer.js  (v2 — full refactor)
 *
 * KEY CHANGES FROM v1
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Consumes a CanonicalDocument IR ({ fields, collections, source }).
 *
 * Layout engine: computeLayout() runs once and produces a LayoutPlan.
 * The draw pass iterates the plan — no dry runs, no recalculation.
 *
 * Coordinate system: canvasToPdf() is the single conversion point.
 * Placeholder resolution: imported from utils/resolver.js — no local copy.
 *
 * LAYOUT FIX (v2.1)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * computeLayout() now uses a per-canvas-page cumulativeOffset and a
 * pdfPageBase counter so that:
 *   1. Table expansion on canvas page N does NOT shift elements on page N+1.
 *   2. When a table overflows onto extra PDF pages, the next canvas page
 *      starts on the first PDF page AFTER that overflow — no gaps, no overlap.
 */

'use strict';

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const https = require('https');
const http  = require('http');

const { replacePlaceholders, resolveCellValue } = require('../utils/resolver');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CANVAS_W   = 794;
const CANVAS_PH  = 1123;     // one canvas page height, px
const PDF_W      = 595.28;
const PDF_H      = 841.89;
const SCALE      = PDF_W / CANVAS_W;   // ≈ 0.7497

const HDR_H_PX   = 32;      // default header row height
const ROW_H_PX   = 26;      // default data  row height

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers
// ─────────────────────────────────────────────────────────────────────────────

function toColor(str) {
  if (!str || typeof str !== 'string') return rgb(0, 0, 0);
  const s = str.trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16) / 255;
      const g = parseInt(h.slice(2, 4), 16) / 255;
      const b = parseInt(h.slice(4, 6), 16) / 255;
      if (!isNaN(r + g + b)) return rgb(r, g, b);
    }
  }
  const m = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (m) return rgb(+m[1] / 255, +m[2] / 255, +m[3] / 255);
  if (s === 'white' || s === 'transparent') return rgb(1, 1, 1);
  return rgb(0, 0, 0);
}

function parseColorWithOpacity(str) {
  if (!str || typeof str !== 'string') return { color: rgb(0, 0, 0), opacity: 1 };
  const s = str.trim();
  const m = s.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
  if (m) return {
    color:   rgb(+m[1] / 255, +m[2] / 255, +m[3] / 255),
    opacity: Math.min(1, Math.max(0, +m[4])),
  };
  return { color: toColor(str), opacity: 1 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate conversion  (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an absolute canvas Y (px, top-down, cumulative-offset already applied)
 * to PDF coordinates.
 *
 * @param {number} absoluteCanvasY
 * @returns {{ pageIndex: number, pdfY: number }}
 *   pdfY = top edge of element in pdf-lib bottom-up coords on that page
 */
function canvasToPdf(absoluteCanvasY) {
  const pageIndex = Math.floor(absoluteCanvasY / CANVAS_PH);
  const localY    = absoluteCanvasY - pageIndex * CANVAS_PH;
  const pdfY      = PDF_H - localY * SCALE;
  return { pageIndex, pdfY };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page pool
// ─────────────────────────────────────────────────────────────────────────────

function getPage(pdfDoc, pages, idx) {
  while (pages.length <= idx) pages.push(pdfDoc.addPage([PDF_W, PDF_H]));
  return pages[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────────────────────────────

async function embedFonts(pdfDoc) {
  return {
    normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold:   await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Text wrapping & drawing
// ─────────────────────────────────────────────────────────────────────────────

function wrapText(text, font, fsPt, maxWPt) {
  const lines = [];

  function breakWord(word) {
    let chunk = '';
    for (const ch of word) {
      const test = chunk + ch;
      let w = 0;
      try { w = font.widthOfTextAtSize(test, fsPt); } catch (e) { /* null font during dry-run */ }
      if (w > maxWPt && chunk) { lines.push(chunk); chunk = ch; }
      else chunk = test;
    }
    if (chunk) lines.push(chunk);
  }

  for (const para of String(text || '').split('\n')) {
    if (!para) { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      let wordW = 0;
      try { wordW = font.widthOfTextAtSize(w, fsPt); } catch (e) {}
      if (wordW > maxWPt) {
        if (line) { lines.push(line); line = ''; }
        breakWord(w);
        continue;
      }
      const test = line ? `${line} ${w}` : w;
      let testW = 0;
      try { testW = font.widthOfTextAtSize(test, fsPt); } catch (e) {}
      if (testW > maxWPt && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

function drawTextAt(page, text, font, fsPt, x, topY, maxWPt, color, lhPt, align = 'left') {
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt);
  let   y     = topY;
  
  for (const line of lines) {
    if (!line && lines.length > 1) { y -= lh; continue; }
    
    let drawX = x;
    if (align === 'center') {
      const lineWidth = font.widthOfTextAtSize(line, fsPt);
      drawX = x + (maxWPt - lineWidth) / 2;
    } else if (align === 'right') {
      const lineWidth = font.widthOfTextAtSize(line, fsPt);
      drawX = x + maxWPt - lineWidth;
    }
    
    try { page.drawText(line, { x: drawX, y: y - fsPt * 0.8, size: fsPt, font, color }); } catch (e) {}
    y -= lh;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell measurement & drawing
// ─────────────────────────────────────────────────────────────────────────────

function measureCellHeight(text, font, fsPt, maxWPt, lhPt, padPt) {
  if (!text) return fsPt * 1.3 + padPt * 2;
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt);
  return lines.length * lh + padPt * 2;
}

function measureRowHeight(cells, columns, ts, fonts, isHeader, totalWpx) {
  const padPx    = 3;
  const defFsPx  = ts.fontSize || 11;
  let   maxH     = isHeader ? HDR_H_PX : ROW_H_PX;

  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    if (cell.mergedInto) continue;

    const colWpx = columns[ci]?.width || (totalWpx / cells.length);
    const cs2    = cell.style || {};
    const fsPx   = cs2.fontSize || defFsPx;
    const fsPt   = fsPx * SCALE;
    const bold   = isHeader || cs2.fontWeight === 'bold';
    const font   = bold ? fonts.bold : fonts.normal;
    const maxWPt = (colWpx - padPx * 2) * SCALE;
    const lhPt   = fsPt * 1.2;
    const padPt  = padPx * SCALE;

    const cellHPt = measureCellHeight(cell.content?.value || '', font, fsPt, maxWPt, lhPt, padPt);
    const cellHPx = cellHPt / SCALE;
    if (cellHPx > maxH) maxH = cellHPx;
  }
  return maxH;
}

function drawTableRow(page, cells, columns, tableXpx, rowTopYpdf, rowHpx, ts, fonts, isHeader) {
  const rowHpt     = rowHpx * SCALE;
  const rowBotYpdf = rowTopYpdf - rowHpt;
  const headerBg   = toColor(ts.headerBg   || ts.borderColor || '#214883');
  const headerText = toColor(ts.headerColor || '#ffffff');
  const borderC    = toColor(ts.borderColor || '#cccccc');
  const borderW    = Math.max(0.5, (ts.borderWidth || 1) * SCALE);
  const totalWpx   = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;

  let curXpx = tableXpx;
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    if (cell.mergedInto) { curXpx += columns[ci]?.width || 0; continue; }

    const colWpx = columns[ci]?.width || (totalWpx / cells.length);
    const cxPt   = curXpx * SCALE;
    const cWpt   = colWpx * SCALE;
    const cs2    = cell.style || {};
    const fsPt   = (cs2.fontSize || ts.fontSize || 11) * SCALE;
    const bold   = isHeader || cs2.fontWeight === 'bold';
    const font   = bold ? fonts.bold : fonts.normal;
    const tColor = isHeader ? headerText : toColor(cs2.color || ts.color || '#000000');
    const bgCol  = isHeader ? headerBg  : (cs2.backgroundColor ? toColor(cs2.backgroundColor) : null);
    const align  = cs2.textAlign || columns[ci]?.alignment || 'left';

    if (bgCol)
      page.drawRectangle({ x: cxPt, y: rowBotYpdf, width: cWpt, height: rowHpt, color: bgCol });
    if (ts.showBorders !== false) {
      page.drawRectangle({
        x: cxPt, y: rowBotYpdf, width: cWpt, height: rowHpt,
        borderColor: borderC, borderWidth: borderW,
      });
    }

    const padPt   = 3 * SCALE;
    const textWPt = cWpt - padPt * 2;
    drawTextAt(page, cell.content?.value || '', font, fsPt,
      cxPt + padPt, rowTopYpdf - padPt, textWPt, tColor, fsPt * 1.2, align);

    curXpx += colWpx;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Element resolvers  (IR-aware)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a static element's placeholders against ir.fields.
 */
function resolveStatic(el, irFields, fm) {
  const e = JSON.parse(JSON.stringify(el));
  if (e.type === 'text' || e.type === 'paragraph')
    e.content = replacePlaceholders(e.content || '', irFields, fm);
  if (e.type === 'image')
    e.src     = replacePlaceholders(e.src     || '', irFields, fm);
  if (e.type === 'date')
    e.value   = replacePlaceholders(e.value   || '', irFields, fm);
  return e;
}

/**
 * Resolve a table element against a collection's rows.
 */
function resolveTableEl(tableEl, collRows, irFields, fm, colMap) {
  const el = JSON.parse(JSON.stringify(tableEl));
  el._templateRowCount = (el.rows || []).length;

  if (el.headerRow?.cells) {
    el.headerRow.cells = el.headerRow.cells.map(cell =>
      cell.mergedInto ? cell : {
        ...cell,
        content: { type: 'text', value: replacePlaceholders(cell.content?.value ?? '', irFields, fm) },
        binding: undefined,
      }
    );
  }

  const tmplRows = el.rows || [];
  el.rows = collRows.flatMap((row, ri) =>
    tmplRows.map((tRow, ti) => ({
      ...tRow,
      id:    `${tRow.id}__r${ri}t${ti}`,
      cells: tRow.cells.map(cell =>
        cell.mergedInto ? cell : {
          ...cell,
          id:      `${cell.id}__r${ri}t${ti}`,
          content: { type: 'text', value: resolveCellValue(cell, row, colMap) },
          binding: undefined,
        }
      ),
    }))
  );
  return el;
}

// ─────────────────────────────────────────────────────────────────────────────
// Image preload
// ─────────────────────────────────────────────────────────────────────────────

function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function preloadImages(elements) {
  for (const el of elements) {
    if (el.type !== 'image' || !el.src) continue;
    try {
      if (el.src.startsWith('data:'))
        el._imgBytes = Buffer.from(el.src.split(',')[1] || '', 'base64');
      else if (el.src.startsWith('http'))
        el._imgBytes = await fetchBytes(el.src);
    } catch (e) { el._imgBytes = null; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-number resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolvePageNumber(el, pdfPageIdx, totalPages, footerCfg) {
  if (el.type !== 'text') return el;
  const pnCfg = el.pageNumber;
  if (!pnCfg?.enabled) return el;

  const startFrom = pnCfg.startFrom ?? footerCfg?.pageNumberStartFrom ?? 1;
  const format    = pnCfg.format    ?? footerCfg?.pageNumberFormat    ?? 'Page X of Y';
  const current   = pdfPageIdx + startFrom;
  const total     = totalPages + startFrom - 1;

  let numText;
  if      (format === 'Page X of Y') numText = `Page ${current} of ${total}`;
  else if (format === 'X / Y')       numText = `${current} / ${total}`;
  else                               numText = String(current);

  return { ...el, content: numText };
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone classifier
// ─────────────────────────────────────────────────────────────────────────────

function getZoneBounds(canvasPageIdx, pageConfigs) {
  const cfg     = pageConfigs[canvasPageIdx] || pageConfigs[0] || {};
  const hdrBY   = cfg.header?.enabled ? (cfg.header.boundaryY   || 0)         : 0;
  const ftrBY   = cfg.footer?.enabled ? (cfg.footer.boundaryY   || CANVAS_PH) : CANVAS_PH;
  return { hdrBY, ftrBY, headerHpx: hdrBY, footerHpx: CANVAS_PH - ftrBY, cfg };
}

function classifyElement(el, pageConfigs) {
  const absY          = el.position?.y || 0;
  const canvasPageIdx = Math.floor(absY / CANVAS_PH);
  const localY        = absY - canvasPageIdx * CANVAS_PH;
  const { hdrBY, ftrBY } = getZoneBounds(canvasPageIdx, pageConfigs);

  if (localY < hdrBY)  return 'header';
  if (localY >= ftrBY) return 'footer';
  return 'content';
}

// ─────────────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
//  THE LAYOUT ENGINE
// ═══════════════════════════════════════════════════════════════════════════
//
// FIX: per-canvas-page cumulativeOffset + pdfPageBase tracking.
//
// Problem the fix solves:
//   The original single global cumulativeOffset caused two bugs:
//     1. Growing blank gap — table expansion on canvas page N was added to the
//        local Y of every element on pages N+1, N+2 … pushing them down.
//     2. Overflow overlap — when a table overflowed to extra PDF pages the next
//        canvas page's elements still started at their original PDF page,
//        colliding with the overflow content.
//
// How the fix works:
//   Elements are grouped by canvas page and processed in order.
//   cumulativeOffset resets to 0 for each canvas page (fixes bug 1).
//   pdfPageBase tracks how many PDF pages all previous canvas pages consumed
//   (including overflow). Each canvas page starts immediately after the last
//   PDF page used by the previous one (fixes bug 2).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ el: object, absoluteY: number, pdfPageIdx: number, expansion: number,
 *             headerHpx: number, footerHpx: number, cfg: object }} LayoutEntry
 */

/**
 * Compute the full layout plan for all content elements.
 *
 * @param {object[]} sorted         - content elements sorted by canvas Y
 * @param {object[]} pageConfigs
 * @param {object}   fonts          - { normal, bold } embedded pdf-lib fonts
 * @returns {{ plan: LayoutEntry[], totalPages: number }}
 */
function computeLayout(sorted, pageConfigs, fonts) {
  // ── Group elements by canvas page ────────────────────────────────────────
  const byCanvasPage = new Map();
  for (const el of sorted) {
    const cpIdx = Math.floor((el.position?.y || 0) / CANVAS_PH);
    if (!byCanvasPage.has(cpIdx)) byCanvasPage.set(cpIdx, []);
    byCanvasPage.get(cpIdx).push(el);
  }

  /** @type {LayoutEntry[]} */
  const plan = [];

  // pdfPageBase = index of the first PDF page belonging to the current canvas page.
  // Starts at 0; advances past any overflow pages produced by the previous canvas page.
  let pdfPageBase = 0;

  const sortedCanvasPages = [...byCanvasPage.entries()]
    .sort((a, b) => a[0] - b[0]);

  for (const [cpIdx, elements] of sortedCanvasPages) {
    const { headerHpx, footerHpx, cfg } = getZoneBounds(cpIdx, pageConfigs);
    const availableHpx = CANVAS_PH - headerHpx - footerHpx;

    // cumulativeOffset is scoped to THIS canvas page only.
    // It pushes elements down when a table above them (on the same page) expands.
    let cumulativeOffset      = 0;
    let maxPdfPageThisSection = pdfPageBase;

    for (const el of elements) {
      const absY          = el.position?.y || 0;
      // Position of this element within the content zone of its canvas page
      const localContentY = (absY - cpIdx * CANVAS_PH) - headerHpx;

      // Apply only this canvas page's accumulated expansion
      const correctedContentY = localContentY + cumulativeOffset;

      // Which overflow sub-page within this canvas page's content zone
      const overflowPageIdx = Math.floor(correctedContentY / availableHpx);

      // absoluteY: position in the unified coordinate space used by canvasToPdf().
      // Uses pdfPageBase instead of cpIdx so overflow from previous canvas pages
      // is accounted for — this is the key fix.
      const absoluteY = pdfPageBase * CANVAS_PH
        + headerHpx
        + (correctedContentY % availableHpx)
        + overflowPageIdx * CANVAS_PH;

      const pdfPageIdx = Math.floor(absoluteY / CANVAS_PH);
      if (pdfPageIdx > maxPdfPageThisSection) maxPdfPageThisSection = pdfPageIdx;

      let expansion = 0;

      if (el.type === 'table') {
        expansion        = measureTableExpansion(el, fonts);
        cumulativeOffset += expansion;

        // Table may span multiple PDF pages — track the last page it reaches
        const tableEndAbsY = absoluteY + (el._templateRowCount || 1) * ROW_H_PX + expansion;
        const tableEndPage = Math.floor(tableEndAbsY / CANVAS_PH);
        if (tableEndPage > maxPdfPageThisSection) maxPdfPageThisSection = tableEndPage;
      }

      plan.push({ el, absoluteY, pdfPageIdx, expansion, headerHpx, footerHpx, cfg });
    }

    // Advance pdfPageBase past every PDF page this canvas page consumed,
    // including any overflow pages produced by its tables.
    pdfPageBase = maxPdfPageThisSection + 1;
  }

  // totalPages = pdfPageBase after all canvas pages have been processed
  return { plan, totalPages: pdfPageBase };
}

/**
 * Measure how much a resolved table element will expand beyond its template height.
 *
 * @param {object} el   - resolved table element (rows already populated)
 * @param {object} fonts
 * @returns {number} expansion in canvas px (≥ 0)
 */
function measureTableExpansion(el, fonts) {
  const columns  = el.columns || [];
  const ts       = el.style   || {};
  const hasHdr   = !!(el.headerRow?.cells?.length);
  const totalWpx = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;

  let actualH = hasHdr
    ? measureRowHeight(el.headerRow.cells, columns, ts, fonts, true, totalWpx)
    : 0;

  for (const row of (el.rows || [])) {
    actualH += measureRowHeight(row.cells, columns, ts, fonts, false, totalWpx);
  }

  const templateH = (hasHdr ? HDR_H_PX : 0) + (el._templateRowCount || 1) * ROW_H_PX;
  return Math.max(0, actualH - templateH);
}

// ─────────────────────────────────────────────────────────────────────────────
// Table drawing  (real pass — reads from layout plan)
// ─────────────────────────────────────────────────────────────────────────────

function drawTable(el, absoluteY, pdfDoc, pages, fonts, headerHpx, footerHpx) {
  const columns  = el.columns || [];
  const tableXpx = el.position?.x || 0;
  const ts       = el.style    || {};
  const hasHdr   = !!(el.headerRow?.cells?.length);
  const totalWpx = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;

  const bottomMarginPt = (footerHpx + 20) * SCALE;

  let curPageIdx  = Math.floor(absoluteY / CANVAS_PH);
  let curLocalYpx = absoluteY - curPageIdx * CANVAS_PH;
  let curTopYpdf  = PDF_H - curLocalYpx * SCALE;

  const hdrActualHPx = hasHdr
    ? measureRowHeight(el.headerRow.cells, columns, ts, fonts, true, totalWpx)
    : 0;

  if (hasHdr) {
    const page = getPage(pdfDoc, pages, curPageIdx);
    drawTableRow(page, el.headerRow.cells, columns, tableXpx, curTopYpdf, hdrActualHPx, ts, fonts, true);
    curLocalYpx += hdrActualHPx;
    curTopYpdf  -= hdrActualHPx * SCALE;
  }

  for (const row of (el.rows || [])) {
    const rowHpx = measureRowHeight(row.cells, columns, ts, fonts, false, totalWpx);
    const rowHpt = rowHpx * SCALE;

    if (curTopYpdf - rowHpt < bottomMarginPt) {
      curPageIdx  += 1;
      curLocalYpx  = headerHpx;
      curTopYpdf   = PDF_H - headerHpx * SCALE;

      if (hasHdr) {
        const newPage = getPage(pdfDoc, pages, curPageIdx);
        drawTableRow(newPage, el.headerRow.cells, columns, tableXpx, curTopYpdf, hdrActualHPx, ts, fonts, true);
        curLocalYpx += hdrActualHPx;
        curTopYpdf  -= hdrActualHPx * SCALE;
      }
    }

    const page = getPage(pdfDoc, pages, curPageIdx);
    drawTableRow(page, row.cells, columns, tableXpx, curTopYpdf, rowHpx, ts, fonts, false);
    curLocalYpx += rowHpx;
    curTopYpdf  -= rowHpx * SCALE;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Static element drawing
// ─────────────────────────────────────────────────────────────────────────────

async function drawElement(pdfDoc, pages, el, absoluteY, fonts) {
  const { pageIndex, pdfY } = canvasToPdf(absoluteY);
  const page = getPage(pdfDoc, pages, pageIndex);
  const xPt  = (el.position?.x || 0) * SCALE;
  const s    = el.style || {};

  switch (el.type) {
    case 'box': {
      const wPt = (s.width  || 0) * SCALE;
      const hPt = (s.height || 0) * SCALE;
      const bw  = Math.max(0, (s.borderWidth || 0) * SCALE);
      if (s.backgroundColor && s.backgroundColor !== 'transparent')
        page.drawRectangle({ x: xPt, y: pdfY - hPt, width: wPt, height: hPt,
          color: toColor(s.backgroundColor) });
      if (bw > 0)
        page.drawRectangle({ x: xPt, y: pdfY - hPt, width: wPt, height: hPt,
          borderColor: toColor(s.borderColor || '#000000'), borderWidth: bw });
      break;
    }

    case 'line': {
      const lenPt   = (s.length    || 100) * SCALE;
      const thickPt = Math.max(0.5, (s.thickness || 1) * SCALE);
      const col     = toColor(s.color || '#000000');
      const dash    = s.style === 'dashed' ? [thickPt * 3, thickPt * 2] : undefined;
      if ((s.direction || 'horizontal') === 'vertical')
        page.drawLine({ start: { x: xPt, y: pdfY }, end: { x: xPt, y: pdfY - lenPt },
          thickness: thickPt, color: col, dashArray: dash });
      else
        page.drawLine({ start: { x: xPt, y: pdfY }, end: { x: xPt + lenPt, y: pdfY },
          thickness: thickPt, color: col, dashArray: dash });
      break;
    }

    case 'text':
    case 'paragraph':
    case 'date': {
      const text = el.content || el.value || '';
      const fsPt = (s.fontSize || 12) * SCALE;
      const bold = s.fontWeight === 'bold' || s.fontWeight === '700' || Number(s.fontWeight) >= 700;
      const font = bold ? fonts.bold : fonts.normal;
      const maxW = (s.width || (CANVAS_W - (el.position?.x || 0))) * SCALE;
      const lhPt = s.lineHeight ? s.lineHeight * SCALE : fsPt * 1.3;
      drawTextAt(page, text, font, fsPt, xPt, pdfY, maxW, toColor(s.color || '#000000'), lhPt);
      break;
    }

    case 'image': {
      if (!el._imgBytes) break;
      const wPt = (s.width  || 100) * SCALE;
      const hPt = (s.height || 100) * SCALE;
      try {
        const b = el._imgBytes;
        let emb;
        if (b[0] === 0xFF && b[1] === 0xD8) emb = await pdfDoc.embedJpg(b);
        else emb = await pdfDoc.embedPng(b);
        page.drawImage(emb, { x: xPt, y: pdfY - hPt, width: wPt, height: hPt });
      } catch (e) { console.warn('[pdf] image embed failed:', e.message); }
      break;
    }

    case 'radio':
    case 'checkbox': {
      const fsPt  = 9 * SCALE;
      const items = el.type === 'radio'
        ? Array.from({ length: el.options || 2 }, (_, i) => ({
            label:   `Option ${i + 1}`,
            checked: String(el.selected) === String(i),
          }))
        : Array.from({ length: el.count || 1 }, (_, i) => ({
            label:   el.labels?.[i] || '',
            checked: (el.checkedValues || []).includes(String(i)),
          }));
      let cy = pdfY;
      for (const item of items) {
        const mark = item.checked
          ? (el.type === 'radio' ? '(*)' : '[x]')
          : (el.type === 'radio' ? '( )' : '[ ]');
        drawTextAt(page, `${mark} ${item.label}`, fonts.normal, fsPt,
          xPt, cy, 200 * SCALE, toColor('#000000'), fsPt * 1.4);
        cy -= fsPt * 1.4;
      }
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Header / footer drawing
// ─────────────────────────────────────────────────────────────────────────────

async function drawHeaderFooter(
  pdfDoc, pages, pi, totalPages,
  hdrEls, ftrEls,
  headerCfg, footerCfg,
  shouldDrawHeader, shouldDrawFooter,
  fonts
) {
  const headerBoundaryY = headerCfg?.boundaryY || 0;
  const footerBoundaryY = footerCfg?.boundaryY || CANVAS_PH;

  // ── Header background + border ───────────────────────────────────────────
  if (shouldDrawHeader && headerCfg?.style?.backgroundColor &&
      headerCfg.style.backgroundColor !== 'transparent') {
    const hHpt = headerBoundaryY * SCALE;
    const page = getPage(pdfDoc, pages, pi);
    const { color, opacity } = parseColorWithOpacity(headerCfg.style.backgroundColor);
    page.drawRectangle({
      x: 0, y: PDF_H - hHpt, width: PDF_W, height: hHpt,
      color, opacity: headerCfg.style.opacity ?? opacity,
    });
  }

  if (shouldDrawHeader && (headerCfg?.style?.borderWidth || 0) > 0) {
    const { pageIndex, pdfY } = canvasToPdf(pi * CANVAS_PH + headerBoundaryY);
    const pg = getPage(pdfDoc, pages, pageIndex);
    pg.drawLine({
      start: { x: 0, y: pdfY }, end: { x: PDF_W, y: pdfY },
      thickness: headerCfg.style.borderWidth * SCALE,
      color:     toColor(headerCfg.style.borderColor || '#e2e8f0'),
    });
  }

  // ── Header elements ──────────────────────────────────────────────────────
  if (shouldDrawHeader) {
    for (const el of hdrEls) {
      const localY = (el.position?.y || 0) % CANVAS_PH;
      await drawElement(pdfDoc, pages, el, pi * CANVAS_PH + localY, fonts);
    }
  }

  // ── Footer background + border ───────────────────────────────────────────
  if (shouldDrawFooter && footerCfg?.style?.backgroundColor &&
      footerCfg.style.backgroundColor !== 'transparent') {
    const fTopPx = footerBoundaryY;
    const fHpx   = CANVAS_PH - fTopPx;
    const page   = getPage(pdfDoc, pages, pi);
    const { pdfY: fTopPdf } = canvasToPdf(pi * CANVAS_PH + fTopPx);
    const { color, opacity } = parseColorWithOpacity(footerCfg.style.backgroundColor);
    page.drawRectangle({
      x: 0, y: fTopPdf - fHpx * SCALE, width: PDF_W, height: fHpx * SCALE,
      color, opacity: footerCfg.style.opacity ?? opacity,
    });
  }

  if (shouldDrawFooter && (footerCfg?.style?.borderWidth || 0) > 0) {
    const { pageIndex, pdfY } = canvasToPdf(pi * CANVAS_PH + footerBoundaryY);
    const pg = getPage(pdfDoc, pages, pageIndex);
    pg.drawLine({
      start: { x: 0, y: pdfY }, end: { x: PDF_W, y: pdfY },
      thickness:  footerCfg.style.borderWidth * SCALE,
      color:      toColor(footerCfg.style.borderColor || '#e2e8f0'),
    });
  }

  // ── Footer elements ──────────────────────────────────────────────────────
  for (const el of ftrEls) {
    const isPageNumEl       = el.type === 'text' && el.pageNumber?.enabled;
    const shouldDrawThisEl  = shouldDrawFooter || isPageNumEl;
    if (!shouldDrawThisEl) continue;

    const localY = (el.position?.y || 0) % CANVAS_PH;
    const absY   = pi * CANVAS_PH + localY;
    const elToDraw = isPageNumEl
      ? resolvePageNumber(el, pi, totalPages, footerCfg)
      : el;
    await drawElement(pdfDoc, pages, elToDraw, absY, fonts);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas-page → PDF-page start index mapping
// ─────────────────────────────────────────────────────────────────────────────

function buildCanvasPageMap(plan) {
  const map = new Map([[0, 0]]);
  for (const entry of plan) {
    const cpIdx = Math.floor((entry.el.position?.y || 0) / CANVAS_PH);
    if (!map.has(cpIdx)) map.set(cpIdx, entry.pdfPageIdx);
  }
  return new Map([...map.entries()].sort((a, b) => a[1] - b[1]));
}

function getCfgForPdfPage(pdfPageIdx, cpEntries, pageConfigs) {
  let best = pageConfigs[0] || {};
  for (const [cpIdx, startPdfPage] of cpEntries) {
    if (pdfPageIdx >= startPdfPage) best = pageConfigs[cpIdx] || pageConfigs[0] || {};
  }
  return best;
}

function getCanvasPageForPdfPage(pdfPageIdx, cpEntries) {
  let best = 0;
  for (const [cpIdx, startPdfPage] of cpEntries) {
    if (pdfPageIdx >= startPdfPage) best = cpIdx;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * generatePdfBuffer
 *
 * @param {{
 *   ir:                      CanonicalDocument,
 *   templateElements:        object[],
 *   fieldMapping?:           Record<string,string>,
 *   tableCollectionBindings?: Record<string,string>,
 *   collectionMappings?:     Record<string,Record<string,string>>,
 *   pageConfigs?:            object[],
 * }} params
 * @returns {Promise<Buffer>}
 */
async function generatePdfBuffer({
  ir,
  templateElements        = [],
  fieldMapping            = {},
  tableCollectionBindings = {},
  collectionMappings      = {},
  pageConfigs             = [],
}) {
  if (!ir || !ir.fields || !ir.collections) {
    throw new Error('[generatePdfBuffer] ir (CanonicalDocument) is required.');
  }

  const irFields      = ir.fields;
  const irCollections = ir.collections;

  // ── 1. Resolve all template elements ─────────────────────────────────────
  const resolved = [];
  for (const el of templateElements) {
    if (el.type === 'table' && el.schemaVersion === 2) {
      const collKey  = (
        tableCollectionBindings[el.id]
        || el.binding?.collectionKey
        || Object.keys(irCollections)[0]
        || ''
      ).trim().toLowerCase();

      const collData = irCollections[collKey] || {};
      const rows     = Array.isArray(collData) ? collData : (collData.rows || []);
      const colMap   = collectionMappings[collKey] || {};

      resolved.push(resolveTableEl(el, rows, irFields, fieldMapping, colMap));
    } else {
      resolved.push(resolveStatic(el, irFields, fieldMapping));
    }
  }

  // ── 2. Preload images ─────────────────────────────────────────────────────
  await preloadImages(resolved);

  // ── 3. Zone classification ────────────────────────────────────────────────
  const contentEls = resolved.filter(el => classifyElement(el, pageConfigs) === 'content');
  const sorted     = [...contentEls].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  // ── 4. Create PDF and embed fonts ─────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);
  const pages  = [];
  getPage(pdfDoc, pages, 0);

  // ── 5. Compute layout (per-canvas-page offsets + pdfPageBase overflow fix) ─
  const { plan, totalPages } = computeLayout(sorted, pageConfigs, fonts);

  // ── 6. Draw content elements from plan ───────────────────────────────────
  for (const entry of plan) {
    const { el, absoluteY, pdfPageIdx, headerHpx, footerHpx, cfg } = entry;

    if (el.type === 'table') {
      drawTable(el, absoluteY, pdfDoc, pages, fonts, headerHpx, footerHpx);
    } else {
      let elToDraw = el;
      if (el.type === 'text' && el.pageNumber?.enabled) {
        const footerCfg = cfg.footer || null;
        elToDraw = resolvePageNumber(el, pdfPageIdx, totalPages, footerCfg);
      }
      await drawElement(pdfDoc, pages, elToDraw, absoluteY, fonts);
    }
  }

  // ── 7. Draw headers and footers on every PDF page ─────────────────────────
  const canvasPageMap = buildCanvasPageMap(plan);
  const cpEntries     = [...canvasPageMap.entries()].sort((a, b) => a[1] - b[1]);
  const finalTotal    = Math.max(pages.length, totalPages);

  for (let pi = 0; pi < finalTotal; pi++) {
    getPage(pdfDoc, pages, pi);

    const cfg           = getCfgForPdfPage(pi, cpEntries, pageConfigs);
    const currentCpIdx  = getCanvasPageForPdfPage(pi, cpEntries);

    const headerCfg     = cfg.header || null;
    const footerCfg     = cfg.footer || null;
    const headerEnabled = !!(headerCfg?.enabled);
    const footerEnabled = !!(footerCfg?.enabled);
    const headerRepeats = headerEnabled && !!(headerCfg?.repeatOnOverflow);
    const footerRepeats = footerEnabled && !!(footerCfg?.repeatOnOverflow);

    const hdrEls = headerEnabled
      ? resolved.filter(el =>
          classifyElement(el, pageConfigs) === 'header' &&
          Math.floor((el.position?.y || 0) / CANVAS_PH) === currentCpIdx)
      : [];

    const ftrEls = footerEnabled
      ? resolved.filter(el =>
          classifyElement(el, pageConfigs) === 'footer' &&
          Math.floor((el.position?.y || 0) / CANVAS_PH) === currentCpIdx)
      : [];

    await drawHeaderFooter(
      pdfDoc, pages, pi, finalTotal,
      hdrEls, ftrEls,
      headerCfg, footerCfg,
      headerEnabled && (pi === 0 || headerRepeats),
      footerEnabled && (pi === 0 || footerRepeats),
      fonts,
    );
  }

  // ── 8. Serialize ──────────────────────────────────────────────────────────
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = { generatePdfBuffer };