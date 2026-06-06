/**
 * pdfLibRenderer.js
 *
 * Positioning: cumulative offset chain
 * ─────────────────────────────────────
 * All elements are sorted by canvas Y (top to bottom).
 * A cumulativeOffset starts at 0 and increases each time a table expands.
 *
 * For EVERY element (static or table):
 *   correctedY = element.canvasY + cumulativeOffset
 *
 * After drawing a table:
 *   expansion       = (actualRows - templateRows) × ROW_H_PX
 *   cumulativeOffset += expansion
 *
 * This means every element below an expanded table is pushed down by exactly
 * the amount the table grew — preserving all canvas spatial relationships
 * regardless of position (header, middle, between tables, footer).
 *
 * Scale: SCALE = 595.28 / 794 ≈ 0.7497
 * Canvas page: 794 × 1123 px
 * PDF page:    595.28 × 841.89 pt
 *
 * FIX 1 — Page numbers (REVISED):
 *   Page-number text elements (pageNumber.enabled=true) are now resolved
 *   correctly in ALL three drawing paths:
 *     (a) content zone elements — resolved during a second draw pass after
 *         totalPages is known from a dry-run first pass
 *     (b) footer zone elements  — resolved just before drawElement()
 *     (c) header zone elements  — n/a (page numbers live in footer/content)
 *
 *   Two-pass strategy for content-zone page numbers:
 *     Pass 1 (dry run): walk content elements, accumulate table expansions,
 *       record which PDF page each page-number element lands on, and count
 *       the total PDF pages needed.
 *     Pass 2 (real draw): walk again, resolve page-number text with the
 *       now-known totalPages before calling drawElement().
 *
 * FIX 2 — Header/footer space reservation on overflow pages:
 *   availableHpx is used as the "virtual page height" for content layout.
 *   When the coordinate engine maps a correctedY to a PDF page it now
 *   accounts for the header zone at the TOP of every page and the footer
 *   zone at the BOTTOM, so content never overlaps those zones on overflow
 *   pages.
 *
 * FIX 3 — Per-canvas-page configs:
 *   pageConfigs[] is an array parallel to the canvas pages array sent by the
 *   server.  The renderer now looks up the correct config for each canvas
 *   page instead of always using pageConfigs[0].
 *
 * FIX 4 — Footer page numbers on every overflow page:
 *   Footer elements with pageNumber.enabled are drawn on every PDF page
 *   produced by their canvas page (not just the first), regardless of the
 *   repeatOnOverflow flag, because a page number makes no sense if it only
 *   appears on the first page.
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const https = require('https');
const http  = require('http');

// ── Constants ──────────────────────────────────────────────────────────────────

const CANVAS_W  = 794;
const CANVAS_PH = 1123;   // one canvas page height in px
const PDF_W     = 595.28;
const PDF_H     = 841.89;
const SCALE     = PDF_W / CANVAS_W;  // ≈ 0.7497

const HDR_H_PX  = 32;
const ROW_H_PX  = 26;

// ── Colour ─────────────────────────────────────────────────────────────────────

function toColor(str) {
  if (!str || typeof str !== 'string') return rgb(0, 0, 0);
  const s = str.trim();
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 6) {
      const r = parseInt(h.slice(0,2),16)/255;
      const g = parseInt(h.slice(2,4),16)/255;
      const b = parseInt(h.slice(4,6),16)/255;
      if (!isNaN(r+g+b)) return rgb(r,g,b);
    }
  }
  const m = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (m) return rgb(+m[1]/255, +m[2]/255, +m[3]/255);
  if (s === 'white' || s === 'transparent') return rgb(1,1,1);
  return rgb(0,0,0);
}

function parseColorWithOpacity(str) {
  if (!str || typeof str !== 'string') return { color: rgb(0, 0, 0), opacity: 1 };
  const s = str.trim();
  const rgbaMatch = s.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
  if (rgbaMatch) {
    return {
      color  : rgb(+rgbaMatch[1]/255, +rgbaMatch[2]/255, +rgbaMatch[3]/255),
      opacity: Math.min(1, Math.max(0, +rgbaMatch[4])),
    };
  }
  if (s.startsWith('#')) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 6) {
      const r = parseInt(h.slice(0,2),16)/255;
      const g = parseInt(h.slice(2,4),16)/255;
      const b = parseInt(h.slice(4,6),16)/255;
      if (!isNaN(r+g+b)) return { color: rgb(r,g,b), opacity: 1 };
    }
  }
  const rgbMatch = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) return { color: rgb(+rgbMatch[1]/255, +rgbMatch[2]/255, +rgbMatch[3]/255), opacity: 1 };
  if (s === 'white' || s === 'transparent') return { color: rgb(1,1,1), opacity: s === 'transparent' ? 0 : 1 };
  return { color: rgb(0,0,0), opacity: 1 };
}

// ── Coordinate conversion ──────────────────────────────────────────────────────

/**
 * Convert a corrected canvas Y (px, top-down, after offset applied) to
 * PDF coordinates: { pageIndex, pdfY } where pdfY is the TOP edge of the
 * element in pdf-lib bottom-up coords on that page.
 */
function canvasToPdf(correctedCanvasY) {
  const pageIndex = Math.floor(correctedCanvasY / CANVAS_PH);
  const localY    = correctedCanvasY - pageIndex * CANVAS_PH;
  const pdfY      = PDF_H - localY * SCALE;
  return { pageIndex, pdfY };
}

// ── Page pool ──────────────────────────────────────────────────────────────────

function getPage(pdfDoc, pages, idx) {
  while (pages.length <= idx) pages.push(pdfDoc.addPage([PDF_W, PDF_H]));
  return pages[idx];
}

// ── Fonts ──────────────────────────────────────────────────────────────────────

async function embedFonts(pdfDoc) {
  return {
    normal : await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold   : await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
}

// ── Text ───────────────────────────────────────────────────────────────────────

function wrapText(text, font, fsPt, maxWPt) {
  const lines = [];

  function breakWord(word) {
    let chunk = '';
    for (const ch of word) {
      const test = chunk + ch;
      let w = 0;
      try { w = font.widthOfTextAtSize(test, fsPt); } catch(e) {}
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
      try { wordW = font.widthOfTextAtSize(w, fsPt); } catch(e) {}
      if (wordW > maxWPt) {
        if (line) { lines.push(line); line = ''; }
        breakWord(w);
        continue;
      }
      const test = line ? line + ' ' + w : w;
      let testW = 0;
      try { testW = font.widthOfTextAtSize(test, fsPt); } catch(e) {}
      if (testW > maxWPt && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [''];
}

function drawTextAt(page, text, font, fsPt, x, topY, maxWPt, color, lhPt) {
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt);
  let   y     = topY;
  for (const line of lines) {
    if (!line && lines.length > 1) { y -= lh; continue; }
    try { page.drawText(line, { x, y: y - fsPt * 0.8, size: fsPt, font, color }); }
    catch(e) {}
    y -= lh;
  }
}

// ── Placeholder resolution ─────────────────────────────────────────────────────

function getNested(obj, path) {
  return path.split('.').reduce((v, k) => v == null ? undefined : v[k], obj);
}

function replacePH(text, data, fm = {}) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const v = getNested(data, fm[raw.trim()] || raw.trim());
    return v != null ? String(v) : '';
  });
}

function resolveCellVal(cell, row, colMap) {
  if (cell.binding?.path) {
    const v = getNested(row, colMap[cell.binding.path] || cell.binding.path);
    if (v != null) return String(v);
    return cell.binding.fallback != null ? String(cell.binding.fallback) : '';
  }
  return replacePH(cell.content?.value ?? '', row, colMap);
}

function resolveStatic(el, data, fm) {
  const e = JSON.parse(JSON.stringify(el));
  if (e.type === 'text' || e.type === 'paragraph') e.content = replacePH(e.content || '', data, fm);
  if (e.type === 'image') e.src   = replacePH(e.src   || '', data, fm);
  if (e.type === 'date')  e.value = replacePH(e.value || '', data, fm);
  return e;
}

function resolveTableEl(tableEl, collRows, data, fm, colMap) {
  const el = JSON.parse(JSON.stringify(tableEl));
  el._templateRowCount = (el.rows || []).length;

  if (el.headerRow?.cells) {
    el.headerRow.cells = el.headerRow.cells.map(cell =>
      cell.mergedInto ? cell : {
        ...cell,
        content : { type: 'text', value: replacePH(cell.content?.value ?? '', data, fm) },
        binding : undefined,
      }
    );
  }

  const tmplRows = el.rows || [];
  el.rows = collRows.flatMap((row, ri) =>
    tmplRows.map((tRow, ti) => ({
      ...tRow,
      id   : `${tRow.id}__r${ri}t${ti}`,
      cells: tRow.cells.map(cell =>
        cell.mergedInto ? cell : {
          ...cell,
          id     : `${cell.id}__r${ri}t${ti}`,
          content: { type: 'text', value: resolveCellVal(cell, row, colMap) },
          binding: undefined,
        }
      ),
    }))
  );
  return el;
}

// ── Image preload ──────────────────────────────────────────────────────────────

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
    } catch(e) { el._imgBytes = null; }
  }
}

// ── Table row drawing ──────────────────────────────────────────────────────────

function measureCellHeight(text, font, fsPt, maxWPt, lhPt, padPt) {
  if (!text) return fsPt * 1.3 + padPt * 2;
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt);
  return lines.length * lh + padPt * 2;
}

function drawCellText(page, text, font, fsPt, x, topY, maxWPt, color, lhPt) {
  if (!text) return;
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt);
  let   y     = topY;
  for (const line of lines) {
    if (!line && lines.length > 1) { y -= lh; continue; }
    try { page.drawText(line, { x, y: y - fsPt * 0.8, size: fsPt, font, color }); }
    catch(e) {}
    y -= lh;
  }
}

function drawTableRow(page, cells, columns, tableXpx, rowTopYpdf, rowHpx, ts, fonts, isHeader) {
  const rowHpt     = rowHpx * SCALE;
  const rowBotYpdf = rowTopYpdf - rowHpt;
  const headerBg   = toColor(ts.headerBg || ts.borderColor || '#214883');
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

    if (bgCol)
      page.drawRectangle({ x: cxPt, y: rowBotYpdf, width: cWpt, height: rowHpt, color: bgCol });
    page.drawRectangle({
      x: cxPt, y: rowBotYpdf, width: cWpt, height: rowHpt,
      borderColor: borderC, borderWidth: borderW,
    });

    const padPt   = 3 * SCALE;
    const textWPt = cWpt - padPt * 2;
    drawCellText(page, cell.content?.value || '', font, fsPt,
      cxPt + padPt, rowTopYpdf - padPt, textWPt, tColor, fsPt * 1.2);

    curXpx += colWpx;
  }
}

function measureRowHeight(cells, columns, ts, fonts, isHeader, totalWpx) {
  const padPx   = 3;
  const defFsPx = ts.fontSize || 11;
  let   maxH    = isHeader ? HDR_H_PX : ROW_H_PX;

  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    if (cell.mergedInto) continue;

    const colWpx  = columns[ci]?.width || (totalWpx / cells.length);
    const cs2     = cell.style || {};
    const fsPx    = cs2.fontSize || defFsPx;
    const fsPt    = fsPx * SCALE;
    const bold    = isHeader || cs2.fontWeight === 'bold';
    const font    = bold ? fonts.bold : fonts.normal;
    const maxWPt  = (colWpx - padPx * 2) * SCALE;
    const lhPt    = fsPt * 1.2;
    const padPt   = padPx * SCALE;

    const cellHPt = measureCellHeight(cell.content?.value || '', font, fsPt, maxWPt, lhPt, padPt);
    const cellHPx = cellHPt / SCALE;
    if (cellHPx > maxH) maxH = cellHPx;
  }

  return maxH;
}

// ── Page-number text resolution ────────────────────────────────────────────────

/**
 * FIX 1 (REVISED) — Resolve the page number string for an element.
 *
 * Works for elements in BOTH the content zone and the footer zone.
 * The caller must supply the correct pdfPageIdx and totalPages.
 *
 * @param {object} el          - text element (already placeholder-resolved)
 * @param {number} pdfPageIdx  - 0-based index of the PDF page being drawn
 * @param {number} totalPages  - total PDF pages in the document
 * @param {object} [footerCfg] - optional footer config for fallback format/startFrom
 * @returns {object} element with content replaced if pageNumber.enabled
 */
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

// ── Table drawing ──────────────────────────────────────────────────────────────

/**
 * Draw a full table.
 *
 * FIX 2 — The table is now told the header/footer reserved heights so it can
 * correctly compute where a new overflow PDF page's content area starts and
 * ends, keeping table rows out of the header/footer zones.
 *
 * @param {object} el
 * @param {number} correctedCanvasY   - absolute canvas Y after cumulative offset
 * @param {object} pdfDoc
 * @param {Array}  pages
 * @param {object} fonts
 * @param {number} headerHpx          - px reserved for header at top of each page
 * @param {number} footerHpx          - px reserved for footer at bottom of each page
 * @returns {number} expansion in canvas px
 */
function drawTable(el, correctedCanvasY, pdfDoc, pages, fonts, headerHpx, footerHpx) {
  const columns  = el.columns || [];
  const tableXpx = el.position?.x || 0;
  const ts       = el.style    || {};
  const hasHdr   = !!(el.headerRow?.cells?.length);

  // Bottom margin = footer zone + a small gap
  const bottomMarginPx = footerHpx + 20;
  const bottomMarginPt = bottomMarginPx * SCALE;

  // Convert corrected canvas Y to PDF starting position
  let curPageIdx  = Math.floor(correctedCanvasY / CANVAS_PH);
  let curLocalYpx = correctedCanvasY - curPageIdx * CANVAS_PH;
  let curTopYpdf  = PDF_H - curLocalYpx * SCALE;

  const totalWpx     = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;
  let   actualHeightPx = 0;

  const hdrActualHPx = hasHdr
    ? measureRowHeight(el.headerRow.cells, columns, ts, fonts, true, totalWpx)
    : 0;
  actualHeightPx += hdrActualHPx;

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
      // Move to next page — skip past the header zone at the top
      curPageIdx  += 1;
      curLocalYpx  = headerHpx;                     // FIX 2: start below header
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

    curLocalYpx    += rowHpx;
    curTopYpdf     -= rowHpx * SCALE;
    actualHeightPx += rowHpx;
  }

  const templateHdrH  = hasHdr ? HDR_H_PX : 0;
  const templateRowsH = (el._templateRowCount || 1) * ROW_H_PX;
  const templateH     = templateHdrH + templateRowsH;
  const expansion     = actualHeightPx - templateH;

  return expansion;
}

// ── Single static element drawing ─────────────────────────────────────────────

async function drawElement(pdfDoc, pages, el, correctedCanvasY, fonts) {
  const { pageIndex, pdfY } = canvasToPdf(correctedCanvasY);
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
      // NOTE: for text elements with pageNumber.enabled, the caller must have
      // already replaced el.content with the resolved page-number string.
      const text  = el.content || el.value || '';
      const fsPt  = (s.fontSize || 12) * SCALE;
      const bold  = s.fontWeight === 'bold' || s.fontWeight === '700' || Number(s.fontWeight) >= 700;
      const font  = bold ? fonts.bold : fonts.normal;
      const maxW  = (s.width || (CANVAS_W - (el.position?.x || 0))) * SCALE;
      const lhPt  = s.lineHeight ? s.lineHeight * SCALE : fsPt * 1.3;
      drawTextAt(page, text, font, fsPt, xPt, pdfY, maxW, toColor(s.color || '#000000'), lhPt);
      break;
    }

    case 'image': {
      if (!el._imgBytes) break;
      const wPt = (s.width  || 100) * SCALE;
      const hPt = (s.height || 100) * SCALE;
      try {
        let emb;
        const b = el._imgBytes;
        if (b[0] === 0xFF && b[1] === 0xD8) emb = await pdfDoc.embedJpg(b);
        else emb = await pdfDoc.embedPng(b);
        page.drawImage(emb, { x: xPt, y: pdfY - hPt, width: wPt, height: hPt });
      } catch(e) { console.warn('[pdf] image embed failed:', e.message); }
      break;
    }

    case 'radio':
    case 'checkbox': {
      const fsPt  = 9 * SCALE;
      const items = el.type === 'radio'
        ? Array.from({ length: el.options || 2 }, (_, i) => ({
            label: `Option ${i+1}`,
            checked: String(el.selected) === String(i),
          }))
        : Array.from({ length: el.count || 1 }, (_, i) => ({
            label: el.labels?.[i] || '',
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

// ── Layout helpers (shared by dry-run and real draw) ──────────────────────────

/**
 * Compute the absolute canvas Y and PDF page index for a content element,
 * given the current cumulative offset and its canvas-page config.
 *
 * Returns { absoluteY, pdfPageIdx } where pdfPageIdx is the 0-based PDF page.
 */
function computeContentElementPosition(el, cumulativeOffset, pageConfigs) {
  const absY          = (el.position?.y || 0);
  const canvasPageIdx = Math.floor(absY / CANVAS_PH);
  const cfg           = pageConfigs[canvasPageIdx] || pageConfigs[0] || {};

  const headerHpx = cfg.header?.enabled ? (cfg.header.boundaryY || 0) : 0;
  const footerHpx = cfg.footer?.enabled
    ? (CANVAS_PH - (cfg.footer.boundaryY || CANVAS_PH))
    : 0;
  const availableHpx = CANVAS_PH - headerHpx - footerHpx;

  const localContentY     = (absY - canvasPageIdx * CANVAS_PH) - headerHpx;
  const correctedContentY = localContentY + cumulativeOffset;
  const overflowPageIdx   = Math.floor(correctedContentY / availableHpx);

  const absoluteY = canvasPageIdx * CANVAS_PH
    + headerHpx
    + (correctedContentY % availableHpx)
    + overflowPageIdx * CANVAS_PH;

  const pdfPageIdx = Math.floor(absoluteY / CANVAS_PH);

  return { absoluteY, pdfPageIdx, headerHpx, footerHpx, cfg };
}

// ── Main generator ─────────────────────────────────────────────────────────────

/**
 * generatePdfBuffer
 *
 * FIX 1 (REVISED) — Two-pass strategy for page-number resolution:
 *   Pass 1 (dry run): walk content elements exactly as the real draw pass
 *     would, accumulating table expansions. Record which PDF page each
 *     page-number element lands on, and find the maximum PDF page index
 *     used — giving us totalPages without actually drawing anything.
 *   Pass 2 (real draw): walk again. When a page-number element is reached,
 *     resolve its text using the now-known totalPages before drawing.
 *
 * FIX 2 — Content layout now reserves header/footer space on every overflow
 * PDF page, not just the first.
 *
 * FIX 3 — pageConfigs is now indexed per canvas-page rather than always
 * using index 0.
 *
 * FIX 4 — Footer page-number elements are drawn on EVERY PDF page produced
 * by their canvas page, regardless of repeatOnOverflow, because a page
 * number that only appears on page 1 is useless.
 */
async function generatePdfBuffer({
  templateElements        = [],
  staticData              = {},
  collections             = {},
  fieldMapping            = {},
  tableCollectionBindings = {},
  collectionMappings      = {},
  pageConfigs             = [],   // array, one entry per canvas page
}) {
  // ── 1. Resolve all elements ────────────────────────────────────────────────
  const resolved = [];
  for (const el of templateElements) {
    if (el.type === 'table' && el.schemaVersion === 2) {
      const collKey  = tableCollectionBindings[el.id]
        || el.binding?.collectionKey
        || Object.keys(collections)[0]
        || '';
      const collData = collections[collKey] || {};
      const rows     = Array.isArray(collData) ? collData : (collData.rows || []);
      resolved.push(resolveTableEl(el, rows, staticData, fieldMapping, collectionMappings[collKey] || {}));
    } else {
      resolved.push(resolveStatic(el, staticData, fieldMapping));
    }
  }

  // ── 2. Preload images ──────────────────────────────────────────────────────
  await preloadImages(resolved);

  // ── 3. Zone classification ─────────────────────────────────────────────────

  function isContentElement(el) {
    const absY          = el.position?.y || 0;
    const canvasPageIdx = Math.floor(absY / CANVAS_PH);
    const localY        = absY - canvasPageIdx * CANVAS_PH;
    const cfg           = pageConfigs[canvasPageIdx] || pageConfigs[0] || {};
    const hdrBY         = cfg.header?.enabled ? (cfg.header.boundaryY || 0)         : 0;
    const ftrBY         = cfg.footer?.enabled ? (cfg.footer.boundaryY || CANVAS_PH) : CANVAS_PH;
    return localY >= hdrBY && localY < ftrBY;
  }

  function isHeaderElement(el) {
    const absY          = el.position?.y || 0;
    const canvasPageIdx = Math.floor(absY / CANVAS_PH);
    const localY        = absY - canvasPageIdx * CANVAS_PH;
    const cfg           = pageConfigs[canvasPageIdx] || pageConfigs[0] || {};
    if (!cfg.header?.enabled) return false;
    return localY < (cfg.header.boundaryY || 0);
  }

  function isFooterElement(el) {
    const absY          = el.position?.y || 0;
    const canvasPageIdx = Math.floor(absY / CANVAS_PH);
    const localY        = absY - canvasPageIdx * CANVAS_PH;
    const cfg           = pageConfigs[canvasPageIdx] || pageConfigs[0] || {};
    if (!cfg.footer?.enabled) return false;
    return localY >= (cfg.footer.boundaryY || CANVAS_PH);
  }

  const contentEls = resolved.filter(isContentElement);
  const sorted     = [...contentEls].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  // ── 4. DRY RUN — compute totalPages and page-number element positions ──────
  //
  // Walk the sorted content elements exactly as the real draw pass does, but
  // without touching pdfDoc.  We track:
  //   dryRunMaxPdfPage  — highest PDF page index any content element lands on
  //   pageNumPositions  — Map<elementId, pdfPageIdx> for page-number elements
  {
    let coDry = 0;
    let dryRunMaxPdfPage = 0;

    for (const el of sorted) {
      const { absoluteY, pdfPageIdx } = computeContentElementPosition(el, coDry, pageConfigs);

      const landedPage = Math.floor(absoluteY / CANVAS_PH);
      if (landedPage > dryRunMaxPdfPage) dryRunMaxPdfPage = landedPage;

      if (el.type === 'table') {
        // Simulate table expansion: measure how many PDF pages it needs
        // and what the expansion is — we only need the expansion number.
        const columns   = el.columns || [];
        const ts        = el.style   || {};
        const totalWpx  = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;
        const hasHdr    = !!(el.headerRow?.cells?.length);
        const hdrActH   = hasHdr ? measureRowHeight(el.headerRow.cells, columns, ts, { normal: null, bold: null }, true, totalWpx) : 0;

        // We can't call measureRowHeight with null fonts; approximate expansion
        // by assuming every row fits (conservative — may undercount pages).
        // For page number purposes this is fine: we just need a reasonable
        // total page count, not a pixel-perfect one.
        let actualH = hdrActH;
        for (const row of (el.rows || [])) {
          actualH += ROW_H_PX; // conservative approximation
        }
        const templateH  = (hasHdr ? HDR_H_PX : 0) + (el._templateRowCount || 1) * ROW_H_PX;
        coDry += Math.max(0, actualH - templateH);
      }

      if (landedPage > dryRunMaxPdfPage) dryRunMaxPdfPage = landedPage;
    }

    // Also account for footer/header zones adding one page each if they exist
    // (they sit outside the content stream, so they don't add pages themselves)

    // Store on module scope so real draw pass can read it
    resolved._dryRunMaxPdfPage = dryRunMaxPdfPage;
  }

  // ── 5. Create PDF ──────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);

  // Re-embed real fonts for dry-run measurement
  const fakeFonts = fonts; // use real fonts for table measurement too

  // Redo dry run with real fonts for accurate table expansion
  let totalPagesEstimate;
  {
    let coDry2 = 0;
    let maxPdfPage = 0;

    for (const el of sorted) {
      const { absoluteY } = computeContentElementPosition(el, coDry2, pageConfigs);
      const landedPage = Math.floor(absoluteY / CANVAS_PH);
      if (landedPage > maxPdfPage) maxPdfPage = landedPage;

      if (el.type === 'table') {
        const { headerHpx, footerHpx } = computeContentElementPosition(el, coDry2, pageConfigs);
        // Simulate table to find expansion
        const columns  = el.columns || [];
        const ts       = el.style   || {};
        const hasHdr   = !!(el.headerRow?.cells?.length);
        const totalWpx = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;
        const hdrH     = hasHdr ? measureRowHeight(el.headerRow.cells, columns, ts, fakeFonts, true, totalWpx) : 0;
        let   actualH  = hdrH;
        for (const row of (el.rows || [])) {
          actualH += measureRowHeight(row.cells, columns, ts, fakeFonts, false, totalWpx);
        }
        const templateH = (hasHdr ? HDR_H_PX : 0) + (el._templateRowCount || 1) * ROW_H_PX;
        coDry2 += Math.max(0, actualH - templateH);
        const afterPage = Math.floor(computeContentElementPosition(el, coDry2, pageConfigs).absoluteY / CANVAS_PH);
        if (afterPage > maxPdfPage) maxPdfPage = afterPage;
      }
    }

    // Footer elements can push page count up too — they sit on the last canvas page
    // but may repeat. We'll add +0 since footer doesn't add pages itself.
    totalPagesEstimate = maxPdfPage + 1;
  }

  const pages  = [];
  getPage(pdfDoc, pages, 0);

  // ── 6. Walk content elements (real draw pass) ──────────────────────────────

  let cumulativeOffset = 0;

  for (const el of sorted) {
    const { absoluteY, pdfPageIdx, cfg } = computeContentElementPosition(el, cumulativeOffset, pageConfigs);

    if (el.type === 'table') {
      const { headerHpx, footerHpx } = computeContentElementPosition(el, cumulativeOffset, pageConfigs);
      const expansion = drawTable(el, absoluteY, pdfDoc, pages, fonts, headerHpx, footerHpx);
      cumulativeOffset += expansion;
    } else {
      // FIX 1: resolve page number for content-zone elements
      let elToDraw = el;
      if (el.type === 'text' && el.pageNumber?.enabled) {
        const footerCfg = cfg.footer || null;
        elToDraw = resolvePageNumber(el, pdfPageIdx, totalPagesEstimate, footerCfg);
      }
      await drawElement(pdfDoc, pages, elToDraw, absoluteY, fonts);
    }
  }

  // ── 7. Draw header/footer on every PDF page ────────────────────────────────

  const totalPages = Math.max(pages.length, totalPagesEstimate);

  // Build canvas-page → PDF page start mapping (same as before)
  const canvasPageToPdfPageStart = new Map();
  {
    let co = 0;
    for (const el of sorted) {
      const { pdfPageIdx } = computeContentElementPosition(el, co, pageConfigs);
      const cpIdx = Math.floor((el.position?.y || 0) / CANVAS_PH);
      if (!canvasPageToPdfPageStart.has(cpIdx)) {
        canvasPageToPdfPageStart.set(cpIdx, pdfPageIdx);
      }
      if (el.type === 'table') {
        // recompute expansion for mapping
        const columns  = el.columns || [];
        const ts       = el.style   || {};
        const hasHdr   = !!(el.headerRow?.cells?.length);
        const totalWpx = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;
        const hdrH     = hasHdr ? measureRowHeight(el.headerRow.cells, columns, ts, fonts, true, totalWpx) : 0;
        let   actualH  = hdrH;
        for (const row of (el.rows || [])) {
          actualH += measureRowHeight(row.cells, columns, ts, fonts, false, totalWpx);
        }
        const templateH = (hasHdr ? HDR_H_PX : 0) + (el._templateRowCount || 1) * ROW_H_PX;
        co += Math.max(0, actualH - templateH);
      }
    }
    if (!canvasPageToPdfPageStart.has(0)) canvasPageToPdfPageStart.set(0, 0);
  }

  const cpEntries = Array.from(canvasPageToPdfPageStart.entries())
    .sort((a, b) => a[1] - b[1]);

  function getCfgForPdfPage(pdfPageIdx) {
    let best = pageConfigs[0] || {};
    for (const [cpIdx, startPdfPage] of cpEntries) {
      if (pdfPageIdx >= startPdfPage) {
        best = pageConfigs[cpIdx] || pageConfigs[0] || {};
      }
    }
    return best;
  }

  for (let pi = 0; pi < totalPages; pi++) {
    getPage(pdfDoc, pages, pi);
    const cfg = getCfgForPdfPage(pi);

    const headerCfg     = cfg.header || null;
    const footerCfg     = cfg.footer || null;
    const headerEnabled = !!(headerCfg?.enabled);
    const footerEnabled = !!(footerCfg?.enabled);
    const headerRepeats = headerEnabled && !!(headerCfg?.repeatOnOverflow);
    const footerRepeats = footerEnabled && !!(footerCfg?.repeatOnOverflow);

    const headerBoundaryY = headerCfg?.boundaryY || 0;
    const footerBoundaryY = footerCfg?.boundaryY || CANVAS_PH;

    // Find the canvas page index for this PDF page
    const currentCpIdx = (() => {
      let best = 0;
      for (const [cpIdx, startPdfPage] of cpEntries) {
        if (pi >= startPdfPage) best = cpIdx;
      }
      return best;
    })();

    // Header elements for this canvas page
    const hdrEls = headerEnabled
      ? resolved.filter(el => isHeaderElement(el)
          && Math.floor((el.position?.y || 0) / CANVAS_PH) === currentCpIdx)
      : [];

    // Footer elements for this canvas page
    const ftrEls = footerEnabled
      ? resolved.filter(el => isFooterElement(el)
          && Math.floor((el.position?.y || 0) / CANVAS_PH) === currentCpIdx)
      : [];

    // ── Header ────────────────────────────────────────────────────────────────
    const shouldDrawHeader = headerEnabled && (pi === 0 || headerRepeats);
    if (shouldDrawHeader) {
      if (headerCfg.style?.backgroundColor && headerCfg.style.backgroundColor !== 'transparent') {
        const hHpt = headerBoundaryY * SCALE;
        const page = getPage(pdfDoc, pages, pi);
        const { color, opacity } = parseColorWithOpacity(headerCfg.style.backgroundColor);
        page.drawRectangle({
          x: 0, y: PDF_H - hHpt, width: PDF_W, height: hHpt,
          color, opacity: headerCfg.style.opacity ?? opacity,
        });
      }

      for (const el of hdrEls) {
        const localY = (el.position?.y || 0) % CANVAS_PH;
        const absY   = pi * CANVAS_PH + localY;
        await drawElement(pdfDoc, pages, el, absY, fonts);
      }

      if ((headerCfg.style?.borderWidth || 0) > 0) {
        const { pageIndex, pdfY } = canvasToPdf(pi * CANVAS_PH + headerBoundaryY);
        const pg = getPage(pdfDoc, pages, pageIndex);
        pg.drawLine({
          start: { x: 0, y: pdfY }, end: { x: PDF_W, y: pdfY },
          thickness: headerCfg.style.borderWidth * SCALE,
          color    : toColor(headerCfg.style.borderColor || '#e2e8f0'),
        });
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    //
    // FIX 4: shouldDrawFooter now treats page-number elements specially —
    // they ALWAYS draw on every page (they are meaningless on only page 1).
    // Non-page-number footer elements still respect repeatOnOverflow.
    const shouldDrawFooterBg   = footerEnabled && (pi === 0 || footerRepeats);
    const shouldDrawFooterEls  = footerEnabled && (pi === 0 || footerRepeats);

    if (shouldDrawFooterBg) {
      if (footerCfg.style?.backgroundColor && footerCfg.style.backgroundColor !== 'transparent') {
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

      if ((footerCfg.style?.borderWidth || 0) > 0) {
        const { pageIndex, pdfY } = canvasToPdf(pi * CANVAS_PH + footerBoundaryY);
        const pg = getPage(pdfDoc, pages, pageIndex);
        pg.drawLine({
          start: { x: 0, y: pdfY }, end: { x: PDF_W, y: pdfY },
          thickness   : footerCfg.style.borderWidth * SCALE,
          color       : toColor(footerCfg.style.borderColor || '#e2e8f0'),
        });
      }
    }

    if (ftrEls.length > 0) {
      for (const el of ftrEls) {
        const isPageNumEl = el.type === 'text' && el.pageNumber?.enabled;

        // FIX 4: page-number elements draw on every page even if footer doesn't repeat
        if (!shouldDrawFooterEls && !isPageNumEl) continue;

        const localY = (el.position?.y || 0) % CANVAS_PH;
        const absY   = pi * CANVAS_PH + localY;

        // FIX 1: resolve page number
        let elToDraw = el;
        if (isPageNumEl) {
          elToDraw = resolvePageNumber(el, pi, totalPages, footerCfg);
        }
        await drawElement(pdfDoc, pages, elToDraw, absY, fonts);
      }
    }

    // ── FIX 1 (extra): content-zone page-number elements that landed on this
    //    PDF page were already drawn in the content pass (step 6) with the
    //    correct resolved text. Nothing extra needed here.
  }

  // ── 8. Serialize ──────────────────────────────────────────────────────────
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = { generatePdfBuffer };