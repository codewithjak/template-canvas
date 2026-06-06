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
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const https = require('https');
const http  = require('http');

// ── Constants ──────────────────────────────────────────────────────────────────

const CANVAS_W  = 794;
const CANVAS_PH = 1123;
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

/**
 * Parse a color string and extract RGB and opacity.
 * Returns { color: rgb(...), opacity: 0-1 }
 * Supports: #hex, rgb(r,g,b), rgba(r,g,b,a), transparent
 */
function parseColorWithOpacity(str) {
  if (!str || typeof str !== 'string') return { color: rgb(0, 0, 0), opacity: 1 };
  const s = str.trim();
  
  // rgba format
  const rgbaMatch = s.match(/rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
  if (rgbaMatch) {
    return {
      color: rgb(+rgbaMatch[1]/255, +rgbaMatch[2]/255, +rgbaMatch[3]/255),
      opacity: Math.min(1, Math.max(0, +rgbaMatch[4]))
    };
  }
  
  // hex format
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
  
  // rgb format
  const rgbMatch = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) return { color: rgb(+rgbMatch[1]/255, +rgbMatch[2]/255, +rgbMatch[3]/255), opacity: 1 };
  
  if (s === 'white' || s === 'transparent') return { color: rgb(1,1,1), opacity: s === 'transparent' ? 0 : 1 };
  
  return { color: rgb(0,0,0), opacity: 1 };
}

/**
 * Apply opacity to a color string.
 * Returns an rgba color string.
 * Supports: #hex, rgb(r,g,b), already formatted colors
 */
function applyOpacityToColor(colorStr, opacity) {
  if (!colorStr || colorStr === 'transparent') return 'rgba(0, 0, 0, 0)';
  
  opacity = Math.max(0, Math.min(1, opacity)); // Clamp to 0-1
  
  // If already rgba, replace opacity
  if (colorStr.startsWith('rgba')) {
    return colorStr.replace(/[\d.]+\s*\)/, `${opacity})`);
  }
  
  // hex format
  if (colorStr.startsWith('#')) {
    let h = colorStr.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 6) {
      const r = parseInt(h.slice(0,2), 16);
      const g = parseInt(h.slice(2,4), 16);
      const b = parseInt(h.slice(4,6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
  }
  
  // rgb format
  const rgbMatch = colorStr.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${opacity})`;
  }
  
  // Fallback: return as-is
  return colorStr;
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

  // Store template row count BEFORE expansion
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

/**
 * Draw text inside a table cell with width AND height clipping.
 * Wraps text to fit width, clips lines that exceed cell height,
 * truncates last visible line with ellipsis if content was clipped.
 */
/**
 * Measure how tall a cell's text will be in PDF points.
 * Used to compute dynamic row height before drawing.
 */
function measureCellHeight(text, font, fsPt, maxWPt, lhPt, padPt) {
  if (!text) return fsPt * 1.3 + padPt * 2;
  const lh    = lhPt || fsPt * 1.3;
  const lines = wrapText(text, font, fsPt, maxWPt);
  return lines.length * lh + padPt * 2;
}

/**
 * Draw text inside a table cell — no clipping, no truncation.
 * The row height has already been computed to fit all content.
 */
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

/**
 * Measure the actual height a row needs in canvas px.
 * Takes the maximum height across all cells in the row.
 */
function measureRowHeight(cells, columns, ts, fonts, isHeader, totalWpx) {
  const padPx   = 3;   // padding in canvas px (we measure in px, convert later)
  const defFsPx = ts.fontSize || 11;
  let   maxH    = isHeader ? HDR_H_PX : ROW_H_PX;  // minimum = design height

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
    // Convert pt back to px for comparison
    const cellHPx = cellHPt / SCALE;
    if (cellHPx > maxH) maxH = cellHPx;
  }

  return maxH;
}

/**
 * Draw a full table starting at correctedCanvasY.
 * Returns the expansion in canvas px (actualRows - templateRows) × ROW_H_PX
 * so the caller can add it to cumulativeOffset.
 */
function drawTable(el, correctedCanvasY, pdfDoc, pages, fonts) {
  const columns  = el.columns || [];
  const tableXpx = el.position?.x || 0;
  const ts       = el.style    || {};
  const hasHdr   = !!(el.headerRow?.cells?.length);

  // Convert corrected canvas Y to PDF starting position
  let curPageIdx  = Math.floor(correctedCanvasY / CANVAS_PH);
  let curLocalYpx = correctedCanvasY - curPageIdx * CANVAS_PH;
  let curTopYpdf  = PDF_H - curLocalYpx * SCALE;

  const totalWpx     = columns.reduce((s, c) => s + (c.width || 0), 0) || CANVAS_W;
  let   actualHeightPx = 0;   // track total actual height for expansion calc

  // Measure header height
  const hdrActualHPx = hasHdr
    ? measureRowHeight(el.headerRow.cells, columns, ts, fonts, true, totalWpx)
    : 0;
  actualHeightPx += hdrActualHPx;

  // Draw header now that we have its measured height
  if (hasHdr) {
    const page = getPage(pdfDoc, pages, curPageIdx);
    drawTableRow(page, el.headerRow.cells, columns, tableXpx, curTopYpdf, hdrActualHPx, ts, fonts, true);
    curLocalYpx += hdrActualHPx;
    curTopYpdf  -= hdrActualHPx * SCALE;
  }

  // Draw data rows — dynamic height per row
  for (const row of (el.rows || [])) {
    const rowHpx       = measureRowHeight(row.cells, columns, ts, fonts, false, totalWpx);
    const rowHpt       = rowHpx * SCALE;
    const bottomMargin = 20 * SCALE;

    if (curTopYpdf - rowHpt < bottomMargin) {
      // Move to next page
      curPageIdx  += 1;
      curLocalYpx  = 0;
      curTopYpdf   = PDF_H;

      // Repeat header on continuation page
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

  // Compute expansion vs template height
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

// ── Main generator ─────────────────────────────────────────────────────────────

// ── Draw header or footer elements on a specific PDF page ───────────────────

async function drawZoneOnPage(zoneElements, pdfDoc, pages, pageIdx, canvasBoundaryY, fonts, pageNumberInfo) {
  for (const el of zoneElements) {
    // Position relative to zone boundary — keep exact canvas offset within zone
    const localY     = el.position?.y || 0;
    const correctedY = pageIdx * CANVAS_PH + localY;

    // Page number element — replace content with actual page number
    const elToRaw = el;
    if (el.type === 'text' && el.pageNumber?.enabled && pageNumberInfo) {
      const { current, total, format, alignment } = pageNumberInfo;
      let numText = String(current);
      if (format === 'Page X of Y') numText = `Page ${current} of ${total}`;
      else if (format === 'X / Y')   numText = `${current} / ${total}`;
      const aligned = { ...elToRaw, content: numText };
      await drawElement(pdfDoc, pages, aligned, correctedY, fonts);
      continue;
    }

    await drawElement(pdfDoc, pages, el, correctedY, fonts);
  }
}

async function generatePdfBuffer({
  templateElements        = [],
  staticData              = {},
  collections             = {},
  fieldMapping            = {},
  tableCollectionBindings = {},
  collectionMappings      = {},
  // Per-page header/footer config (from canvas page settings)
  // Shape: [{ header: HeaderConfig, footer: FooterConfig }, ...]
  pageConfigs             = [],
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

  // ── 3. Extract header/footer config from first pageConfig (or defaults) ───
  // For now, use the first page config — multi-page config support follows
  const pageCfg      = pageConfigs[0] || {};
  const headerCfg    = pageCfg.header || null;
  const footerCfg    = pageCfg.footer || null;

  // enabled = zone is active (elements + background drawn on page 1)
  // repeatOnOverflow = also drawn on page 2, 3, ...
  const headerEnabled = !!(headerCfg?.enabled);
  const footerEnabled = !!(footerCfg?.enabled);
  const headerRepeats = headerEnabled && !!(headerCfg?.repeatOnOverflow);
  const footerRepeats = footerEnabled && !!(footerCfg?.repeatOnOverflow);

  // Boundary positions
  const headerBoundaryY = headerCfg?.boundaryY || 0;
  const footerBoundaryY = footerCfg?.boundaryY || CANVAS_PH;

  // Classify elements into zones
  const headerEls  = headerEnabled
    ? resolved.filter(el => (el.position?.y || 0) < headerBoundaryY)
    : [];
  const footerEls  = footerEnabled
    ? resolved.filter(el => (el.position?.y || 0) >= footerBoundaryY)
    : [];
  const contentEls = resolved.filter(el => {
    const y = el.position?.y || 0;
    return y >= (headerEnabled ? headerBoundaryY : 0)
        && y <  (footerEnabled ? footerBoundaryY : CANVAS_PH);
  });

  // Available content height per PDF page (shrunk by header+footer zones)
  const headerHpx    = headerEnabled ? headerBoundaryY : 0;
  const footerHpx    = footerEnabled ? (CANVAS_PH - footerBoundaryY) : 0;
  const availableHpx = CANVAS_PH - headerHpx - footerHpx;

  // ── 4. Sort content elements by canvas Y ──────────────────────────────────
  const sorted = [...contentEls].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  // ── 5. Create PDF ──────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);
  const pages  = [];
  getPage(pdfDoc, pages, 0);

  // ── 6. Walk content elements with cumulative offset ────────────────────────
  // Content Y is relative to the content zone start (headerBoundaryY).
  // Elements are offset so they start drawing from headerBoundaryY on each page.

  let cumulativeOffset = 0;
  const pagesUsed = new Set([0]);

  for (const el of sorted) {
    // canvasY relative to content zone top
    const relativeY  = (el.position?.y || 0) - (headerEnabled ? headerBoundaryY : 0);
    const correctedY = relativeY + cumulativeOffset;

    // Map correctedY to absolute canvas Y accounting for header space
    // Each "virtual page" of content height = availableHpx
    const contentPageIdx = Math.floor(correctedY / availableHpx);
    const absoluteY      = headerHpx + (correctedY % availableHpx) + contentPageIdx * CANVAS_PH;

    if (el.type === 'table') {
      const expansion = drawTable(el, absoluteY, pdfDoc, pages, fonts);
      cumulativeOffset += expansion;
      // Track which PDF pages this table spans
      const endY       = absoluteY + (el.rows?.length || 0) * ROW_H_PX;
      const endPageIdx = Math.floor(endY / CANVAS_PH);
      for (let pi = contentPageIdx; pi <= endPageIdx; pi++) pagesUsed.add(pi);
    } else {
      await drawElement(pdfDoc, pages, el, absoluteY, fonts);
      pagesUsed.add(contentPageIdx);
    }
  }

  // ── 7. Draw header/footer on every used page ──────────────────────────────
  const totalPages = pages.length;
  
  // Count pages where footer actually appears (for total page calculation)
  const footerPageCount = footerEnabled ? (footerRepeats ? totalPages : 1) : 0;
  const headerPageCount = headerEnabled ? (headerRepeats ? totalPages : 1) : 0;

  for (let pi = 0; pi < totalPages; pi++) {
    getPage(pdfDoc, pages, pi);

    // Draw header on page 0 always (if enabled), on page 1+ only if repeatOnOverflow
    const shouldDrawHeader = headerEnabled && (pi === 0 || headerRepeats);
    if (shouldDrawHeader) {
      // Draw header background
      if (headerCfg.style?.backgroundColor && headerCfg.style.backgroundColor !== 'transparent') {
        const hHpt = headerBoundaryY * SCALE;
        const page = getPage(pdfDoc, pages, pi);
        
        // Parse color and extract opacity
        const { color, opacity } = parseColorWithOpacity(
          headerCfg.style.backgroundColor
        );
        page.drawRectangle({
          x: 0,
          y: PDF_H - hHpt,
          width : PDF_W,
          height: hHpt,
          color : color,
          opacity: headerCfg.style.opacity ?? opacity,
        });
      }

      // Draw header elements
      for (const el of headerEls) {
        const absY = pi * CANVAS_PH + (el.position?.y || 0);
        await drawElement(pdfDoc, pages, el, absY, fonts);
      }

      // Draw header bottom border line
      if ((headerCfg.style?.borderWidth || 0) > 0) {
        const { pageIndex, pdfY } = canvasToPdf(pi * CANVAS_PH + headerBoundaryY);
        const pg = getPage(pdfDoc, pages, pageIndex);
        pg.drawLine({
          start    : { x: 0, y: pdfY },
          end      : { x: PDF_W, y: pdfY },
          thickness: headerCfg.style.borderWidth * SCALE,
          color    : toColor(headerCfg.style.borderColor || '#e2e8f0'),
        });
      }
    }

    // Draw footer on page 0 always (if enabled), on page 1+ only if repeatOnOverflow
    const shouldDrawFooter = footerEnabled && (pi === 0 || footerRepeats);
    if (shouldDrawFooter) {
      // Draw footer background
      if (footerCfg.style?.backgroundColor && footerCfg.style.backgroundColor !== 'transparent') {
        const fTopPx = footerBoundaryY;
        const fHpx   = CANVAS_PH - fTopPx;
        const page   = getPage(pdfDoc, pages, pi);
        const { pdfY: fTopPdf } = canvasToPdf(pi * CANVAS_PH + fTopPx);
        
        // Parse color and extract opacity
        const { color, opacity } = parseColorWithOpacity(
          footerCfg.style.backgroundColor
        );
        page.drawRectangle({
          x: 0,
          y: fTopPdf - fHpx * SCALE,
          width : PDF_W,
          height: fHpx * SCALE,
          color : color,
          opacity: footerCfg.style.opacity ?? opacity,
        });
      }
    }
    if (shouldDrawFooter && footerEls.length > 0) {
      for (const el of footerEls) {
        const absY = pi * CANVAS_PH + (el.position?.y || 0);
        // Check if this is a page number element
        if (el.type === 'text' && el.pageNumber?.enabled) {
          // Get page number config from element or fall back to footer config
          const pnCfg = el.pageNumber || {};
          const startFrom = pnCfg.startFrom || footerCfg?.pageNumberStartFrom || 1;
          const format = pnCfg.format || footerCfg?.pageNumberFormat || 'Page X of Y';
          const alignment = pnCfg.alignment || footerCfg?.pageNumberAlignment || 'right';
          
          // Calculate current page number for footer
          // If repeat on overflow is false, footer only appears on page 0, so page number is always startFrom
          // If repeat on overflow is true, page number increments for each page
          const currentPageNum = footerRepeats ? (pi + startFrom) : startFrom;
          const totalPageNum = footerRepeats ? (footerPageCount + startFrom - 1) : startFrom;
          
          let numText = String(currentPageNum);
          if (format === 'Page X of Y') numText = `Page ${currentPageNum} of ${totalPageNum}`;
          else if (format === 'X / Y')   numText = `${currentPageNum} / ${totalPageNum}`;
          
          const elWithNum = { ...el, content: numText };
          await drawElement(pdfDoc, pages, elWithNum, absY, fonts);
        } else {
          await drawElement(pdfDoc, pages, el, absY, fonts);
        }
      }

      // Draw footer border line if configured
      if (footerCfg.style?.borderWidth > 0) {
        const { pageIndex, pdfY } = canvasToPdf(pi * CANVAS_PH + footerBoundaryY);
        const pg = getPage(pdfDoc, pages, pageIndex);
        pg.drawLine({
          start: { x: 0, y: pdfY },
          end  : { x: PDF_W, y: pdfY },
          thickness   : footerCfg.style.borderWidth * SCALE,
          color       : toColor(footerCfg.style.borderColor || '#e2e8f0'),
        });
      }
    }
  }

  // ── 8. Serialize ──────────────────────────────────────────────────────────
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = { generatePdfBuffer };