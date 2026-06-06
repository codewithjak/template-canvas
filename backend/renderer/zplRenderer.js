/**
 * renderer/zplRenderer.js
 *
 * Converts canvas template elements into ZPL (Zebra Programming Language)
 * commands for thermal label printers.
 *
 * Supports: text, paragraph, date, barcode, box, line, table.
 * Images: skipped (thermal printers have limited image support).
 *
 * Coordinate system:
 *   Canvas: pixels at 96 DPI, origin top-left
 *   ZPL:    dots at configurable DPI (default 203), origin top-left
 *   Conversion: canvasPx * (zplDpi / 96)
 */

'use strict';

const { replacePlaceholders, resolveCellValue } = require('../utils/resolver');

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DPI       = 203;   // standard Zebra printer
const CANVAS_DPI        = 96;    // CSS px per inch
const DEFAULT_CANVAS_W  = 794;
const DEFAULT_CANVAS_PH = 1123;

// ─────────────────────────────────────────────────────────────────────────────
// Coordinate conversion
// ─────────────────────────────────────────────────────────────────────────────

function px2dot(px, dpi) {
  return Math.round(px * (dpi / CANVAS_DPI));
}

// ─────────────────────────────────────────────────────────────────────────────
// Element resolvers (same as pdfLibRenderer — resolve placeholders)
// ─────────────────────────────────────────────────────────────────────────────

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

function resolveTableEl(tableEl, collRows, irFields, fm, colMap) {
  const el = JSON.parse(JSON.stringify(tableEl));
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
// ZPL element emitters
// ─────────────────────────────────────────────────────────────────────────────

function emitText(el, localY, dpi, canvasW) {
  const cmds = [];
  const text = (el.content || el.value || '').replace(/\^/g, '_');  // escape ZPL caret
  if (!text.trim()) return cmds;

  const s  = el.style || {};
  const x  = px2dot(el.position?.x || 0, dpi);
  const y  = px2dot(localY, dpi);
  const fs = px2dot(s.fontSize || 12, dpi);
  const fw = Math.round(fs * 0.6);  // approximate char width
  const maxW = px2dot(s.width || (canvasW - (el.position?.x || 0)), dpi);

  // Text alignment: 0=left, 1=right, 2=center
  let justify = 'L';
  if (s.textAlign === 'center') justify = 'C';
  else if (s.textAlign === 'right') justify = 'R';

  // Handle multi-line with field block
  const maxLines = Math.max(1, Math.ceil(text.length * fw / maxW) + 2);

  cmds.push(`^FO${x},${y}`);
  cmds.push(`^A0N,${fs},${fw}`);
  cmds.push(`^FB${maxW},${maxLines},0,${justify}`);
  cmds.push(`^FD${text}^FS`);

  return cmds;
}

function emitBarcode(el, localY, dpi) {
  const cmds = [];
  const content = (el.content || '').replace(/\^/g, '_');
  if (!content.trim()) return cmds;

  const s       = el.style   || {};
  const bc      = el.barcode || {};
  const x       = px2dot(el.position?.x || 0, dpi);
  const y       = px2dot(localY, dpi);
  const h       = px2dot(s.height || 60, dpi);
  const showTxt = bc.showText !== false ? 'Y' : 'N';
  const format  = bc.format  || 'code128';

  cmds.push(`^FO${x},${y}`);

  switch (format) {
    case 'code128':
      cmds.push(`^BCN,${h},${showTxt},N,N`);
      cmds.push(`^FD${content}^FS`);
      break;
    case 'code39':
      cmds.push(`^B3N,N,${h},${showTxt},N`);
      cmds.push(`^FD${content}^FS`);
      break;
    case 'qrcode': {
      // QR magnification from width (approx)
      const mag = Math.max(1, Math.min(10, Math.round(px2dot(s.width || 100, dpi) / 50)));
      cmds.push(`^BQN,2,${mag}`);
      cmds.push(`^FDMA,${content}^FS`);
      break;
    }
    case 'ean13':
      cmds.push(`^BEN,${h},${showTxt},N`);
      cmds.push(`^FD${content}^FS`);
      break;
    case 'upca':
      cmds.push(`^BUN,${h},${showTxt},N`);
      cmds.push(`^FD${content}^FS`);
      break;
    case 'itf14':
      cmds.push(`^BIN,${h},${showTxt},N`);
      cmds.push(`^FD${content}^FS`);
      break;
    default:
      // Fallback to Code 128
      cmds.push(`^BCN,${h},${showTxt},N,N`);
      cmds.push(`^FD${content}^FS`);
  }

  return cmds;
}

function emitBox(el, localY, dpi) {
  const s = el.style || {};
  const x = px2dot(el.position?.x || 0, dpi);
  const y = px2dot(localY, dpi);
  const w = px2dot(s.width  || 0, dpi);
  const h = px2dot(s.height || 0, dpi);
  const t = Math.max(1, px2dot(s.borderWidth || 1, dpi));

  if (w <= 0 || h <= 0) return [];
  return [`^FO${x},${y}^GB${w},${h},${t}^FS`];
}

function emitLine(el, localY, dpi) {
  const s = el.style || {};
  const x = px2dot(el.position?.x || 0, dpi);
  const y = px2dot(localY, dpi);
  const len   = px2dot(s.length    || 100, dpi);
  const thick = Math.max(1, px2dot(s.thickness || 1, dpi));

  if ((s.direction || 'horizontal') === 'vertical') {
    return [`^FO${x},${y}^GB${thick},${len},${thick}^FS`];
  }
  return [`^FO${x},${y}^GB${len},${thick},${thick}^FS`];
}

function emitTable(el, localY, dpi, canvasW) {
  const cmds     = [];
  const columns  = el.columns || [];
  const ts       = el.style   || {};
  const tableX   = el.position?.x || 0;
  const totalWpx = columns.reduce((s, c) => s + (c.width || 0), 0) || canvasW;

  const rowHpx   = 26;  // default row height
  const hdrHpx   = 32;
  const fsPx     = ts.fontSize || 11;
  let   curYpx   = localY;

  // Header row
  if (el.headerRow?.cells?.length) {
    // Draw header border
    if (ts.showBorders !== false) {
      cmds.push(...emitTableBorderRow(tableX, curYpx, totalWpx, hdrHpx, dpi));
    }
    // Draw header cells
    let cellX = tableX;
    for (let ci = 0; ci < el.headerRow.cells.length; ci++) {
      const cell = el.headerRow.cells[ci];
      if (cell.mergedInto) { cellX += columns[ci]?.width || 0; continue; }
      const colW = columns[ci]?.width || (totalWpx / el.headerRow.cells.length);
      const text = (cell.content?.value || '').replace(/\^/g, '_');
      if (text.trim()) {
        const x  = px2dot(cellX + 3, dpi);
        const y  = px2dot(curYpx + 3, dpi);
        const fw = px2dot(fsPx, dpi);
        const fh = Math.round(fw * 0.6);
        cmds.push(`^FO${x},${y}^A0N,${fw},${fh}^FD${text}^FS`);
      }
      cellX += colW;
    }
    curYpx += hdrHpx;
  }

  // Data rows
  for (const row of (el.rows || [])) {
    if (ts.showBorders !== false) {
      cmds.push(...emitTableBorderRow(tableX, curYpx, totalWpx, rowHpx, dpi));
    }
    let cellX = tableX;
    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = row.cells[ci];
      if (cell.mergedInto) { cellX += columns[ci]?.width || 0; continue; }
      const colW = columns[ci]?.width || (totalWpx / row.cells.length);
      const text = (cell.content?.value || '').replace(/\^/g, '_');
      if (text.trim()) {
        const x  = px2dot(cellX + 3, dpi);
        const y  = px2dot(curYpx + 3, dpi);
        const fw = px2dot(fsPx, dpi);
        const fh = Math.round(fw * 0.6);
        cmds.push(`^FO${x},${y}^A0N,${fw},${fh}^FD${text}^FS`);
      }
      cellX += colW;
    }
    curYpx += rowHpx;
  }

  return cmds;
}

function emitTableBorderRow(tableXpx, rowYpx, widthPx, heightPx, dpi) {
  const x = px2dot(tableXpx, dpi);
  const y = px2dot(rowYpx, dpi);
  const w = px2dot(widthPx, dpi);
  const h = px2dot(heightPx, dpi);
  return [`^FO${x},${y}^GB${w},${h},1^FS`];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main generator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate ZPL output buffer from canvas template data.
 *
 * @param {object} params - Same shape as generatePdfBuffer params
 * @returns {Promise<Buffer>} UTF-8 ZPL text
 */
async function generateZplBuffer({
  ir,
  templateElements        = [],
  fieldMapping            = {},
  tableCollectionBindings = {},
  collectionMappings      = {},
  pageConfigs             = [],
  pageSize                = null,
}) {
  if (!ir || !ir.fields || !ir.collections) {
    throw new Error('[generateZplBuffer] ir (CanonicalDocument) is required.');
  }

  const canvasW  = pageSize?.canvasWidth  || DEFAULT_CANVAS_W;
  const canvasPH = pageSize?.canvasHeight || DEFAULT_CANVAS_PH;
  const dpi      = DEFAULT_DPI;

  const labelWdots = px2dot(canvasW, dpi);
  const labelHdots = px2dot(canvasPH, dpi);

  const irFields      = ir.fields;
  const irCollections = ir.collections;

  // ── 1. Resolve all template elements ─────────────────────────────────────
  const resolved = [];
  for (const el of templateElements) {
    if (el.type === 'table' && el.schemaVersion === 2) {
      const collKey = (
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

  // ── 2. Group elements by canvas page ─────────────────────────────────────
  const pageMap = new Map();  // pageIndex → elements[]
  for (const el of resolved) {
    const absY     = el.position?.y || 0;
    const pageIdx  = Math.floor(absY / canvasPH);
    if (!pageMap.has(pageIdx)) pageMap.set(pageIdx, []);
    pageMap.get(pageIdx).push(el);
  }

  // If no elements, produce one empty label
  if (pageMap.size === 0) pageMap.set(0, []);

  // ── 3. Generate ZPL for each page ────────────────────────────────────────
  const labels = [];

  const sortedPages = [...pageMap.keys()].sort((a, b) => a - b);
  for (const pageIdx of sortedPages) {
    const elements = pageMap.get(pageIdx);
    const cmds = [];

    cmds.push('^XA');
    cmds.push('^CI28');                    // UTF-8 encoding
    cmds.push(`^PW${labelWdots}`);         // print width
    cmds.push(`^LL${labelHdots}`);         // label length

    // Sort elements by Y position for consistent output
    const sorted = [...elements].sort((a, b) =>
      (a.position?.y || 0) - (b.position?.y || 0)
    );

    for (const el of sorted) {
      const absY   = el.position?.y || 0;
      const localY = absY - pageIdx * canvasPH;

      switch (el.type) {
        case 'text':
        case 'paragraph':
        case 'date':
          cmds.push(...emitText(el, localY, dpi, canvasW));
          break;

        case 'barcode':
          cmds.push(...emitBarcode(el, localY, dpi));
          break;

        case 'box':
          cmds.push(...emitBox(el, localY, dpi));
          break;

        case 'line':
          cmds.push(...emitLine(el, localY, dpi));
          break;

        case 'table':
          cmds.push(...emitTable(el, localY, dpi, canvasW));
          break;

        case 'image':
          // Images are not supported in ZPL mode — thermal printers
          // have limited image capability and would need GRF encoding
          console.warn(`[zpl] Image element skipped (id: ${el.id})`);
          break;

        default:
          // Unknown element type — skip
          break;
      }
    }

    cmds.push('^XZ');
    labels.push(cmds.join('\n'));
  }

  return Buffer.from(labels.join('\n\n'), 'utf-8');
}

module.exports = { generateZplBuffer };
