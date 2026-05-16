/**
 * pdfLibRenderer.js
 *
 * Main PDF generation orchestrator using pdf-lib.
 * Replaces both pdfRenderer.js (Puppeteer/HTML) and pdfKitRenderer.js.
 *
 * Pipeline:
 *   1. Resolve all placeholders and expand table rows (same logic as before)
 *   2. Preload all images as bytes
 *   3. Sort elements by canvas Y position (top → bottom)
 *   4. Draw each element in order using pdf-lib, advancing the PageManager
 *   5. Tables handle their own pagination internally (drawTable)
 *   6. Static elements below a table are drawn after the table finishes,
 *      at the PageManager's current Y — no manual repositioning needed
 *
 * Coordinate system:
 *   - Canvas: px, top-left origin, Y increases downward
 *   - PDF:    pt, bottom-left origin, Y increases upward
 *   - Scale:  595.28 / 794 ≈ 0.7497 (applied via px() from coordinateUtils)
 *
 * Element draw order:
 *   Elements are sorted by their canvas Y position so they render top-to-bottom.
 *   Boxes and lines are drawn before text/images at the same Y (z-order).
 *
 * Key design decision — "absolute vs flow":
 *   Canvas elements have absolute x,y positions. In PDF we honour x exactly
 *   (scaled to pt). For y we use the RELATIVE position within the template:
 *     - The first element at canvas y=0 starts at the top of the first page.
 *     - Subsequent elements are placed at: their canvas y offset from the
 *       previous table's bottom (or page top for page 1).
 *   This means if element A is at canvas y=300 and a table above it ends at
 *   PDF y=200pt, element A is drawn at PDF y=200pt — not at 300*SCALE.
 *   The canvas y is used ONLY to determine ORDER, not absolute PDF position.
 *
 *   Exception: elements ABOVE all tables keep their absolute scaled position
 *   so the header area of the template (logo, company name, etc.) renders
 *   exactly where designed.
 */

const { PDFDocument, rgb } = require('pdf-lib');
const https = require('https');
const http  = require('http');

const { PageManager }                    = require('./pageManager');
const { FontCache }                      = require('./fontLoader');
const { px, parseColor, SCALE }          = require('./coordinateUtils');
const { drawBox, drawLine, drawText, drawImage, drawTable } = require('./elementDrawers');

// ── Placeholder helpers (identical to pdfRenderer.js) ────────────────────────

function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

function replacePlaceholders(text, data, fieldMapping = {}) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const key     = raw.trim();
    const dataKey = fieldMapping[key] || key;
    const v       = getNestedValue(data, dataKey);
    return v !== undefined && v !== null ? String(v) : '';
  });
}

function resolveCellValue(cell, row, colMap) {
  if (cell.binding?.path) {
    const col = colMap[cell.binding.path] || cell.binding.path;
    const v   = getNestedValue(row, col);
    if (v !== undefined && v !== null) return String(v);
    if (cell.binding.fallback != null) return String(cell.binding.fallback);
    return '';
  }
  return replacePlaceholders(cell.content?.value ?? '', row, colMap);
}

function resolveStaticElement(element, staticData, fieldMapping) {
  const el = JSON.parse(JSON.stringify(element));
  if (el.type === 'text' || el.type === 'paragraph') {
    el.content = replacePlaceholders(el.content || '', staticData, fieldMapping);
  }
  if (el.type === 'image') {
    el.src = replacePlaceholders(el.src || '', staticData, fieldMapping);
  }
  if (el.type === 'date') {
    el.value = replacePlaceholders(el.value || '', staticData, fieldMapping);
  }
  return el;
}

function resolveTable(tableEl, collRows, staticData, fieldMapping, colMap) {
  const el = JSON.parse(JSON.stringify(tableEl));

  if (el.headerRow?.cells) {
    el.headerRow.cells = el.headerRow.cells.map(cell => {
      if (cell.mergedInto) return cell;
      return {
        ...cell,
        content : { type: 'text', value: replacePlaceholders(cell.content?.value ?? '', staticData, fieldMapping) },
        binding : undefined,
      };
    });
  }

  const templateRows = el.rows || [];
  el.rows = collRows.flatMap((row, ri) =>
    templateRows.map((tRow, ti) => ({
      ...tRow,
      id   : `${tRow.id}__r${ri}t${ti}`,
      cells: tRow.cells.map(cell => {
        if (cell.mergedInto) return cell;
        return {
          ...cell,
          id     : `${cell.id}__r${ri}t${ti}`,
          content: { type: 'text', value: resolveCellValue(cell, row, colMap) },
          binding: undefined,
        };
      }),
    }))
  );

  return el;
}

// ── Image preloading ──────────────────────────────────────────────────────────

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
      if (el.src.startsWith('data:')) {
        const base64 = el.src.split(',')[1] || '';
        el._imgBytes = Buffer.from(base64, 'base64');
      } else if (el.src.startsWith('http://') || el.src.startsWith('https://')) {
        el._imgBytes = await fetchBytes(el.src);
      }
    } catch (err) {
      console.warn('[pdfLibRenderer] image preload failed:', err.message);
      el._imgBytes = null;
    }
  }
}

// ── Element sort order ────────────────────────────────────────────────────────

const TYPE_Z = { box: 0, line: 1, image: 2, text: 3, paragraph: 3, date: 3, table: 4, radio: 3, checkbox: 3 };

function elementSortKey(el) {
  const y = el.position?.y ?? 0;
  const z = TYPE_Z[el.type] ?? 3;
  return y * 10 + z;
}

// ── Main generator ────────────────────────────────────────────────────────────

/**
 * Generate a PDF buffer from canvas elements + data.
 *
 * @param {object} opts
 * @param {object[]} opts.templateElements
 * @param {object}   opts.staticData
 * @param {object}   opts.collections         normalised { key: { rows, headers } }
 * @param {object}   opts.fieldMapping
 * @param {object}   opts.tableCollectionBindings
 * @param {object}   opts.collectionMappings
 * @returns {Promise<Buffer>}
 */
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

  for (const element of templateElements) {
    if (element.type === 'table' && element.schemaVersion === 2) {
      const collKey = (tableCollectionBindings[element.id])
        || element.binding?.collectionKey
        || Object.keys(collections)[0]
        || '';

      const collData   = collections[collKey] || {};
      const rows       = Array.isArray(collData) ? collData : (collData.rows || []);
      const colMapping = collectionMappings[collKey] || {};

      resolved.push(resolveTable(element, rows, staticData, fieldMapping, colMapping));
    } else {
      resolved.push(resolveStaticElement(element, staticData, fieldMapping));
    }
  }

  // ── 2. Preload images ──────────────────────────────────────────────────────
  await preloadImages(resolved);

  // ── 3. Sort elements top → bottom (by canvas Y), then by z-type ───────────
  const sorted = [...resolved].sort((a, b) => elementSortKey(a) - elementSortKey(b));

  // ── 4. Create PDF document ─────────────────────────────────────────────────
  const pdfDoc = await PDFDocument.create();

  // Register fontkit for custom font support (pdf-lib requires this)
  try {
    const fontkit = require('@pdf-lib/fontkit');
    pdfDoc.registerFontkit(fontkit);
  } catch (e) {
    // fontkit optional — standard fonts still work without it
  }

  const fontCache = new FontCache(pdfDoc);
  const manager   = new PageManager(pdfDoc);

  // Pre-embed the fonts we'll need
  const fontNormal = await fontCache.get('Arial', false);
  const fontBold   = await fontCache.get('Arial', true);
  const fonts      = { normal: fontNormal, bold: fontBold };

  // ── 5. Draw each element ───────────────────────────────────────────────────
  //
  // Strategy:
  //   - Elements are split into two groups relative to the first table:
  //       HEADER: elements whose canvas y < first table's canvas y
  //       BODY:   tables and elements whose canvas y >= first table's canvas y
  //   - HEADER elements are drawn at their exact scaled absolute positions
  //     on page 1 (they stay fixed regardless of table expansion).
  //   - BODY elements flow: each table draws itself (with pagination),
  //     then elements between/after tables are drawn at the current
  //     PageManager y position.
  //
  //   This means the header (logo, company name, date, invoice number, etc.)
  //   always renders exactly where it is on the canvas, while the table and
  //   footer flow naturally below it.

  const firstTableY = sorted.find(e => e.type === 'table')?.position?.y ?? Infinity;

  // Group elements
  const headerEls = sorted.filter(e => e.type !== 'table' && (e.position?.y ?? 0) < firstTableY);
  const bodyEls   = sorted.filter(e => e.type === 'table' || (e.position?.y ?? 0) >= firstTableY);

  // ── Draw header elements (absolute positions) ──────────────────────────────
  for (const el of headerEls) {
    const x = px(el.position?.x || 0);
    // Convert canvas y (top-down) to PDF y (bottom-up):
    // PDF y of element top = pageHeight - marginTop - canvasY * SCALE
    // But we must respect the PageManager's page, so use page 1 coords.
    const canvasY = el.position?.y || 0;
    const pdfY    = manager.pageHeight - manager.marginTop - canvasY * SCALE;

    await drawSingleElement(el, manager.page, pdfDoc, x, pdfY, fonts, manager);
  }

  // Set PageManager y to just below the last header element
  // so body elements start from there
  if (headerEls.length > 0) {
    const lastHeaderEl = headerEls[headerEls.length - 1];
    const lastCanvasY  = (lastHeaderEl.position?.y || 0) + getElementHeightPx(lastHeaderEl);
    manager.y          = manager.pageHeight - manager.marginTop - lastCanvasY * SCALE;
  }

  // ── Draw body elements (flow layout) ──────────────────────────────────────
  for (const el of bodyEls) {
    if (el.type === 'table') {
      // Table manages its own pages and advances the manager internally
      drawTable(pdfDoc, el, manager, fonts);
    } else {
      // Static element: draw at current manager.y
      const x    = px(el.position?.x || 0);
      const hPt  = getElementHeightPt(el, fonts, fontNormal);

      if (!manager.fits(hPt)) manager.newPage();

      await drawSingleElement(el, manager.page, pdfDoc, x, manager.y, fonts, manager);
      manager.advance(hPt);
    }
  }

  // ── 6. Serialize ──────────────────────────────────────────────────────────
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ── Draw a single non-table element ──────────────────────────────────────────

async function drawSingleElement(el, page, pdfDoc, x, y, fonts, manager) {
  const s    = el.style || {};
  const SCALE_LOCAL = 595.28 / 794;

  switch (el.type) {
    case 'box': {
      const wPt = px(s.width  || 0);
      const hPt = px(s.height || 0);
      drawBox(page, el, x, y, wPt, hPt);
      break;
    }

    case 'line': {
      drawLine(page, el, x, y);
      break;
    }

    case 'text':
    case 'paragraph':
    case 'date': {
      const text     = el.content || el.value || '';
      const fsPx     = s.fontSize || 12;
      const fsPt     = fsPx * SCALE_LOCAL;
      const bold     = s.fontWeight === 'bold' || s.fontWeight === '700';
      const font     = bold ? fonts.bold : fonts.normal;
      const maxWPt   = px(s.width || (794 - (el.position?.x || 0)));
      const lhPt     = s.lineHeight ? s.lineHeight * SCALE_LOCAL : fsPt * 1.3;
      drawText(page, text, font, fsPt, x, y, maxWPt, s.color || '#000000', lhPt);
      break;
    }

    case 'image': {
      const wPt = px(s.width  || 100);
      const hPt = px(s.height || 100);
      await drawImage(page, pdfDoc, el, x, y, wPt, hPt);
      break;
    }

    case 'radio':
    case 'checkbox': {
      // Render as simple text representation
      const font  = fonts.normal;
      const fsPt  = 10 * SCALE_LOCAL;
      const items = el.type === 'radio'
        ? Array.from({ length: el.options || 2 }, (_, i) => {
            const checked = String(el.selected) === String(i);
            return `${checked ? '●' : '○'} Option ${i + 1}`;
          })
        : Array.from({ length: el.count || 1 }, (_, i) => {
            const checked = (el.checkedValues || []).includes(String(i));
            return `${checked ? '☑' : '☐'} ${el.labels?.[i] || ''}`;
          });

      let curY = y;
      for (const item of items) {
        drawText(page, item, font, fsPt, x, curY, px(200), '#000000', fsPt * 1.4);
        curY -= fsPt * 1.4;
      }
      break;
    }

    default:
      break;
  }
}

// ── Height estimation helpers ─────────────────────────────────────────────────

function getElementHeightPx(el) {
  if (el.type === 'box' || el.type === 'image') return el.style?.height || 0;
  if (el.type === 'line') {
    const s = el.style || {};
    return s.direction === 'vertical' ? (s.length || 0) : (s.thickness || 1);
  }
  // For text elements, estimate based on font size and line height
  const fs = el.style?.fontSize || 12;
  const lh = el.style?.lineHeight || fs * 1.3;
  // Count newlines
  const text = el.content || el.value || '';
  const lines = text.split('\n').length;
  return lines * lh + 4;  // +4px padding
}

function getElementHeightPt(el, fonts, font) {
  return getElementHeightPx(el) * (595.28 / 794);
}

module.exports = { generatePdfBuffer };