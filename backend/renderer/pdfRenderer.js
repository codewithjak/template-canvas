/**
 * pdfRenderer.js  — Browser-Authoritative Layout Engine
 *
 * CHANGES vs previous version
 * ───────────────────────────
 *
 * 1. PAGE_MARGIN_V constant (browser script)
 *    A new constant `PAGE_MARGIN_V = 20` is introduced in the browser layout
 *    script.  It must equal the `top` / `bottom` values used in the Puppeteer
 *    `page.pdf({ margin })` call in server/index.js (see note there).
 *
 *    Effective content height per page:
 *      A4_PAGE_H = 1123 - PAGE_MARGIN_V * 2 = 1083 px
 *
 *    All page-boundary calculations (spacer, footer keep-together) now use
 *    A4_PAGE_H = 1083 instead of the raw 1123.  This keeps the browser
 *    script's page model in sync with what Puppeteer actually renders.
 *
 * 2. Footer keep-together (browser script)
 *    After the main static-element repositioning loop, the script:
 *      a. Identifies "footer elements" — static elements whose original
 *         template Y is >= the last table's templateBottom.  Works for any
 *         number of tables including zero (block is skipped when no tables).
 *      b. Finds the topmost and bottommost edges of that group.
 *      c. Calculates how much space remains on the footer's current page.
 *      d. If the footer height exceeds that space, pushes every footer
 *         element down to the start of the next page (+ PADDING gap).
 *    After this push, maxBottom is recalculated before sizing the spacer so
 *    the extra page is properly captured by Puppeteer.
 *
 * 3. Spacer calculation updated
 *    Uses A4_PAGE_H = 1083 (content height) instead of 1123 (physical height)
 *    so the trailing empty space on the last page is minimal and Puppeteer
 *    does not emit a blank extra page.
 *
 * Architecture is otherwise unchanged from the previous version.
 */

const { renderElement } = require('./elementRenderers');

const A4_W = 794;

// ─── Placeholder / value helpers (unchanged) ────────────────────────────────

function replacePlaceholders(text, data, fieldMapping = {}) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const key     = raw.trim();
    const dataKey = fieldMapping[key] || key;
    const v       = getNestedValue(data, dataKey);
    return v !== undefined && v !== null ? String(v) : '';
  });
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

// ─── Element resolution (unchanged) ─────────────────────────────────────────

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

function resolveCellValue(cell, row, collectionMapping) {
  if (cell.binding?.path) {
    const colName = collectionMapping[cell.binding.path] || cell.binding.path;
    const v       = getNestedValue(row, colName);
    if (v !== undefined && v !== null) return String(v);
    if (cell.binding.fallback != null) return String(cell.binding.fallback);
    return '';
  }
  return replacePlaceholders(cell.content?.value ?? '', row, collectionMapping);
}

function resolveTable(tableElement, collectionRows, staticData, fieldMapping, collectionMapping) {
  const el         = JSON.parse(JSON.stringify(tableElement));
  el._originalY    = tableElement.position?.y || 0;
  el.templateHeight = estimateTemplateHeight(tableElement);

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
  el.rows = collectionRows.flatMap((row, ri) =>
    templateRows.map((tRow, ti) => ({
      ...tRow,
      id   : `${tRow.id}__r${ri}t${ti}`,
      cells: tRow.cells.map(cell => {
        if (cell.mergedInto) return cell;
        return {
          ...cell,
          id     : `${cell.id}__r${ri}t${ti}`,
          content: { type: 'text', value: resolveCellValue(cell, row, collectionMapping) },
          binding: undefined,
        };
      }),
    }))
  );

  return el;
}

function estimateTemplateHeight(tableEl) {
  const ROW_H     = 26;
  const HDR_H     = 32;
  const hasHeader = !!(tableEl.headerRow?.cells?.length);
  return (hasHeader ? HDR_H : 0) + (tableEl.rows || []).length * ROW_H;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

function buildPdfHtml(
  templateElements,
  staticData              = {},
  collections             = {},
  fieldMapping            = {},
  tableCollectionBindings = {},
  collectionMappings      = {}
) {
  const parts = [];

  for (const element of templateElements) {
    if (element.type === 'table' && element.schemaVersion === 2) {
      const collKey = (tableCollectionBindings || {})[element.id]
        || element.binding?.collectionKey
        || Object.keys(collections)[0]
        || 'items';

      const raw        = collections[collKey] || [];
      const rows       = Array.isArray(raw) ? raw : (raw.rows || []);
      const colMapping = collectionMappings[collKey] || {};

      const resolved = resolveTable(element, rows, staticData, fieldMapping, colMapping);
      parts.push(renderElement(resolved));
    } else {
      const resolved = resolveStaticElement(element, staticData, fieldMapping);
      parts.push(renderElement(resolved));
    }
  }

  const A4_H = 1123;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @page  { size: A4; margin: 0; }
    *      { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body   { margin: 0; padding: 0; background: white; }
    .canvas          { position: relative; width: ${A4_W}px; background: white; }
    .pdf-layout-spacer { width: 1px; visibility: hidden; display: block; }
    .pdf-box         { z-index: 0; }
    .pdf-line        { z-index: 1; }
    .pdf-text,
    .pdf-paragraph,
    .pdf-date        { z-index: 2; }
    .pdf-table       { z-index: 2; background: transparent; }
    table  { border-collapse: collapse; page-break-inside: auto; }
    thead  { display: table-header-group; }
    tbody  { display: table-row-group; }
    tr     { page-break-inside: avoid; break-inside: avoid; }
    td, th { word-break: break-word; }
  </style>
</head>
<body>
  <div class="canvas" id="pdfCanvas">
    ${parts.join('\n    ')}
    <div class="pdf-layout-spacer" id="pdfSpacer"></div>
  </div>

  <script>
    /**
     * Browser-authoritative layout pass.
     *
     * Steps
     * ─────
     * 1. Measure every .pdf-table's actual rendered height.
     * 2. Build expansionMap (how much each table grew vs template estimate).
     * 3. Reposition every static element, applying cumulative expansion offsets
     *    and an overlap guard.
     * 4. [NEW] Footer keep-together: if the group of elements below the last
     *    table would be split by a page break, push the entire group to the
     *    start of the next page.
     * 5. Recalculate maxBottom after any footer push.
     * 6. Resize the canvas spacer so Puppeteer captures all pages.
     * 7. Set window.__pdfReady after double-tick to confirm reflow.
     *
     * PAGE_MARGIN_V
     * ─────────────
     * MUST equal the top (and bottom) value passed to Puppeteer's
     * page.pdf({ margin }) in server/index.js.
     * Both values are 20 px.  If you change one, change the other.
     *
     * Effective content height per page = 1123 - 20 - 20 = 1083 px.
     * All page-boundary logic uses this 1083 px figure (A4_PAGE_H).
     */
    (function layoutPdf() {

      var canvas    = document.getElementById('pdfCanvas');
      var spacer    = document.getElementById('pdfSpacer');
      var PADDING   = 8;  // px gap between a table bottom and the next element

      // ── PAGE GEOMETRY ──────────────────────────────────────────────────────
      // PAGE_MARGIN_V must stay in sync with server/index.js page.pdf() margin.
      var PAGE_MARGIN_V  = 20;
      var A4_PHYSICAL_H  = 1123;
      var A4_PAGE_H      = A4_PHYSICAL_H - PAGE_MARGIN_V * 2;  // 1083 px

      // ── 1. Measure every table ──────────────────────────────────────────────
      var tableDivs  = Array.from(document.querySelectorAll('.pdf-element.pdf-table'));
      var canvasRect = canvas.getBoundingClientRect();
      var canvasTop  = canvasRect.top;
      var canvasLeft = canvasRect.left;

      var expansionMap = tableDivs.map(function(tbl) {
        var rect      = tbl.getBoundingClientRect();
        var origY     = parseFloat(tbl.dataset.originalY) || 0;
        var templateH = parseFloat(tbl.dataset.templateH) || 0;
        var actualH   = Math.round(rect.height);
        var actualTop = Math.round(rect.top  - canvasTop);

        return {
          origY         : origY,
          templateBottom: origY + templateH,
          actualBottom  : actualTop + actualH,
          offset        : Math.max(0, actualH - templateH),
          left          : Math.round(rect.left - canvasLeft),
          width         : Math.round(rect.width),
        };
      }).sort(function(a, b) { return a.origY - b.origY; });

      // ── 2 & 3. Reposition every static element ─────────────────────────────
      var staticEls = Array.from(
        document.querySelectorAll('.pdf-element:not(.pdf-table)')
      );

      // Track each element's final newTop so we can use it in step 4.
      var elementNewTops = new Map();

      staticEls.forEach(function(el) {
        var origY = parseFloat(el.dataset.originalY) || 0;

        // Sum offsets from tables whose template bottom is above this element.
        var shift = expansionMap.reduce(function(sum, entry) {
          return sum + (origY >= entry.templateBottom ? entry.offset : 0);
        }, 0);

        var newTop = origY + shift;

        // Overlap guard: push element below any table it would land inside.
        expansionMap.forEach(function(entry) {
          if (newTop >= entry.actualBottom) return;
          if (origY  <  entry.origY)       return;
          newTop = entry.actualBottom + PADDING;
        });

        el.style.top = newTop + 'px';
        elementNewTops.set(el, newTop);
      });

      // ── 4. Footer keep-together ─────────────────────────────────────────────
      //
      // "Footer elements" = static elements whose original template Y is at or
      // below the last table's templateBottom.  For templates with no tables the
      // block is skipped entirely.
      //
      // If the footer group's total height exceeds the space remaining on the
      // page where it currently starts, every footer element is shifted down to
      // the start of the next page.
      if (expansionMap.length > 0) {
        // Find the template bottom of the LAST table (handles multi-table templates).
        var lastTableTemplateBottom = expansionMap.reduce(function(max, e) {
          return e.templateBottom > max ? e.templateBottom : max;
        }, 0);

        // Collect footer elements.
        var footerEls = staticEls.filter(function(el) {
          return (parseFloat(el.dataset.originalY) || 0) >= lastTableTemplateBottom;
        });

        if (footerEls.length > 0) {
          // Current top of the topmost footer element (after repositioning).
          var footerMinTop = footerEls.reduce(function(min, el) {
            var t = elementNewTops.get(el) || 0;
            return t < min ? t : min;
          }, Infinity);

          // Bottom edge of the lowest footer element.
          // Use offsetHeight (available synchronously) to avoid needing a reflow.
          var footerMaxBottom = footerEls.reduce(function(max, el) {
            var t = elementNewTops.get(el) || 0;
            var h = el.offsetHeight || 20;
            var b = t + h;
            return b > max ? b : max;
          }, 0);

          var footerTotalH = footerMaxBottom - footerMinTop;

          // Which page does the footer start on?
          var footerPage    = Math.floor(footerMinTop / A4_PAGE_H);
          // Remaining space on that page after the footer's starting Y.
          var spaceOnPage   = (footerPage + 1) * A4_PAGE_H - footerMinTop;

          if (footerTotalH > spaceOnPage) {
            // Footer won't fit — push the entire group to the next page.
            var nextPageStart = (footerPage + 1) * A4_PAGE_H + PADDING;
            var pushDown      = nextPageStart - footerMinTop;

            footerEls.forEach(function(el) {
              var cur = parseFloat(el.style.top) || 0;
              var newY = cur + pushDown;
              el.style.top = newY + 'px';
              elementNewTops.set(el, newY);
            });
          }
        }
      }

      // ── 5. Recalculate maxBottom after all moves ────────────────────────────
      var allEls    = Array.from(document.querySelectorAll('.pdf-element'));
      var maxBottom = A4_PAGE_H; // minimum: at least one page

      allEls.forEach(function(el) {
        var rect   = el.getBoundingClientRect();
        var bottom = Math.round(rect.bottom - canvasTop);
        if (bottom > maxBottom) maxBottom = bottom;
      });

      // ── 6. Resize canvas / spacer ───────────────────────────────────────────
      // Use A4_PAGE_H (content height) so the last page has minimal trailing
      // blank space and Puppeteer doesn't emit an extra empty page.
      var pages  = Math.ceil((maxBottom + 40) / A4_PAGE_H);
      var totalH = pages * A4_PAGE_H;

      spacer.style.height    = totalH + 'px';
      canvas.style.minHeight = totalH + 'px';

      // ── 7. Signal Puppeteer after reflow is confirmed ───────────────────────
      requestAnimationFrame(function() {
        setTimeout(function() {
          window.__pdfReady = true;
        }, 0);
      });

    })();
  </script>
</body>
</html>`;
}

module.exports = { buildPdfHtml };