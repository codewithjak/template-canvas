/**
 * pdfRenderer.js
 *
 * All elements are rendered with position:absolute at their canvas coordinates.
 * The key fix for variable-height tables:
 *
 *   1. Calculate how much each data table expands beyond its template height
 *      (template shows 1–2 placeholder rows; export shows 50+ data rows).
 *   2. For every non-table element whose y > tableBottom, shift its y down
 *      by the expansion delta of every table above it.
 *   3. The table itself keeps its original y — it just grows downward.
 *   4. A spacer div sets the container's scrollable height so Puppeteer
 *      captures all content across pages.
 *
 * This keeps "Amount in Words", "Total", "Notes", "For Company" etc. pinned
 * below the last data row rather than floating inside the table.
 */

const { renderElement } = require('./elementRenderers');

const A4_W = 794;
const ROW_H  = 28;   // estimated px per data row
const HDR_H  = 38;   // estimated px for a table header row

// ── Utilities ────────────────────────────────────────────────────────────────

function replacePlaceholders(text, data, fieldMapping = {}) {
  if (typeof text !== 'string') return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const key = raw.trim();
    const dataKey = fieldMapping[key] || key;
    const v = getNestedValue(data, dataKey);
    return v !== undefined && v !== null ? String(v) : '';
  });
}

function getNestedValue(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

// ── Table height helpers ──────────────────────────────────────────────────────

function templateTableHeight(tableEl) {
  const hasHeader = !!(tableEl.headerRow?.cells?.length);
  return (hasHeader ? HDR_H : 0) + (tableEl.rows || []).length * ROW_H;
}

function expandedTableHeight(tableEl, dataRowCount) {
  const hasHeader = !!(tableEl.headerRow?.cells?.length);
  return (hasHeader ? HDR_H : 0) + dataRowCount * ROW_H;
}

// ── Expansion offset map ──────────────────────────────────────────────────────

function buildExpansionMap(templateElements, collections, tableCollectionBindings) {
  return templateElements
    .filter(el => el.type === 'table' && el.schemaVersion === 2)
    .map(el => {
      const collKey =
        (tableCollectionBindings || {})[el.id] ||
        el.binding?.collectionKey ||
        Object.keys(collections)[0] ||
        'items';

      const raw  = collections[collKey] || [];
      const rows = Array.isArray(raw) ? raw : (raw.rows || []);

      const tplH   = templateTableHeight(el);
      const expH   = expandedTableHeight(el, rows.length);
      const tableY = el.position?.y || 0;

      return {
        tableY,
        tableBottom: tableY + tplH,
        offset: Math.max(0, expH - tplH),
      };
    })
    .sort((a, b) => a.tableY - b.tableY);
}

function cumulativeOffset(elementY, expansionMap) {
  let total = 0;
  for (const entry of expansionMap) {
    if (elementY > entry.tableBottom) total += entry.offset;
  }
  return total;
}

// ── Element resolution ────────────────────────────────────────────────────────

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
    const v = getNestedValue(row, colName);
    if (v !== undefined && v !== null) return String(v);
    if (cell.binding.fallback != null) return String(cell.binding.fallback);
    return '';
  }
  return replacePlaceholders(cell.content?.value ?? '', row, collectionMapping);
}

function resolveTable(tableElement, collectionRows, staticData, fieldMapping, collectionMapping) {
  const el = JSON.parse(JSON.stringify(tableElement));

  if (el.headerRow?.cells) {
    el.headerRow.cells = el.headerRow.cells.map(cell => {
      if (cell.mergedInto) return cell;
      return {
        ...cell,
        content: {
          type: 'text',
          value: replacePlaceholders(cell.content?.value ?? '', staticData, fieldMapping),
        },
        binding: undefined,
      };
    });
  }

  const templateRows = el.rows || [];
  el.rows = collectionRows.flatMap((row, ri) =>
    templateRows.map((tRow, ti) => ({
      ...tRow,
      id: `${tRow.id}__r${ri}t${ti}`,
      cells: tRow.cells.map(cell => {
        if (cell.mergedInto) return cell;
        return {
          ...cell,
          id: `${cell.id}__r${ri}t${ti}`,
          content: { type: 'text', value: resolveCellValue(cell, row, collectionMapping) },
          binding: undefined,
        };
      }),
    }))
  );

  return el;
}

// ── Main builder ──────────────────────────────────────────────────────────────

function buildPdfHtml(
  templateElements,
  staticData = {},
  collections = {},
  fieldMapping = {},
  tableCollectionBindings = {},
  collectionMappings = {}
) {
  const expansionMap = buildExpansionMap(templateElements, collections, tableCollectionBindings);

  // Calculate total document height
  let maxBottom = 1123;
  for (const el of templateElements) {
    const elY   = el.position?.y || 0;
    const shift = cumulativeOffset(elY, expansionMap);

    if (el.type === 'table' && el.schemaVersion === 2) {
      const collKey = (tableCollectionBindings || {})[el.id]
        || el.binding?.collectionKey
        || Object.keys(collections)[0]
        || 'items';
      const raw  = collections[collKey] || [];
      const rows = Array.isArray(raw) ? raw : (raw.rows || []);
      maxBottom  = Math.max(maxBottom, elY + expandedTableHeight(el, rows.length) + 60);
    } else {
      maxBottom = Math.max(maxBottom, elY + shift + (el.style?.height || 30) + 20);
    }
  }

  const spacerH = maxBottom + 80;
  const parts   = [];

  for (const element of templateElements) {
    if (element.type === 'table' && element.schemaVersion === 2) {
      const collKey = (tableCollectionBindings || {})[element.id]
        || element.binding?.collectionKey
        || Object.keys(collections)[0]
        || 'items';

      const raw  = collections[collKey] || [];
      const rows = Array.isArray(raw) ? raw : (raw.rows || []);
      const colMapping = collectionMappings[collKey] || {};

      const resolved = resolveTable(element, rows, staticData, fieldMapping, colMapping);
      parts.push(renderElement(resolved));
    } else {
      // Shift elements below the table down by the expansion offset
      const originalY = element.position?.y || 0;
      const shift     = cumulativeOffset(originalY, expansionMap);

      const shifted = {
        ...element,
        position: { ...element.position, y: originalY + shift },
      };

      const resolved = resolveStaticElement(shifted, staticData, fieldMapping);
      parts.push(renderElement(resolved));
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; }
    .canvas { position: relative; width: ${A4_W}px; }
    .spacer  { height: ${spacerH}px; width: 1px; visibility: hidden; display: block; }
    table    { border-collapse: collapse; }
    td, th   { word-break: break-word; }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="spacer"></div>
    ${parts.join('\n    ')}
  </div>
</body>
</html>`;
}

module.exports = { buildPdfHtml };