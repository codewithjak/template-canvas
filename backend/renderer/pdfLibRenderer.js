/**
 * pdfLibRenderer.js — Header/Footer Aware PDF Generator
 *
 * ARCHITECTURE
 * ────────────
 * Each canvas page carries an optional header and footer config:
 *
 *   page.header = { enabled, repeatOnOverflow, boundaryY, style }
 *   page.footer = { enabled, repeatOnOverflow, boundaryY,
 *                   showPageNumbers, pageNumber: { format, alignment, startFrom } }
 *
 * Element classification per canvas page:
 *   position.y  < header.boundaryY               → HEADER elements
 *   position.y  >= footer.boundaryY               → FOOTER elements
 *   everything in between                         → CONTENT elements
 *
 * PDF page layout (per canvas page):
 *   ┌──────────────────────────┐  ← 0
 *   │  HEADER ZONE             │  ← 0 .. headerH (canvas px → scaled)
 *   ├──────────────────────────┤  ← headerH
 *   │                          │
 *   │  CONTENT                 │  ← content flows here, paginated
 *   │                          │     within availableH per PDF page
 *   │                          │
 *   ├──────────────────────────┤  ← PDF_H - footerH
 *   │  FOOTER ZONE             │
 *   └──────────────────────────┘  ← PDF_H
 *
 * availableH  = CANVAS_PH - headerH - footerH  (in canvas px)
 *
 * On overflow PDF pages (when content spills past one page):
 *   - Header elements are redrawn at their original Y (if repeatOnOverflow)
 *   - Footer elements are redrawn at their original Y (if repeatOnOverflow)
 *   - Content Y is remapped: contentLocalY → contentLocalY + headerH
 *     so it starts below the header on the new page
 *   - Page numbers are injected into the flagged footer element
 *
 * NO element ever lands inside the header or footer reserved zones
 * on any overflow page.
 *
 * Coordinate system
 * ─────────────────
 * All internal calculations are in CANVAS PX (794 wide, 1123 per page).
 * SCALE = 595.28 / 794 ≈ 0.7497 converts canvas px → PDF points.
 * pdfY (bottom-up)  = PDF_H - canvasLocalY * SCALE
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const https = require('https');
const http  = require('http');

// ── Constants ─────────────────────────────────────────────────────────────────

const CANVAS_W  = 794;
const CANVAS_PH = 1123;   // canvas px per "page"
const PDF_W     = 595.28;
const PDF_H     = 841.89;
const SCALE     = PDF_W / CANVAS_W;   // ≈ 0.7497
const HDR_H_PX  = 32;
const ROW_H_PX  = 26;

// ── Colour ────────────────────────────────────────────────────────────────────

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
  if (s === 'white') return rgb(1,1,1);
  if (s === 'transparent') return null;
  return rgb(0,0,0);
}

// ── Page pool ─────────────────────────────────────────────────────────────────

function getPage(pdfDoc, pages, idx) {
  while (pages.length <= idx) pages.push(pdfDoc.addPage([PDF_W, PDF_H]));
  return pages[idx];
}

// ── Fonts ─────────────────────────────────────────────────────────────────────

async function embedFonts(pdfDoc) {
  return {
    normal : await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold   : await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
}

// ── Text utilities ────────────────────────────────────────────────────────────

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

function measureCellHeight(text, font, fsPt, maxWPt, lhPt, padPt) {
  if (!text) return fsPt * 1.3 + padPt * 2;
  const lh = lhPt || fsPt * 1.3;
  return wrapText(text, font, fsPt, maxWPt).length * lh + padPt * 2;
}

function drawTextAt(page, text, font, fsPt, x, topY, maxWPt, color, lhPt) {
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt);
  let y = topY;
  for (const line of lines) {
    if (!line && lines.length > 1) { y -= lh; continue; }
    try { page.drawText(line, { x, y: y - fsPt * 0.8, size: fsPt, font, color }); }
    catch(e) {}
    y -= lh;
  }
}

// ── Placeholder resolution ────────────────────────────────────────────────────

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

// ── Image preload ─────────────────────────────────────────────────────────────

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

// ── Zone drawing helpers ──────────────────────────────────────────────────────

/**
 * Draw a zone background + border edge onto a PDF page.
 * headerH / footerH are in canvas px; we convert to PDF points here.
 */
function drawZoneBackground(page, zoneConfig, type, headerHpx, footerHpx) {
  if (!zoneConfig?.enabled) return;
  const style = zoneConfig.style || {};

  const bg = style.backgroundColor ? toColor(style.backgroundColor) : null;
  if (!bg) return;

  const zoneHpx = type === 'header' ? headerHpx : footerHpx;
  const zoneHpt = zoneHpx * SCALE;
  const yBottom = type === 'header' ? PDF_H - zoneHpt : 0;

  page.drawRectangle({ x: 0, y: yBottom, width: PDF_W, height: zoneHpt, color: bg });

  // Border line
  const borderStr = type === 'header' ? style.borderBottom : style.borderTop;
  if (borderStr) {
    const parts = borderStr.split(' ');
    const bwPt  = (parseFloat(parts[0]) || 1) * SCALE;
    const bCol  = parts[2] ? toColor(parts[2]) : rgb(0.89, 0.91, 0.94);
    const lineY = type === 'header' ? PDF_H - zoneHpt : zoneHpt;
    page.drawLine({ start: { x: 0, y: lineY }, end: { x: PDF_W, y: lineY },
      thickness: bwPt, color: bCol });
  }
}

/**
 * Draw one static element at a specific PDF Y position.
 * localYpx = Y within the current PDF page (top-down, canvas px)
 * The caller is responsible for supplying the correct localYpx
 * (accounting for header offset on continuation pages).
 */
async function drawStaticAt(pdfDoc, page, el, localXpx, localYpx, fonts) {
  const xPt  = localXpx * SCALE;
  const yTop = PDF_H - localYpx * SCALE;   // pdfY of TOP edge (bottom-up)
  const s    = el.style || {};

  switch (el.type) {
    case 'box': {
      const wPt = (s.width  || 0) * SCALE;
      const hPt = (s.height || 0) * SCALE;
      const bw  = Math.max(0, (s.borderWidth || 0) * SCALE);
      const bg  = s.backgroundColor ? toColor(s.backgroundColor) : null;
      if (bg) page.drawRectangle({ x: xPt, y: yTop - hPt, width: wPt, height: hPt, color: bg });
      if (bw > 0)
        page.drawRectangle({ x: xPt, y: yTop - hPt, width: wPt, height: hPt,
          borderColor: toColor(s.borderColor || '#000000'), borderWidth: bw });
      break;
    }
    case 'line': {
      const lenPt   = (s.length    || 100) * SCALE;
      const thickPt = Math.max(0.5, (s.thickness || 1) * SCALE);
      const col     = toColor(s.color || '#000000');
      const dash    = s.style === 'dashed' ? [thickPt * 3, thickPt * 2] : undefined;
      if ((s.direction || 'horizontal') === 'vertical')
        page.drawLine({ start: { x: xPt, y: yTop }, end: { x: xPt, y: yTop - lenPt },
          thickness: thickPt, color: col, dashArray: dash });
      else
        page.drawLine({ start: { x: xPt, y: yTop }, end: { x: xPt + lenPt, y: yTop },
          thickness: thickPt, color: col, dashArray: dash });
      break;
    }
    case 'text':
    case 'paragraph':
    case 'date': {
      const text = el.content || el.value || '';
      const fsPt = (s.fontSize || 12) * SCALE;
      const bold = s.fontWeight === 'bold' || Number(s.fontWeight) >= 700;
      const font = bold ? fonts.bold : fonts.normal;
      const maxW = (s.width || (CANVAS_W - localXpx)) * SCALE;
      drawTextAt(page, text, font, fsPt, xPt, yTop, maxW, toColor(s.color || '#000000'), fsPt * 1.3);
      break;
    }
    case 'image': {
      if (!el._imgBytes) break;
      const wPt = (s.width  || 100) * SCALE;
      const hPt = (s.height || 100) * SCALE;
      try {
        const b = el._imgBytes;
        const emb = (b[0] === 0xFF && b[1] === 0xD8)
          ? await pdfDoc.embedJpg(b) : await pdfDoc.embedPng(b);
        page.drawImage(emb, { x: xPt, y: yTop - hPt, width: wPt, height: hPt });
      } catch(e) { console.warn('[pdf] image embed failed:', e.message); }
      break;
    }
  }
}

// ── Row height measurement ────────────────────────────────────────────────────

function measureRowHeight(cells, columns, ts, fonts, isHeader, totalWpx) {
  const padPx  = 3;
  const defFs  = ts.fontSize || 11;
  let   maxH   = isHeader ? HDR_H_PX : ROW_H_PX;

  for (let ci = 0; ci < cells.length; ci++) {
    const cell    = cells[ci];
    if (cell.mergedInto) continue;
    const colWpx  = columns[ci]?.width || (totalWpx / cells.length);
    const cs2     = cell.style || {};
    const fsPt    = (cs2.fontSize || defFs) * SCALE;
    const bold    = isHeader || cs2.fontWeight === 'bold';
    const font    = bold ? fonts.bold : fonts.normal;
    const maxWPt  = Math.max(1, (colWpx - padPx * 2) * SCALE);
    const lhPt    = fsPt * 1.2;
    const padPt   = padPx * SCALE;
    const cellHPt = measureCellHeight(cell.content?.value || '', font, fsPt, maxWPt, lhPt, padPt);
    const cellHPx = cellHPt / SCALE;
    if (cellHPx > maxH) maxH = cellHPx;
  }
  return maxH;
}

// ── Table row drawing ─────────────────────────────────────────────────────────

function drawTableRow(page, cells, columns, tableXpx, rowTopYpdf, rowHpx, ts, fonts, isHeader) {
  const rowHpt     = rowHpx * SCALE;
  const rowBotYpdf = rowTopYpdf - rowHpt;
  const headerBg   = toColor(ts.headerBg || '#214883');
  const headerText = toColor(ts.headerColor || '#ffffff');
  const borderC    = toColor(ts.borderColor || '#cccccc');
  const borderW    = Math.max(0.5, (ts.borderWidth || 1) * SCALE);
  const totalWpx   = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;

  let curXpx = tableXpx;
  for (let ci = 0; ci < cells.length; ci++) {
    const cell    = cells[ci];
    if (cell.mergedInto) { curXpx += columns[ci]?.width || 0; continue; }

    const colWpx  = columns[ci]?.width || (totalWpx / cells.length);
    const cxPt    = curXpx * SCALE;
    const cWpt    = colWpx * SCALE;
    const cs2     = cell.style || {};
    const fsPt    = (cs2.fontSize || ts.fontSize || 11) * SCALE;
    const bold    = isHeader || cs2.fontWeight === 'bold';
    const font    = bold ? fonts.bold : fonts.normal;
    const tColor  = isHeader ? headerText : toColor(cs2.color || ts.color || '#000000');
    const bgCol   = isHeader ? headerBg   : (cs2.backgroundColor ? toColor(cs2.backgroundColor) : null);

    if (bgCol)
      page.drawRectangle({ x: cxPt, y: rowBotYpdf, width: cWpt, height: rowHpt, color: bgCol });
    page.drawRectangle({ x: cxPt, y: rowBotYpdf, width: cWpt, height: rowHpt,
      borderColor: borderC, borderWidth: borderW });

    const padPt   = 3 * SCALE;
    const textWPt = Math.max(1, cWpt - padPt * 2);
    const lhPt    = fsPt * 1.2;
    drawTextAt(page, cell.content?.value || '', font, fsPt,
      cxPt + padPt, rowTopYpdf - padPt, textWPt, tColor, lhPt);

    curXpx += colWpx;
  }
}

// ── Page number injection ─────────────────────────────────────────────────────

/**
 * Draw the page number string in the footer zone.
 * footerElements: resolved footer elements for this canvas page
 * pageNumberConfig: { format, alignment, startFrom }
 * currentPdfPage: 0-indexed PDF page number produced so far
 * totalPdfPages: estimated total (pass null for "X" format, finalise later)
 */
function drawPageNumber(page, footerConfig, pdfPageIndex, totalPdfPages, headerHpx, footerHpx) {
  if (!footerConfig?.showPageNumbers) return;
  const pnc     = footerConfig.pageNumber;
  if (!pnc) return;

  const start   = pnc.startFrom ?? 1;
  const current = pdfPageIndex + start;
  const total   = totalPdfPages != null ? (totalPdfPages + start - 1) : '?';
  const fmt     = pnc.format || 'Page X of Y';
  const text    = fmt === 'Page X of Y' ? `Page ${current} of ${total}`
                : fmt === 'X / Y'       ? `${current} / ${total}`
                :                        String(current);

  const align   = pnc.alignment || 'right';
  const fsPt    = 9 * SCALE;

  // Position: vertically centered in footer zone
  const footerTopY = footerHpx * SCALE;   // from bottom of page
  const yPos       = footerTopY / 2 + fsPt / 2;

  let xPos: number;
  const margin = 12 * SCALE;
  if (align === 'left')   xPos = margin;
  else if (align === 'center') xPos = PDF_W / 2 - 30 * SCALE;
  else                    xPos = PDF_W - margin - 60 * SCALE;

  try {
    page.drawText(text, { x: xPos, y: yPos, size: fsPt, font: undefined, color: rgb(0.3,0.3,0.3) });
  } catch(e) {}
}

// ── Per-canvas-page PDF generator ────────────────────────────────────────────

/**
 * Generate PDF pages for one canvas page worth of content.
 *
 * @param {object} params
 * @param {any[]}   params.headerElements  — resolved elements in header zone
 * @param {any[]}   params.contentElements — resolved elements in content zone
 * @param {any[]}   params.footerElements  — resolved elements in footer zone
 * @param {number}  params.headerBoundaryY — px; 0 if no header
 * @param {number}  params.footerBoundaryY — px; CANVAS_PH if no footer
 * @param {object}  params.headerConfig    — HeaderConfig or null
 * @param {object}  params.footerConfig    — FooterConfig or null
 * @param {object}  params.pdfDoc
 * @param {any[]}   params.pages           — shared page array (appended to)
 * @param {object}  params.fonts
 * @param {number}  params.startPdfPageIdx — first PDF page index to write into
 * @returns {number} number of PDF pages produced
 */
async function generateCanvasPagePdf({
  headerElements,
  contentElements,
  footerElements,
  headerBoundaryY,
  footerBoundaryY,
  headerConfig,
  footerConfig,
  pdfDoc,
  pages,
  fonts,
  startPdfPageIdx,
}) {
  const headerHpx   = headerConfig?.enabled  ? headerBoundaryY            : 0;
  const footerHpx   = footerConfig?.enabled  ? (CANVAS_PH - footerBoundaryY) : 0;
  const headerHpt   = headerHpx * SCALE;
  const footerHpt   = footerHpx * SCALE;

  // Available content height per PDF page in canvas px
  const availHpx    = CANVAS_PH - headerHpx - footerHpx;

  // PDF Y of the content top edge (below header)
  const contentTopPdfY = PDF_H - headerHpt;
  // PDF Y of the content bottom edge (above footer)
  const contentBotPdfY = footerHpt;

  // ── Helper: draw header on a specific PDF page ───────────────────────────
  async function drawHeader(pdfPageIdx) {
    if (!headerConfig?.enabled) return;
    const page = getPage(pdfDoc, pages, pdfPageIdx);
    drawZoneBackground(page, headerConfig, 'header', headerHpx, footerHpx);
    for (const el of headerElements) {
      await drawStaticAt(pdfDoc, page, el, el.position.x, el.position.y, fonts);
    }
  }

  // ── Helper: draw footer on a specific PDF page ───────────────────────────
  async function drawFooter(pdfPageIdx, localPdfPageNum) {
    if (!footerConfig?.enabled) return;
    const page = getPage(pdfDoc, pages, pdfPageIdx);
    drawZoneBackground(page, footerConfig, 'footer', headerHpx, footerHpx);
    for (const el of footerElements) {
      // Footer elements: their Y on canvas is relative to footerBoundaryY
      // We remap them to sit at the bottom of the PDF page
      const localY = el.position.y - footerBoundaryY;  // 0 = top of footer zone
      const pdfLocalY = CANVAS_PH - footerHpx + localY;
      await drawStaticAt(pdfDoc, page, el, el.position.x, pdfLocalY, fonts);
    }
    drawPageNumber(page, footerConfig, localPdfPageNum, null, headerHpx, footerHpx);
  }

  // ── Draw header + footer on first page of this canvas page ──────────────
  await drawHeader(startPdfPageIdx);
  await drawFooter(startPdfPageIdx, 0);

  // ── Sort content elements by Y ────────────────────────────────────────────
  const sorted = [...contentElements].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  // Current PDF page tracking
  let curPdfPageIdx   = startPdfPageIdx;
  let cumulativeOffset = 0;
  // usedContentYpx: how many canvas px of content have been placed on curPdfPageIdx
  let usedContentYpx  = 0;

  // ── Walk all content elements ─────────────────────────────────────────────
  for (const el of sorted) {
    // canvasY is relative to the canvas page (0..CANVAS_PH)
    const canvasY    = (el.position?.y || 0) - headerHpx;  // relative to content zone top
    const correctedY = canvasY + cumulativeOffset;

    if (el.type === 'table' && el.schemaVersion === 2) {
      // ── TABLE: draw row by row, paginating within availHpx ───────────────
      const columns    = el.columns || [];
      const totalWpx   = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;
      const tableXpx   = el.position?.x || 0;
      const ts         = el.style || {};
      const hasHdr     = !!(el.headerRow?.cells?.length);

      // Place table at correctedY within content zone
      let curTableLocalYpx = correctedY;  // within content zone (0 = top)

      // Check if we need to advance to next page before starting table
      if (curTableLocalYpx >= availHpx) {
        const overflow = curTableLocalYpx - availHpx;
        curPdfPageIdx += 1;
        await drawHeader(curPdfPageIdx);
        await drawFooter(curPdfPageIdx, curPdfPageIdx - startPdfPageIdx);
        curTableLocalYpx = overflow;
        cumulativeOffset -= (correctedY - curTableLocalYpx);
      }

      let tableActualHpx = 0;

      // Header row
      const hdrHpx = hasHdr
        ? measureRowHeight(el.headerRow.cells, columns, ts, fonts, true, totalWpx)
        : 0;

      if (hasHdr) {
        const page = getPage(pdfDoc, pages, curPdfPageIdx);
        const rowTopPdfY = contentTopPdfY - curTableLocalYpx * SCALE;
        drawTableRow(page, el.headerRow.cells, columns, tableXpx, rowTopPdfY, hdrHpx, ts, fonts, true);
        curTableLocalYpx += hdrHpx;
        tableActualHpx   += hdrHpx;
      }

      // Data rows
      for (const row of (el.rows || [])) {
        const rowHpx = measureRowHeight(row.cells, columns, ts, fonts, false, totalWpx);

        // Need new page?
        if (curTableLocalYpx + rowHpx > availHpx) {
          curPdfPageIdx += 1;
          await drawHeader(curPdfPageIdx);
          await drawFooter(curPdfPageIdx, curPdfPageIdx - startPdfPageIdx);
          curTableLocalYpx = hasHdr ? hdrHpx : 0;  // repeat header on new page

          if (hasHdr) {
            const page = getPage(pdfDoc, pages, curPdfPageIdx);
            const rowTopPdfY = contentTopPdfY - (hasHdr ? hdrHpx : 0) * SCALE;
            drawTableRow(page, el.headerRow.cells, columns, tableXpx,
              contentTopPdfY, hdrHpx, ts, fonts, true);
            curTableLocalYpx = hdrHpx;
          }
        }

        const page      = getPage(pdfDoc, pages, curPdfPageIdx);
        const rowTopPdfY = contentTopPdfY - curTableLocalYpx * SCALE;
        drawTableRow(page, row.cells, columns, tableXpx, rowTopPdfY, rowHpx, ts, fonts, false);

        curTableLocalYpx += rowHpx;
        tableActualHpx   += rowHpx;
        usedContentYpx    = curTableLocalYpx;
      }

      // Accumulate expansion
      const templateHdrH  = hasHdr ? HDR_H_PX : 0;
      const templateRowsH = (el._templateRowCount || 1) * ROW_H_PX;
      const expansion     = tableActualHpx - (templateHdrH + templateRowsH);
      cumulativeOffset   += expansion;

    } else {
      // ── STATIC ELEMENT ────────────────────────────────────────────────────

      // Determine which PDF page this element falls on
      let pageRelativeY = correctedY;

      // Advance pages until element fits within availHpx of current page
      while (pageRelativeY >= availHpx) {
        pageRelativeY  -= availHpx;
        curPdfPageIdx  += 1;
        // Draw header/footer on newly entered page if we haven't yet
        if (pages.length <= curPdfPageIdx) {
          await drawHeader(curPdfPageIdx);
          await drawFooter(curPdfPageIdx, curPdfPageIdx - startPdfPageIdx);
        }
      }

      // pageRelativeY is now 0..availHpx — offset by header zone
      const finalLocalY = pageRelativeY + headerHpx;
      const page        = getPage(pdfDoc, pages, curPdfPageIdx);
      await drawStaticAt(pdfDoc, page, el, el.position.x, finalLocalY, fonts);
    }
  }

  // Return total PDF pages produced for this canvas page
  return curPdfPageIdx - startPdfPageIdx + 1;
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Accepts the new multi-page payload shape:
 * {
 *   pages: [
 *     {
 *       pageId, label, elements,
 *       header: HeaderConfig,
 *       footer: FooterConfig,
 *       staticData, collections, fieldMapping,
 *       tableCollectionBindings, collectionMappings
 *     }
 *   ]
 * }
 *
 * Also accepts the legacy flat shape for backward compat.
 */
async function generatePdfBuffer(payload) {
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);
  const pages  = [];

  // Normalise to pages array
  const canvasPages = Array.isArray(payload.pages)
    ? payload.pages
    : [{
        pageId                  : 'page-1',
        label                   : 'Page 1',
        elements                : payload.templateElements || [],
        header                  : payload.header || null,
        footer                  : payload.footer || null,
        staticData              : payload.staticData || {},
        collections             : payload.collections || {},
        fieldMapping            : payload.fieldMapping || {},
        tableCollectionBindings : payload.tableCollectionBindings || {},
        collectionMappings      : payload.collectionMappings || {},
      }];

  let globalPdfPageIdx = 0;

  for (const canvasPage of canvasPages) {
    const {
      elements = [],
      header,
      footer,
      staticData              = {},
      collections             = {},
      fieldMapping            = {},
      tableCollectionBindings = {},
      collectionMappings      = {},
    } = canvasPage;

    const headerBoundaryY = header?.enabled ? (header.boundaryY ?? 80)   : 0;
    const footerBoundaryY = footer?.enabled ? (footer.boundaryY ?? 1043) : CANVAS_PH;

    // ── Resolve elements ────────────────────────────────────────────────────
    const resolved = [];
    for (const el of elements) {
      if (el.type === 'table' && el.schemaVersion === 2) {
        const collKey  = (tableCollectionBindings[el.id] || el.binding?.collectionKey || '').toLowerCase().trim();
        const normCols = Object.fromEntries(Object.entries(collections).map(([k,v]) => [k.toLowerCase().trim(), v]));
        const collData = normCols[collKey] || {};
        const rows     = Array.isArray(collData) ? collData : (collData.rows || []);
        resolved.push(resolveTableEl(el, rows, staticData, fieldMapping,
          (collectionMappings[collKey] || collectionMappings[Object.keys(collectionMappings)[0]] || {})));
      } else {
        resolved.push(resolveStatic(el, staticData, fieldMapping));
      }
    }
    await preloadImages(resolved);

    // ── Classify elements into zones ────────────────────────────────────────
    const headerElements  = resolved.filter(el => (el.position?.y || 0) <  headerBoundaryY);
    const footerElements  = resolved.filter(el => (el.position?.y || 0) >= footerBoundaryY);
    const contentElements = resolved.filter(el => {
      const y = el.position?.y || 0;
      return y >= headerBoundaryY && y < footerBoundaryY;
    });

    // Ensure first page exists
    getPage(pdfDoc, pages, globalPdfPageIdx);

    const pagesProduced = await generateCanvasPagePdf({
      headerElements,
      contentElements,
      footerElements,
      headerBoundaryY,
      footerBoundaryY,
      headerConfig : header  || null,
      footerConfig : footer  || null,
      pdfDoc,
      pages,
      fonts,
      startPdfPageIdx: globalPdfPageIdx,
    });

    globalPdfPageIdx += pagesProduced;
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = { generatePdfBuffer };