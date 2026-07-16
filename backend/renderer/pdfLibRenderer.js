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
 * Coordinate system: canvasToPdf(, dim) is the single conversion point.
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

const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const https = require('https');
const http  = require('http');

const { replacePlaceholders, resolveCellValue, resolve } = require('../utils/resolver');
const { createFontContext } = require('./fontLoader');
const { safeWidth, mixedWidth, drawMixed, baseDirection } = require('./textLayout');

/**
 * Effective text direction of an element (multilingual Phase 3):
 * explicit style.direction wins; 'auto'/unset derives from the RESOLVED
 * content's first strong character, so Arabic data flips automatically.
 *
 * @param {{ direction?: string } | undefined} style
 * @param {string} text  resolved content
 * @returns {'ltr' | 'rtl'}
 */
function effectiveDirection(style, text) {
  const d = style && style.direction;
  if (d === 'ltr' || d === 'rtl') return d;
  return baseDirection(text);
}

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

function normalizeOpacity(value) {
  if (value == null || value === '') return 1;
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n > 1 ? n / 100 : n));
}

/**
 * SVG path for a rounded rectangle, origin at the box's top-left with +y going
 * DOWN — the coordinate convention page.drawSvgPath uses when given {x, y}.
 * All arguments are already in PDF points. When w === h and r === w/2 the path
 * is a circle, so callers need no separate circle case.
 *
 * @param {number} w  width in pt
 * @param {number} h  height in pt
 * @param {number} r  corner radius in pt (caller clamps to <= min(w,h)/2)
 * @returns {string}  SVG path data
 */
function roundedRectSvgPath(w, h, r) {
  return [
    `M ${r} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    'Z',
  ].join(' ');
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
function canvasToPdf(absoluteCanvasY, dim) {
  const { CANVAS_PH, PDF_H, SCALE } = dim || { CANVAS_PH: 1123, PDF_H: 841.89, SCALE: 595.28/794 };

  const pageIndex = Math.floor(absoluteCanvasY / CANVAS_PH);
  const localY    = absoluteCanvasY - pageIndex * CANVAS_PH;
  const pdfY      = PDF_H - localY * SCALE;
  return { pageIndex, pdfY };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page pool
// ─────────────────────────────────────────────────────────────────────────────

function getPage(pdfDoc, pages, idx, effPdfW = PDF_W, effPdfH = PDF_H) {
  while (pages.length <= idx) pages.push(pdfDoc.addPage([effPdfW, effPdfH]));
  return pages[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonts
// ─────────────────────────────────────────────────────────────────────────────

// Font setup lives in fontLoader.js (createFontContext) so there is a single
// font path — previously this file embedded Helvetica/HelveticaBold directly
// and fontLoader.js was never used (MULTILINGUAL_EXPORT_ARCHITECTURE.md, F1).
async function embedFonts(pdfDoc) {
  return createFontContext(pdfDoc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Text wrapping & drawing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {(t: string) => number} [widthFn]  width of a string at fsPt on the
 *   font(s) that will draw it. Defaults to the single-font safeWidth — the
 *   pre-Phase-1 behavior. Mixed-script callers pass a per-run measurer so
 *   wrapping is computed on the same fonts that draw (doc §5 caveat 3).
 */
function wrapText(text, font, fsPt, maxWPt, widthFn) {
  const lines = [];
  // safeWidth returns 0 for the null font passed during dry-run measurement
  const width = widthFn || ((t) => safeWidth(font, t, fsPt));

  function breakWord(word) {
    let chunk = '';
    for (const ch of word) {
      const test = chunk + ch;
      const w = width(test);
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
      const wordW = width(w);
      if (wordW > maxWPt) {
        if (line) { lines.push(line); line = ''; }
        breakWord(w);
        continue;
      }
      const test = line ? `${line} ${w}` : w;
      const testW = width(test);
      if (testW > maxWPt && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

/**
 * options.fontCtx — the font context from createFontContext(); when present,
 * mixed-script text measures and draws per script run on the embedded fonts
 * (options.bold selects the run weight). Pure-WinAnsi text takes the exact
 * single-font path either way, so existing Latin output is unchanged.
 */
function drawTextAt(page, text, font, fsPt, x, topY, maxWPt, color, lhPt, align = 'left', options = {}) {
  const lh      = lhPt || fsPt * 1.3;
  const fontCtx = options.fontCtx || null;
  const bold    = !!options.bold;
  const width   = (t) => mixedWidth(fontCtx, bold, font, t, fsPt);
  const lines   = wrapText(text, font, fsPt, maxWPt, width);
  let   y       = topY;
  const opacity = normalizeOpacity(options.opacity);
  const rotate  = Number(options.rotate || 0);

  for (const line of lines) {
    if (!line && lines.length > 1) { y -= lh; continue; }

    let drawX = x;
    if (align === 'center') {
      drawX = x + (maxWPt - width(line)) / 2;
    } else if (align === 'right') {
      drawX = x + maxWPt - width(line);
    }

    const drawOptions = {
      x: drawX,
      y: y - fsPt * 0.8,
      size: fsPt,
      color,
      opacity,
    };
    if (rotate) drawOptions.rotate = degrees(rotate);
    // drawMixed replaces the old silent `catch {}`: script runs draw on their
    // embedded fonts, anything else degrades to a visible "?" — never blank.
    drawMixed(page, fontCtx, bold, font, line, drawOptions);
    y -= lh;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell measurement & drawing
// ─────────────────────────────────────────────────────────────────────────────

function measureCellHeight(text, font, fsPt, maxWPt, lhPt, padPt, widthFn) {
  if (!text) return fsPt * 1.3 + padPt * 2;
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt, widthFn);
  return lines.length * lh + padPt * 2;
}

function measureRowHeight(cells, columns, ts, fonts, isHeader, totalWpx, dim) {
  const { SCALE } = dim || { SCALE: 595.28/794 };

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

    // Measure on the same fonts that will draw (mixed-script cells wrap per run)
    const widthFn = (t) => mixedWidth(fonts, bold, font, t, fsPt);
    const cellHPt = measureCellHeight(cell.content?.value || '', font, fsPt, maxWPt, lhPt, padPt, widthFn);
    const cellHPx = cellHPt / SCALE;
    if (cellHPx > maxH) maxH = cellHPx;
  }
  return maxH;
}

function drawTableRow(page, cells, columns, tableXpx, rowTopYpdf, rowHpx, ts, fonts, isHeader, dim) {
  const { CANVAS_W, SCALE } = dim || { CANVAS_W: 794, SCALE: 595.28/794 };

  const rowHpt     = rowHpx * SCALE;
  const rowBotYpdf = rowTopYpdf - rowHpt;
  const headerBg   = toColor(ts.headerBg   || ts.borderColor || '#214883');
  const headerText = toColor(ts.headerColor || '#ffffff');
  const borderC    = toColor(ts.borderColor || '#cccccc');
  const borderW    = Math.max(0.5, (ts.borderWidth || 1) * SCALE);
  const totalWpx   = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;

  // RTL table (style.direction): mirror the column order, exactly like the
  // editor preview's <table dir="rtl">. Cells and columns are reversed
  // TOGETHER so the cell↔column pairing (widths, merges) is preserved.
  const rtl      = ts.direction === 'rtl';
  const cellList = rtl ? [...cells].reverse()   : cells;
  const colList  = rtl ? [...columns].reverse() : columns;

  let curXpx = tableXpx;
  for (let ci = 0; ci < cellList.length; ci++) {
    const cell = cellList[ci];
    if (cell.mergedInto) { curXpx += colList[ci]?.width || 0; continue; }

    const colWpx = colList[ci]?.width || (totalWpx / cellList.length);
    const cxPt   = curXpx * SCALE;
    const cWpt   = colWpx * SCALE;
    const cs2    = cell.style || {};
    const fsPt   = (cs2.fontSize || ts.fontSize || 11) * SCALE;
    const bold   = isHeader || cs2.fontWeight === 'bold';
    const font   = bold ? fonts.bold : fonts.normal;
    const tColor = isHeader ? headerText : toColor(cs2.color || ts.color || '#000000');
    const bgCol  = isHeader ? headerBg  : (cs2.backgroundColor ? toColor(cs2.backgroundColor) : null);
    const align  = cs2.textAlign || colList[ci]?.alignment || (rtl ? 'right' : 'left');

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
      cxPt + padPt, rowTopYpdf - padPt, textWPt, tColor, fsPt * 1.2, align,
      { fontCtx: fonts, bold });

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
  if (e.type === 'barcode')
    e.content = replacePlaceholders(e.content || '', irFields, fm);
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

/**
 * Resolve a chart element's data series from a bound collection.
 * Falls back to the statically-authored `chart.data` when the collection is
 * missing/empty, so the chart always renders something.
 */
function resolveChartEl(chartEl, irCollections, collectionMappings) {
  const el = JSON.parse(JSON.stringify(chartEl));
  const b  = el.chart?.binding || {};
  const collKey = (b.collectionKey || '').trim().toLowerCase();
  const collData = irCollections[collKey] || {};
  const rows = Array.isArray(collData) ? collData : (collData.rows || []);
  const colMap = collectionMappings[collKey] || {};

  if (rows.length && b.valueField) {
    el._series = rows.map(row => ({
      label: String(resolve(row, colMap[b.labelField] || b.labelField) ?? ''),
      value: Number(resolve(row, colMap[b.valueField] || b.valueField)) || 0,
    }));
  }
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

function getZoneBounds(canvasPageIdx, pageConfigs, dim) {
  const CANVAS_PH_VAL = (dim && dim.CANVAS_PH) || CANVAS_PH;
  const cfg     = pageConfigs[canvasPageIdx] || pageConfigs[0] || {};
  const hdrBY   = cfg.header?.enabled ? (cfg.header.boundaryY   || 0)         : 0;
  const ftrBY   = cfg.footer?.enabled ? (cfg.footer.boundaryY   || CANVAS_PH_VAL) : CANVAS_PH_VAL;
  return { hdrBY, ftrBY, headerHpx: hdrBY, footerHpx: CANVAS_PH_VAL - ftrBY, cfg };
}

function classifyElement(el, pageConfigs, dim) {
  const CANVAS_PH_VAL = (dim && dim.CANVAS_PH) || CANVAS_PH;
  const absY          = el.position?.y || 0;
  const canvasPageIdx = Math.floor(absY / CANVAS_PH_VAL);
  const localY        = absY - canvasPageIdx * CANVAS_PH_VAL;
  const { hdrBY, ftrBY } = getZoneBounds(canvasPageIdx, pageConfigs, dim);

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
function computeLayout(sorted, pageConfigs, fonts, dim) {
  const CANVAS_PH_VAL = (dim && dim.CANVAS_PH) || CANVAS_PH;
  // ── Group elements by canvas page ────────────────────────────────────────
  const byCanvasPage = new Map();
  for (const el of sorted) {
    const cpIdx = Math.floor((el.position?.y || 0) / CANVAS_PH_VAL);
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
    const { headerHpx, footerHpx, cfg } = getZoneBounds(cpIdx, pageConfigs, dim);
    const availableHpx = CANVAS_PH_VAL - headerHpx - footerHpx;

    // cumulativeOffset is scoped to THIS canvas page only.
    // It pushes elements down when a table above them (on the same page) expands.
    let cumulativeOffset      = 0;
    let maxPdfPageThisSection = pdfPageBase;

    for (const el of elements) {
      const absY          = el.position?.y || 0;
      // Position of this element within the content zone of its canvas page
      const localContentY = (absY - cpIdx * CANVAS_PH_VAL) - headerHpx;

      // Apply only this canvas page's accumulated expansion
      let correctedContentY = localContentY + cumulativeOffset;

      // ── Generalized content flow (limitation #3) ──────────────────────────
      // A `paragraph` is a flowing text block: its data-bound content can be
      // arbitrarily tall. If it would straddle the bottom of the content zone,
      // keep it together by pushing it (and everything after it) to the top of
      // the next overflow page. Tables keep their own row-splitting logic;
      // positioned `text` labels are intentionally left untouched.
      if (el.type === 'paragraph') {
        const { height: blockH } = measureElementBlock(el, fonts, dim);
        if (blockH > 0 && blockH <= availableHpx) {
          const posInPage = ((correctedContentY % availableHpx) + availableHpx) % availableHpx;
          if (posInPage + blockH > availableHpx) {
            cumulativeOffset += availableHpx - posInPage;     // bump to next page top
            correctedContentY = localContentY + cumulativeOffset;
          }
        }
      }

      // Which overflow sub-page within this canvas page's content zone
      const overflowPageIdx = Math.floor(correctedContentY / availableHpx);

      // absoluteY: position in the unified coordinate space used by canvasToPdf(, dim).
      // Uses pdfPageBase instead of cpIdx so overflow from previous canvas pages
      // is accounted for — this is the key fix.
      const absoluteY = pdfPageBase * CANVAS_PH_VAL
        + headerHpx
        + (correctedContentY % availableHpx)
        + overflowPageIdx * CANVAS_PH_VAL;

      const pdfPageIdx = Math.floor(absoluteY / CANVAS_PH_VAL);
      if (pdfPageIdx > maxPdfPageThisSection) maxPdfPageThisSection = pdfPageIdx;

      let expansion = 0;

      if (el.type === 'table') {
        expansion        = measureTableExpansion(el, fonts, dim);
        cumulativeOffset += expansion;

        // Table may span multiple PDF pages — track the last page it reaches
        const tableEndAbsY = absoluteY + (el._templateRowCount || 1) * ROW_H_PX + expansion;
        const tableEndPage = Math.floor(tableEndAbsY / CANVAS_PH_VAL);
        if (tableEndPage > maxPdfPageThisSection) maxPdfPageThisSection = tableEndPage;
      } else if (el.type === 'paragraph') {
        // A grown paragraph pushes subsequent elements down by the extra height
        // beyond its first line, so following content reflows onto new pages.
        const { height: blockH, lineHeight } = measureElementBlock(el, fonts, dim);
        expansion        = Math.max(0, blockH - lineHeight);
        cumulativeOffset += expansion;

        const blockEndPage = Math.floor((absoluteY + blockH) / CANVAS_PH_VAL);
        if (blockEndPage > maxPdfPageThisSection) maxPdfPageThisSection = blockEndPage;
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
function measureTableExpansion(el, fonts, dim) {
  const { CANVAS_W, HDR_H_PX, ROW_H_PX } = dim || { CANVAS_W: 794, HDR_H_PX: 32, ROW_H_PX: 26 };

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

/**
 * Height (in canvas px) a non-table element actually occupies once its
 * (possibly data-bound) content is resolved. Used so the layout engine can
 * flow tall content across pages — limitation #3.
 *
 * @returns {{ height: number, lineHeight: number }}
 */
function measureElementBlock(el, fonts, dim) {
  const { CANVAS_W, SCALE } = dim || { CANVAS_W: 794, SCALE: 595.28 / 794 };
  const s = el.style || {};

  switch (el.type) {
    case 'paragraph':
    case 'text':
    case 'date': {
      const text   = el.content || el.value || '';
      const fsPt   = (s.fontSize || 12) * SCALE;
      const bold   = s.fontWeight === 'bold' || Number(s.fontWeight) >= 700;
      const font   = bold ? fonts.bold : fonts.normal;
      const maxWpx = s.width || (CANVAS_W - (el.position?.x || 0));
      const lhPx   = s.lineHeight || (s.fontSize || 12) * 1.3;
      const widthFn = (t) => mixedWidth(fonts, bold, font, t, fsPt);
      const lines  = wrapText(text, font, fsPt, maxWpx * SCALE, widthFn);
      return { height: lines.length * lhPx, lineHeight: lhPx };
    }
    case 'image':
    case 'box':
    case 'barcode':
    case 'chart':
      return { height: s.height || 0, lineHeight: s.height || 0 };
    default:
      return { height: 0, lineHeight: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Table drawing  (real pass — reads from layout plan)
// ─────────────────────────────────────────────────────────────────────────────

function drawTable(el, absoluteY, pdfDoc, pages, fonts, headerHpx, footerHpx, dim) {
  const { CANVAS_W, CANVAS_PH, PDF_H, SCALE } = dim || { CANVAS_W: 794, CANVAS_PH: 1123, PDF_H: 841.89, SCALE: 595.28/794 };

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
    const page = getPage(pdfDoc, pages, curPageIdx, dim.PDF_W, dim.PDF_H);
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
        const newPage = getPage(pdfDoc, pages, curPageIdx, dim.PDF_W, dim.PDF_H);
        drawTableRow(newPage, el.headerRow.cells, columns, tableXpx, curTopYpdf, hdrActualHPx, ts, fonts, true, dim);
        curLocalYpx += hdrActualHPx;
        curTopYpdf  -= hdrActualHPx * SCALE;
      }
    }

    const page = getPage(pdfDoc, pages, curPageIdx, dim.PDF_W, dim.PDF_H);
    drawTableRow(page, row.cells, columns, tableXpx, curTopYpdf, rowHpx, ts, fonts, false, dim);
    curLocalYpx += rowHpx;
    curTopYpdf  -= rowHpx * SCALE;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Static element drawing
// ─────────────────────────────────────────────────────────────────────────────

async function drawElement(pdfDoc, pages, el, absoluteY, fonts, dim) {
  const { CANVAS_W, SCALE } = dim || { CANVAS_W: 794, SCALE: 595.28/794 };

  const { pageIndex, pdfY } = canvasToPdf(absoluteY, dim);
  const page = getPage(pdfDoc, pages, pageIndex, dim.PDF_W, dim.PDF_H);
  const xPt  = (el.position?.x || 0) * SCALE;
  const s    = el.style || {};

  switch (el.type) {
    case 'box': {
      const wPt = (s.width  || 0) * SCALE;
      const hPt = (s.height || 0) * SCALE;
      const bw  = Math.max(0, (s.borderWidth || 0) * SCALE);
      const opacity = normalizeOpacity(s.opacity);
      const hasFill = s.backgroundColor && s.backgroundColor !== 'transparent';
      // Clamp the radius so it can never exceed half the shorter side (a larger
      // value produces a degenerate path). radius 0/unset keeps the original
      // rectangle path below, so existing boxes export byte-identically.
      const rPt = Math.min((s.borderRadius || 0) * SCALE, wPt / 2, hPt / 2);

      if (rPt <= 0) {
        if (hasFill)
          page.drawRectangle({ x: xPt, y: pdfY - hPt, width: wPt, height: hPt,
            color: toColor(s.backgroundColor), opacity });
        if (bw > 0)
          page.drawRectangle({ x: xPt, y: pdfY - hPt, width: wPt, height: hPt,
            borderColor: toColor(s.borderColor || '#000000'), borderWidth: bw, borderOpacity: opacity });
        break;
      }

      // Rounded (or, when r === w/2 === h/2, circular). drawSvgPath maps the
      // path's top-left origin to (x, y) with +y going down, so pass the box top.
      const path = roundedRectSvgPath(wPt, hPt, rPt);
      if (hasFill)
        page.drawSvgPath(path, { x: xPt, y: pdfY, color: toColor(s.backgroundColor), opacity });
      if (bw > 0)
        page.drawSvgPath(path, { x: xPt, y: pdfY,
          borderColor: toColor(s.borderColor || '#000000'), borderWidth: bw, borderOpacity: opacity });
      break;
    }

    case 'barcode': {
      const { drawBarcode } = require('./elementDrawers');
      const wPt = (s.width || 0) * SCALE;
      const hPt = (s.height || 0) * SCALE;
      await drawBarcode(page, pdfDoc, el, xPt, pdfY, wPt, hPt);
      break;
    }
    case 'chart': {
      const { drawChart } = require('./elementDrawers');
      const wPt = (s.width || 0) * SCALE;
      const hPt = (s.height || 0) * SCALE;
      drawChart(page, fonts, el, xPt, pdfY, wPt, hPt);
      break;
    }
    case 'line': {
      const lenPt   = (s.length    || 100) * SCALE;
      const thickPt = Math.max(0.5, (s.thickness || 1) * SCALE);
      const col     = toColor(s.color || '#000000');
      const dash    = s.style === 'dashed' ? [thickPt * 3, thickPt * 2] : undefined;
      const opacity = normalizeOpacity(s.opacity);
      if ((s.direction || 'horizontal') === 'vertical')
        page.drawLine({ start: { x: xPt, y: pdfY }, end: { x: xPt, y: pdfY - lenPt },
          thickness: thickPt, color: col, dashArray: dash, opacity });
      else
        page.drawLine({ start: { x: xPt, y: pdfY }, end: { x: xPt + lenPt, y: pdfY },
          thickness: thickPt, color: col, dashArray: dash, opacity });
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
      // Default alignment follows the element's direction (RTL text
      // right-aligns, like the dir-aware editor preview); explicit wins.
      const defaultAlign = effectiveDirection(s, text) === 'rtl' ? 'right' : 'left';
      drawTextAt(
        page,
        text,
        font,
        fsPt,
        xPt,
        pdfY,
        maxW,
        toColor(s.color || '#000000'),
        lhPt,
        s.textAlign || defaultAlign,
        { opacity: s.opacity, rotate: s.rotation, fontCtx: fonts, bold }
      );
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
        page.drawImage(emb, {
          x: xPt,
          y: pdfY - hPt,
          width: wPt,
          height: hPt,
          opacity: normalizeOpacity(s.opacity),
        });
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
        // RTL labels put the marker on the right, mirroring the LTR layout.
        const rtlItem = baseDirection(item.label) === 'rtl';
        const line    = rtlItem ? `${item.label} ${mark}` : `${mark} ${item.label}`;
        drawTextAt(page, line, fonts.normal, fsPt,
          xPt, cy, 200 * SCALE, toColor('#000000'), fsPt * 1.4, rtlItem ? 'right' : 'left',
          { fontCtx: fonts, bold: false });
        cy -= fsPt * 1.4;
      }
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Header / footer drawing
//
// Split into two passes so the z-order is correct (limitation #5):
//   1. drawZoneBackground — opaque background + border, drawn BEFORE content.
//   2. drawZoneElements    — header/footer elements (logo, title, page number),
//                            drawn AFTER content so they always sit on top.
// ─────────────────────────────────────────────────────────────────────────────

function drawZoneBackground(pdfDoc, pages, pi, kind, cfg, dim) {
  if (!cfg) return;
  const { CANVAS_PH, PDF_W, PDF_H, SCALE } = dim || { CANVAS_PH: 1123, PDF_W: 595.28, PDF_H: 841.89, SCALE: 595.28/794 };
  const page  = getPage(pdfDoc, pages, pi, dim.PDF_W, dim.PDF_H);
  const style = cfg.style || {};

  if (kind === 'header') {
    const boundaryY = cfg.boundaryY || 0;
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      const hHpt = boundaryY * SCALE;
      const { color, opacity } = parseColorWithOpacity(style.backgroundColor);
      page.drawRectangle({
        x: 0, y: PDF_H - hHpt, width: PDF_W, height: hHpt,
        color, opacity: style.opacity ?? opacity,
      });
    }
    if ((style.borderWidth || 0) > 0) {
      const pdfY = PDF_H - boundaryY * SCALE;
      page.drawLine({
        start: { x: 0, y: pdfY }, end: { x: PDF_W, y: pdfY },
        thickness: style.borderWidth * SCALE,
        color:     toColor(style.borderColor || '#e2e8f0'),
      });
    }
  } else {
    const boundaryY = cfg.boundaryY ?? CANVAS_PH;
    const fHpx      = CANVAS_PH - boundaryY;
    const fTopPdf   = PDF_H - boundaryY * SCALE;
    if (style.backgroundColor && style.backgroundColor !== 'transparent') {
      const { color, opacity } = parseColorWithOpacity(style.backgroundColor);
      page.drawRectangle({
        x: 0, y: fTopPdf - fHpx * SCALE, width: PDF_W, height: fHpx * SCALE,
        color, opacity: style.opacity ?? opacity,
      });
    }
    if ((style.borderWidth || 0) > 0) {
      page.drawLine({
        start: { x: 0, y: fTopPdf }, end: { x: PDF_W, y: fTopPdf },
        thickness: style.borderWidth * SCALE,
        color:     toColor(style.borderColor || '#e2e8f0'),
      });
    }
  }
}

async function drawZoneElements(pdfDoc, pages, pi, totalPages, kind, cfg, els, fonts, dim) {
  const { CANVAS_PH } = dim || { CANVAS_PH: 1123 };
  for (const el of els) {
    const localY   = (el.position?.y || 0) % CANVAS_PH;
    const absY     = pi * CANVAS_PH + localY;
    const isPageNumEl = kind === 'footer' && el.type === 'text' && el.pageNumber?.enabled;
    const elToDraw = isPageNumEl ? resolvePageNumber(el, pi, totalPages, cfg) : el;
    await drawElement(pdfDoc, pages, elToDraw, absY, fonts, dim);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas-page → PDF-page start index mapping
// ─────────────────────────────────────────────────────────────────────────────

function buildCanvasPageMap(plan, dim) {
  const { CANVAS_PH } = dim || { CANVAS_PH: 1123 };

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

// First PDF page index that a given canvas page starts on.
function getCanvasPageStartPdfPage(canvasPageIdx, cpEntries) {
  for (const [cpIdx, startPdfPage] of cpEntries) {
    if (cpIdx === canvasPageIdx) return startPdfPage;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Header / footer scope resolution
//
//   'first-page-only'        → first PDF page of its canvas page only
//   'this-page-and-overflow' → every PDF page its canvas page produces
//   'entire-document'        → master: this zone (style + elements) repeats on
//                              EVERY PDF page of the whole export
//
// `scope` is the source of truth; older templates carry only the boolean
// `repeatOnOverflow`, which maps to 'this-page-and-overflow'.
// ─────────────────────────────────────────────────────────────────────────────

function zoneScopeOf(cfg) {
  if (!cfg) return 'first-page-only';
  if (cfg.scope) return cfg.scope;
  return cfg.repeatOnOverflow ? 'this-page-and-overflow' : 'first-page-only';
}

// Lowest canvas-page index whose zone is enabled with 'entire-document' scope.
// That zone becomes the document master. Returns -1 when there is none.
function findMasterCanvasPage(kind, pageConfigs) {
  for (let i = 0; i < pageConfigs.length; i++) {
    const z = pageConfigs[i] && pageConfigs[i][kind];
    if (z && z.enabled && zoneScopeOf(z) === 'entire-document') return i;
  }
  return -1;
}

// Resolved header/footer elements that belong to a given canvas page's zone.
function zoneElementsFor(kind, canvasPageIdx, resolved, pageConfigs, dim) {
  return resolved.filter(el =>
    classifyElement(el, pageConfigs, dim) === kind &&
    Math.floor((el.position?.y || 0) / dim.CANVAS_PH) === canvasPageIdx);
}

/**
 * Decide, for one PDF page, which header/footer config + elements to draw.
 *
 * @returns {{ cfg: object|null, els: object[], draw: boolean }}
 */
function resolveZoneForPdfPage(kind, pi, currentCpIdx, isCpFirstPdfPage, masterCp, pageConfigs, resolved, dim) {
  // Master (entire-document) wins on every page, regardless of currentCpIdx.
  if (masterCp >= 0) {
    const cfg = pageConfigs[masterCp][kind];
    return { cfg, els: zoneElementsFor(kind, masterCp, resolved, pageConfigs, dim), draw: true };
  }

  const cfg = (pageConfigs[currentCpIdx] || pageConfigs[0] || {})[kind];
  if (!cfg || !cfg.enabled) return { cfg: null, els: [], draw: false };

  const scope = zoneScopeOf(cfg);
  // 'this-page-and-overflow' → all PDF pages of this canvas page.
  // 'first-page-only'        → only its first PDF page.
  const draw = scope === 'first-page-only' ? isCpFirstPdfPage : true;
  const els  = draw ? zoneElementsFor(kind, currentCpIdx, resolved, pageConfigs, dim) : [];
  return { cfg, els, draw };
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
  pageSize                = null,
}) {
  const effCanvasW  = pageSize?.canvasWidth  || CANVAS_W;
  const effCanvasPH = pageSize?.canvasHeight || CANVAS_PH;
  const effPdfW     = pageSize?.pdfWidth     || PDF_W;
  const effPdfH     = pageSize?.pdfHeight    || PDF_H;
  const effScale    = effPdfW / effCanvasW;
  
  const dim = {
    CANVAS_W: effCanvasW,
    CANVAS_PH: effCanvasPH,
    PDF_W: effPdfW,
    PDF_H: effPdfH,
    SCALE: effScale,
    HDR_H_PX: 32,
    ROW_H_PX: 26
  };

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
    } else if (el.type === 'chart' && el.chart?.binding?.enabled) {
      resolved.push(resolveChartEl(el, irCollections, collectionMappings));
    } else {
      resolved.push(resolveStatic(el, irFields, fieldMapping));
    }
  }

  // ── 2. Preload images ─────────────────────────────────────────────────────
  await preloadImages(resolved);

  // ── 3. Zone classification ────────────────────────────────────────────────
  const contentEls = resolved.filter(el => classifyElement(el, pageConfigs, dim) === 'content');
  const sorted     = [...contentEls].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  // ── 4. Create PDF and embed fonts ─────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);
  // Pre-embed (subset) the Unicode fonts for every script that appears in the
  // resolved document, so the synchronous measure/draw passes can look fonts
  // up per run. Serializing the resolved elements covers all text: content,
  // table cells, chart titles and bound series, zone elements. A document
  // with no non-WinAnsi text embeds nothing here.
  await fonts.ensureScriptsFor(JSON.stringify(resolved));
  const pages  = [];
  getPage(pdfDoc, pages, 0, effPdfW, effPdfH);

  // ── 5. Compute layout (per-canvas-page offsets + pdfPageBase overflow fix) ─
  const { plan, totalPages } = computeLayout(sorted, pageConfigs, fonts, dim);

  // ── 6. Resolve which header/footer each PDF page gets ─────────────────────
  const canvasPageMap = buildCanvasPageMap(plan, dim);
  const cpEntries     = [...canvasPageMap.entries()].sort((a, b) => a[1] - b[1]);
  const finalTotal    = Math.max(pages.length, totalPages);

  const masterHeaderCp = findMasterCanvasPage('header', pageConfigs);
  const masterFooterCp = findMasterCanvasPage('footer', pageConfigs);

  // Per-PDF-page zone descriptors, computed once and reused by every draw pass.
  const zonePlan = [];
  for (let pi = 0; pi < finalTotal; pi++) {
    getPage(pdfDoc, pages, pi, effPdfW, effPdfH);
    const currentCpIdx   = getCanvasPageForPdfPage(pi, cpEntries);
    const cpStartPdfPage = getCanvasPageStartPdfPage(currentCpIdx, cpEntries);
    const isCpFirst      = pi === cpStartPdfPage;

    zonePlan.push({
      header: resolveZoneForPdfPage('header', pi, currentCpIdx, isCpFirst, masterHeaderCp, pageConfigs, resolved, dim),
      footer: resolveZoneForPdfPage('footer', pi, currentCpIdx, isCpFirst, masterFooterCp, pageConfigs, resolved, dim),
    });
  }

  // ── 6a. Pass A — header/footer BACKGROUNDS first (z-order fix #5) ──────────
  for (let pi = 0; pi < finalTotal; pi++) {
    const z = zonePlan[pi];
    if (z.header.draw) drawZoneBackground(pdfDoc, pages, pi, 'header', z.header.cfg, dim);
    if (z.footer.draw) drawZoneBackground(pdfDoc, pages, pi, 'footer', z.footer.cfg, dim);
  }

  // ── 6b. Pass B — content elements from the layout plan ────────────────────
  for (const entry of plan) {
    const { el, absoluteY, pdfPageIdx, headerHpx, footerHpx, cfg } = entry;

    if (el.type === 'table') {
      drawTable(el, absoluteY, pdfDoc, pages, fonts, headerHpx, footerHpx, dim);
    } else {
      let elToDraw = el;
      if (el.type === 'text' && el.pageNumber?.enabled) {
        const footerCfg = cfg.footer || null;
        elToDraw = resolvePageNumber(el, pdfPageIdx, totalPages, footerCfg);
      }
      await drawElement(pdfDoc, pages, elToDraw, absoluteY, fonts, dim);
    }
  }

  // ── 7. Pass C — header/footer ELEMENTS on top of content ──────────────────
  for (let pi = 0; pi < finalTotal; pi++) {
    const z = zonePlan[pi];
    if (z.header.draw) await drawZoneElements(pdfDoc, pages, pi, finalTotal, 'header', z.header.cfg, z.header.els, fonts, dim);
    if (z.footer.draw) await drawZoneElements(pdfDoc, pages, pi, finalTotal, 'footer', z.footer.cfg, z.footer.els, fonts, dim);
  }

  // ── 8. Serialize ──────────────────────────────────────────────────────────
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = { generatePdfBuffer };
