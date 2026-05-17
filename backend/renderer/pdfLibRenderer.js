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
  for (const para of String(text || '').split('\n')) {
    if (!para) { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      let width = 0;
      try { width = font.widthOfTextAtSize(test, fsPt); } catch(e) {}
      if (width > maxWPt && line) { lines.push(line); line = w; }
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

    const padPt = 3 * SCALE;
    drawTextAt(page, cell.content?.value || '', font, fsPt,
      cxPt + padPt, rowTopYpdf - padPt, cWpt - padPt * 2, tColor, fsPt * 1.2);

    curXpx += colWpx;
  }
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

  // Draw header on first page
  if (hasHdr) {
    const page = getPage(pdfDoc, pages, curPageIdx);
    drawTableRow(page, el.headerRow.cells, columns, tableXpx, curTopYpdf, HDR_H_PX, ts, fonts, true);
    curLocalYpx += HDR_H_PX;
    curTopYpdf  -= HDR_H_PX * SCALE;
  }

  // Draw data rows — paginate when needed
  for (const row of (el.rows || [])) {
    const rowHpt       = ROW_H_PX * SCALE;
    const bottomMargin = 20 * SCALE;

    if (curTopYpdf - rowHpt < bottomMargin) {
      // Move to next page
      curPageIdx  += 1;
      curLocalYpx  = 0;
      curTopYpdf   = PDF_H;

      // Repeat header on continuation page
      if (hasHdr) {
        const newPage = getPage(pdfDoc, pages, curPageIdx);
        drawTableRow(newPage, el.headerRow.cells, columns, tableXpx, curTopYpdf, HDR_H_PX, ts, fonts, true);
        curLocalYpx += HDR_H_PX;
        curTopYpdf  -= HDR_H_PX * SCALE;
      }
    }

    const page = getPage(pdfDoc, pages, curPageIdx);
    drawTableRow(page, row.cells, columns, tableXpx, curTopYpdf, ROW_H_PX, ts, fonts, false);

    curLocalYpx += ROW_H_PX;
    curTopYpdf  -= ROW_H_PX * SCALE;
  }

  // Compute expansion: how much did this table grow beyond its template size?
  const templateRows = el._templateRowCount || 1;
  const actualRows   = el.rows?.length       || 0;
  const expansion    = (actualRows - templateRows) * ROW_H_PX;

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

async function generatePdfBuffer({
  templateElements        = [],
  staticData              = {},
  collections             = {},
  fieldMapping            = {},
  tableCollectionBindings = {},
  collectionMappings      = {},
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

  // ── 3. Sort ALL elements by canvas Y, top to bottom ───────────────────────
  const sorted = [...resolved].sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  // ── 4. Create PDF ──────────────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();
  const fonts  = await embedFonts(pdfDoc);
  const pages  = [];
  getPage(pdfDoc, pages, 0);

  // ── 5. Walk elements top to bottom, maintaining cumulativeOffset ───────────
  //
  // cumulativeOffset accumulates the total expansion of all tables drawn so far.
  // Every element (static or table) is drawn at:
  //   correctedY = element.canvasY + cumulativeOffset
  //
  // After drawing a table:
  //   cumulativeOffset += (actualRows - templateRows) × ROW_H_PX

  let cumulativeOffset = 0;

  for (const el of sorted) {
    const canvasY     = el.position?.y || 0;
    const correctedY  = canvasY + cumulativeOffset;

    if (el.type === 'table') {
      const expansion = drawTable(el, correctedY, pdfDoc, pages, fonts);
      cumulativeOffset += expansion;
    } else {
      await drawElement(pdfDoc, pages, el, correctedY, fonts);
    }
  }

  // ── 6. Serialize ──────────────────────────────────────────────────────────
  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

module.exports = { generatePdfBuffer };