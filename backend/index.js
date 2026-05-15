const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

function cellToString(cell) {
  if (cell === undefined || cell === null) return '';
  return String(cell).trim();
}

function isBlankCell(cell) {
  return cellToString(cell) === '';
}

function isBlankRow(row) {
  return !Array.isArray(row) || row.every(isBlankCell);
}

function trimTrailingEmptyCells(row) {
  let end = row.length - 1;
  while (end >= 0 && isBlankCell(row[end])) end -= 1;
  return row.slice(0, end + 1).map(cellToString);
}

function countFilled(row) {
  return row.reduce((count, cell) => count + (isBlankCell(cell) ? 0 : 1), 0);
}

function splitRowsIntoSegments(rows) {
  const segments = [];
  let current = [];
  let startRow = 0;

  rows.forEach((row, index) => {
    if (isBlankRow(row)) {
      if (current.length > 0) {
        segments.push({ startRow, rows: current });
        current = [];
      }
      startRow = index + 1;
      return;
    }

    if (current.length === 0) startRow = index;
    current.push({ index, row: trimTrailingEmptyCells(row) });
  });

  if (current.length > 0) {
    segments.push({ startRow, rows: current });
  }

  return segments;
}

function normalizeFieldName(value) {
  const normalized = cellToString(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || '';
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function aliasesForHeader(header) {
  const normalized = normalizeFieldName(header);
  const aliases = [normalized];

  if (cellToString(header) === '#') {
    aliases.push('serial_no', 'sr_no', 's_no', 'line_no', 'number');
  }

  if (normalized === 'qty' || normalized === 'qnty') {
    aliases.push('quantity');
  }

  if (normalized.includes('des') && (normalized.includes('goods') || normalized.includes('services'))) {
    aliases.push('description', 'item_description', 'goods_services');
  }

  if (normalized.includes('description')) {
    aliases.push('description', 'item_description');
  }

  if (normalized.includes('hsn') && normalized.includes('sac')) {
    aliases.push('hsn', 'hsn_sac');
  }

  if (normalized === 'hsn_code' || normalized === 'hsn') {
    aliases.push('hsn');
  }

  if (normalized.includes('sgst') || normalized.includes('tgst')) {
    aliases.push('sgst', 'tax');
  }

  if (normalized.includes('cgst')) {
    aliases.push('cgst');
  }

  if (normalized === 'rev_charge' || normalized === 'reverse_charge') {
    aliases.push('rev_charge', 'reverse_charge');
  }

  if (normalized === 'place_of_supply') {
    aliases.push('place_of_supply');
  }

  if (normalized === 'supply_type') {
    aliases.push('supply_type');
  }

  return unique(aliases);
}

function assignFieldWithAliases(target, header, value) {
  const original = cellToString(header);
  if (!original) return;

  target[original] = value;
  aliasesForHeader(original).forEach((alias) => {
    if (!alias) return;
    target[alias] = value;
  });
}

function buildDataRows(headers, dataRows) {
  return dataRows.map((row) => {
    const rowObj = {};
    headers.forEach((header, index) => {
      assignFieldWithAliases(rowObj, header, row[index] ?? '');
    });
    return rowObj;
  });
}

function normalizeRows(rows) {
  const cleanedRows = rows
    .filter((row) => Array.isArray(row) && row.some((cell) => !isBlankCell(cell)))
    .map(trimTrailingEmptyCells);

  if (cleanedRows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const firstRow = cleanedRows[0];
  const hasHeaderRow = firstRow.every((value) => {
    const normalized = cellToString(value);
    return normalized.length > 0 && isNaN(Number(normalized));
  });

  const headers = hasHeaderRow
    ? firstRow.map((cell, idx) => (cellToString(cell) || `Column_${idx + 1}`))
    : firstRow.map((_, idx) => `Column_${idx + 1}`);

  const dataRows = hasHeaderRow ? cleanedRows.slice(1) : cleanedRows;

  return { headers, dataRows };
}

function extractKeyValueData(segmentRows) {
  const staticData = {};
  const headers = [];

  segmentRows.forEach(({ row }) => {
    const filled = row
      .map((value, index) => ({ value: cellToString(value), index }))
      .filter((cell) => cell.value !== '');

    if (filled.length < 2) return;

    const key = filled[0].value;
    const value = filled
      .slice(1)
      .map((cell) => cell.value)
      .join(' ')
      .trim();

    if (!key || normalizeFieldName(key) === 'field_name') return;

    headers.push(key);
    assignFieldWithAliases(staticData, key, value);
  });

  return { staticData, headers: unique(headers) };
}

function getHeaderCells(row) {
  return row.map((cell, index) => ({
    value: cellToString(cell) || `Column_${index + 1}`,
    index,
  }));
}

function looksLikeTableHeader(row, followingRows) {
  const filled = countFilled(row);
  if (filled < 2 || followingRows.length === 0) return false;

  const enoughFollowingRows = followingRows
    .slice(0, 5)
    .filter(({ row: following }) => countFilled(following) >= Math.max(2, Math.ceil(filled * 0.35)));

  if (enoughFollowingRows.length === 0) return false;

  const textishCells = row.filter((cell) => {
    const value = cellToString(cell);
    return value !== '' && (isNaN(Number(value)) || value === '#');
  }).length;

  return textishCells >= Math.max(1, Math.ceil(filled * 0.5));
}

function detectTableHeaderIndex(segmentRows, preferTabular = false) {
  const maxFilled = Math.max(...segmentRows.map(({ row }) => countFilled(row)), 0);

  if (maxFilled <= 2 && !preferTabular) {
    return -1;
  }

  let best = { index: -1, score: -Infinity };

  segmentRows.forEach((entry, index) => {
    const following = segmentRows.slice(index + 1);
    if (!looksLikeTableHeader(entry.row, following)) return;

    const filled = countFilled(entry.row);
    const score =
      filled * 3 +
      following.slice(0, 5).reduce((sum, next) => sum + countFilled(next.row), 0) -
      index;

    if (score > best.score) {
      best = { index, score };
    }
  });

  return best.index;
}

function buildTableSection(segmentRows, headerIndex, sectionIndex) {
  const headerEntry = segmentRows[headerIndex];
  const headerCells = getHeaderCells(headerEntry.row);
  const lastHeaderIndex = headerCells.reduce(
    (max, cell) => (cell.value ? Math.max(max, cell.index) : max),
    0
  );
  const headers = [];

  for (let index = 0; index <= lastHeaderIndex; index += 1) {
    headers.push(cellToString(headerEntry.row[index]) || `Column_${index + 1}`);
  }

  const rawRows = segmentRows
    .slice(headerIndex + 1)
    .map(({ row }) => headers.map((_, index) => cellToString(row[index])))
    .filter((row) => countFilled(row) > 0);

  const rows = buildDataRows(headers, rawRows);

  return {
    id: sectionIndex === 0 ? 'line_items' : `table_${sectionIndex + 1}`,
    kind: 'table',
    label: sectionIndex === 0 ? 'Line items' : `Table ${sectionIndex + 1}`,
    rowStart: headerEntry.index + 1,
    rowEnd: segmentRows[segmentRows.length - 1]?.index + 1,
    headers,
    rows,
  };
}

function mergeStaticData(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    target[key] = value;
  });
}

function normalizeParsedRows(rows, options = {}) {
  const normalizedRows = Array.isArray(rows) ? rows.map((row) => (Array.isArray(row) ? row : [])) : [];
  const segments = splitRowsIntoSegments(normalizedRows);
  const staticData = {};
  const staticHeaders = [];
  const tableSections = [];

  segments.forEach((segment) => {
    if (segment.rows.length === 0) return;

    const headerIndex = detectTableHeaderIndex(segment.rows, options.preferTabular);

    if (headerIndex === -1) {
      const kv = extractKeyValueData(segment.rows);
      mergeStaticData(staticData, kv.staticData);
      staticHeaders.push(...kv.headers);
      return;
    }

    if (headerIndex > 0) {
      const kv = extractKeyValueData(segment.rows.slice(0, headerIndex));
      mergeStaticData(staticData, kv.staticData);
      staticHeaders.push(...kv.headers);
    }

    const table = buildTableSection(segment.rows, headerIndex, tableSections.length);
    if (table.headers.length > 0 && table.rows.length > 0) {
      tableSections.push(table);
    }
  });

  if (tableSections.length === 0 && Object.keys(staticData).length === 0) {
    const { headers, dataRows } = normalizeRows(rows);
    const fallbackRows = buildDataRows(headers, dataRows);
    tableSections.push({
      id: 'line_items',
      kind: 'table',
      label: 'Rows',
      rowStart: 1,
      rowEnd: dataRows.length + 1,
      headers,
      rows: fallbackRows,
    });
  }

  const primaryTable = tableSections[0] || null;
  const tableRows = primaryTable?.rows || [];
  const tableHeaders = primaryTable?.headers || [];
  const collections = {};

  tableSections.forEach((section) => {
    collections[section.id] = section.rows;
  });

  if (tableRows.length > 0) {
    collections.line_items = tableRows;
    collections.items = tableRows;
    collections.tableRows = tableRows;
  }

  const rootData = {
    ...staticData,
    ...collections,
  };

  const rowsForPreview = Object.keys(staticData).length > 0
    ? [rootData]
    : tableRows;

  return {
    headers: unique([...staticHeaders, ...tableHeaders]),
    rows: rowsForPreview,
    staticHeaders: unique(staticHeaders),
    staticData,
    tableHeaders,
    tableRows,
    collections,
    sections: [
      ...(staticHeaders.length > 0
        ? [{
            id: 'static',
            kind: 'keyValue',
            label: 'Static fields',
            headers: unique(staticHeaders),
            rowCount: Object.keys(staticData).length,
          }]
        : []),
      ...tableSections.map((section) => ({
        id: section.id,
        kind: section.kind,
        label: section.label,
        headers: section.headers,
        rowCount: section.rows.length,
        rowStart: section.rowStart,
        rowEnd: section.rowEnd,
      })),
    ],
  };
}

function rowsFromObjects(objects) {
  const headers = unique(objects.flatMap((row) => Object.keys(row || {})));
  const rows = objects.map((row) => {
    const normalized = {};
    headers.forEach((header) => {
      assignFieldWithAliases(normalized, header, row?.[header] ?? '');
    });
    return normalized;
  });
  return { headers, rows };
}

function normalizeJsonData(data) {
  if (Array.isArray(data)) {
    const objects = data.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
    const { headers, rows } = rowsFromObjects(objects);
    return {
      headers,
      rows,
      staticHeaders: [],
      staticData: {},
      tableHeaders: headers,
      tableRows: rows,
      collections: {
        line_items: rows,
        items: rows,
        tableRows: rows,
      },
      sections: [{
        id: 'line_items',
        kind: 'table',
        label: 'Rows',
        headers,
        rowCount: rows.length,
      }],
    };
  }

  if (!data || typeof data !== 'object') {
    return {
      headers: [],
      rows: [],
      staticHeaders: [],
      staticData: {},
      tableHeaders: [],
      tableRows: [],
      collections: {},
      sections: [],
    };
  }

  const staticData = {};
  const staticHeaders = [];
  const collections = {};

  Object.entries(data).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const objects = value.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
      const { rows } = rowsFromObjects(objects);
      collections[key] = rows;
      return;
    }

    if (value && typeof value === 'object') {
      if (key === 'staticData' || key === 'metadata') {
        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          if (Array.isArray(nestedValue) || (nestedValue && typeof nestedValue === 'object')) return;
          staticHeaders.push(nestedKey);
          assignFieldWithAliases(staticData, nestedKey, nestedValue ?? '');
        });
        return;
      }

      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        if (Array.isArray(nestedValue) || (nestedValue && typeof nestedValue === 'object')) return;
        const path = `${key}.${nestedKey}`;
        staticHeaders.push(path);
        staticData[path] = nestedValue ?? '';
      });
      return;
    }

    staticHeaders.push(key);
    assignFieldWithAliases(staticData, key, value ?? '');
  });

  const explicitRows = Array.isArray(data.tableRows)
    ? data.tableRows
    : Array.isArray(data.rows)
      ? data.rows
      : Array.isArray(data.line_items)
        ? data.line_items
        : Array.isArray(data.items)
          ? data.items
          : null;
  const firstCollectionRows = explicitRows || Object.values(collections)[0] || [];
  const tableObjects = firstCollectionRows.filter((row) => row && typeof row === 'object' && !Array.isArray(row));
  const { headers: tableHeaders, rows: tableRows } = rowsFromObjects(tableObjects);

  if (tableRows.length > 0) {
    collections.line_items = tableRows;
    collections.items = tableRows;
    collections.tableRows = tableRows;
  }

  const rootData = {
    ...staticData,
    ...collections,
  };

  return {
    headers: unique([...staticHeaders, ...tableHeaders]),
    rows: Object.keys(staticData).length > 0 ? [rootData] : tableRows,
    staticHeaders: unique(staticHeaders),
    staticData,
    tableHeaders,
    tableRows,
    collections,
    sections: [
      ...(staticHeaders.length > 0
        ? [{
            id: 'static',
            kind: 'keyValue',
            label: 'Static fields',
            headers: unique(staticHeaders),
            rowCount: staticHeaders.length,
          }]
        : []),
      ...(tableRows.length > 0
        ? [{
            id: 'line_items',
            kind: 'table',
            label: 'Rows',
            headers: tableHeaders,
            rowCount: tableRows.length,
          }]
        : []),
    ],
  };
}

function replacePlaceholders(text, data, fieldMapping = {}) {
  if (typeof text !== 'string') {
    return text;
  }

  return text.replace(/\{\{([^}]+)\}\}/g, (match, placeholder) => {
    const key = placeholder.trim();
    const dataKey = fieldMapping[key] || key;
    const value = getNestedValue(data, dataKey);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

function getNestedValue(obj, path) {
  if (!path || typeof path !== 'string') return undefined;
  const keys = path.split('.');
  let v = obj;
  for (let i = 0; i < keys.length; i += 1) {
    if (v == null) return undefined;
    v = v[keys[i]];
  }
  return v;
}

function getCollectionFromKey(root, key) {
  const v = getNestedValue(root, key);
  return Array.isArray(v) ? v : null;
}

function resolveLayoutTableCell(cell, rootRow, fieldMapping, itemRow, defaultScope) {
  const scope = (cell.binding && cell.binding.scope) || defaultScope || 'root';
  const ctx = scope === 'item' ? itemRow || {} : rootRow || {};

  if (cell.binding && cell.binding.path) {
    const resolved = getNestedValue(ctx, cell.binding.path);
    if (resolved !== undefined && resolved !== null) return String(resolved);
    if (cell.binding.fallback != null && String(cell.binding.fallback) !== '') {
      return String(cell.binding.fallback);
    }
  }
  const raw = cell.content && cell.content.value != null ? String(cell.content.value) : '';
  return raw.replace(/\{\{([^}]+)\}\}/g, (match, placeholder) => {
    const key = placeholder.trim();
    const dataKey = fieldMapping[key] || key;
    const value = getNestedValue(ctx, dataKey);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLayoutTable(element) {
  const x = element.position?.x ?? 0;
  const y = element.position?.y ?? 0;
  const cols = element.columns || [];
  const rows = element.rows || [];
  const st = element.style || {};
  const borderW = st.borderWidth != null ? Number(st.borderWidth) : 1;
  const borderC = st.borderColor || '#d1d5db';
  const defaultFontSize = st.fontSize || 14;
  const defaultFont = st.fontWeight || 'normal';
  const defaultColor = st.color || '#111';
  const defaultFamily = st.fontFamily || 'Arial,sans-serif';
  const colgroup = cols.map((c) => `<col style="width:${c.width}px" />`).join('');
  const headerRow = element.headerRow;
  const thead =
    headerRow && headerRow.cells
      ? `<thead><tr>${headerRow.cells
          .map((cell, idx) => {
            if (cell.mergedInto) return '';
            const cs = cell.style || {};
            const align = cs.textAlign || (cols[idx] && cols[idx].alignment) || 'left';
            const fs = cs.fontSize != null ? cs.fontSize : Math.max(10, defaultFontSize - 1);
            const fw = cs.fontWeight || 'bold';
            const fst = cs.fontStyle || 'normal';
            const td = cs.textDecoration || 'none';
            const col = cs.color || defaultColor;
            const ff = cs.fontFamily || defaultFamily;
            const bg = cs.backgroundColor ? `background-color:${escapeHtml(cs.backgroundColor)};` : 'background:#f3f4f6;';
            const rs = cell.span && cell.span.rowSpan > 1 ? ` rowspan="${cell.span.rowSpan}"` : '';
            const clsp = cell.span && cell.span.colSpan > 1 ? ` colspan="${cell.span.colSpan}"` : '';
            const text = escapeHtml(cell.content && cell.content.value != null ? cell.content.value : '');
            return `<th${rs}${clsp} style="padding:6px 8px;border:1px solid ${escapeHtml(
              borderC
            )};text-align:${align};font-size:${fs}px;font-weight:${fw};font-style:${fst};text-decoration:${td};color:${escapeHtml(
              col
            )};font-family:${escapeHtml(ff)};${bg}">${text}</th>`;
          })
          .join('')}</tr></thead>`
      : '';
  const body = rows
    .map((row) => {
      const tds = (row.cells || [])
        .map((cell, idx) => {
          if (cell.mergedInto) return '';
          const cs = cell.style || {};
          const align = cs.textAlign || (cols[idx] && cols[idx].alignment) || 'left';
          const fs = cs.fontSize != null ? cs.fontSize : defaultFontSize;
          const fw = cs.fontWeight || defaultFont;
          const fst = cs.fontStyle || 'normal';
          const td = cs.textDecoration || 'none';
          const col = cs.color || defaultColor;
          const ff = cs.fontFamily || defaultFamily;
          const bg = cs.backgroundColor ? `background-color:${escapeHtml(cs.backgroundColor)};` : '';
          const rs = cell.span && cell.span.rowSpan > 1 ? ` rowspan="${cell.span.rowSpan}"` : '';
          const clsp = cell.span && cell.span.colSpan > 1 ? ` colspan="${cell.span.colSpan}"` : '';
          const text = escapeHtml(cell.content && cell.content.value != null ? cell.content.value : '');
          return `<td${rs}${clsp} style="padding:4px 8px;border:1px solid ${escapeHtml(
            borderC
          )};text-align:${align};font-size:${fs}px;font-weight:${fw};font-style:${fst};text-decoration:${td};color:${escapeHtml(
            col
          )};font-family:${escapeHtml(ff)};${bg}">${text}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  const tableBorder =
    borderW > 0
      ? `border:${borderW}px solid ${escapeHtml(borderC)};border-collapse:collapse;`
      : 'border-collapse:collapse;';
  const baseFont = `font-size:${defaultFontSize}px;font-family:${escapeHtml(defaultFamily)};color:${escapeHtml(defaultColor)};`;
  return `<table style="position:absolute;left:${x}px;top:${y}px;${tableBorder}${baseFont}"><colgroup>${colgroup}</colgroup>${thead}<tbody>${body}</tbody></table>`;
}

// Helper to build common style attribute for elements that use the common style set
function getCommonStyleAttr(element) {
  const styles = [];
  if (element.position) {
    const { x, y } = element.position;
    styles.push(`position:absolute`, `left:${x}px`, `top:${y}px`);
  }
  if (element.style) {
    const s = element.style;
    if (s.width) styles.push(`width:${s.width}px`);
    if (s.height) styles.push(`height:${s.height}px`);
    if (s.color) styles.push(`color:${s.color}`);
    if (s.fontSize) styles.push(`font-size:${s.fontSize}px`);
    if (s.fontWeight) styles.push(`font-weight:${s.fontWeight}`);
    if (s.fontFamily) styles.push(`font-family:${s.fontFamily}`);
    if (s.backgroundColor) styles.push(`background-color:${s.backgroundColor}`);
    if (s.borderColor && s.borderWidth !== undefined) {
      styles.push(`border:${s.borderWidth}px solid ${s.borderColor}`);
    }
    if (s.textAlign) styles.push(`text-align:${s.textAlign}`);
    if (s.lineHeight) styles.push(`line-height:${s.lineHeight}px`);
    if (s.borderRadius) styles.push(`border-radius:${s.borderRadius}px`);
    if (s.opacity !== undefined) {
      const opacity = Number(s.opacity);
      if (!Number.isNaN(opacity)) {
        styles.push(`opacity:${opacity / 100}`);
      }
    }
  }
  return `style="${styles.join(';')}"`;
}

// Renderer functions
function renderText(element) {
  const styleAttr = getCommonStyleAttr(element);
  return `<div ${styleAttr}>${element.content || ''}</div>`;
}

function renderParagraph(element) {
  return renderText(element); // same as text
}

function renderImage(element) {
  const width = element.style?.width ? `width:${element.style.width}px;` : '';
  const height = element.style?.height ? `height:${element.style.height}px;` : '';
  const objectFit = element.style?.objectFit ? `object-fit:${element.style.objectFit};` : '';
  return `<img src="${element.src || ''}" alt="" style="position:absolute;left:${element.position?.x}px;top:${element.position?.y}px;${width}${height}${objectFit};" />`;
}

function renderLine(element) {
  const { color = '#000', thickness = 1, style: lineStyle = 'solid', length = 100, direction = 'horizontal' } = element.style || {};
  const { x = 0, y = 0 } = element.position || {};

  const isVertical = direction === 'vertical';

  const svgW = isVertical ? thickness : length;
  const svgH = isVertical ? length : thickness;

  let dashArray = 'none';

  if (lineStyle === 'dashed') {
    dashArray = '6,4'; // dash length, gap
  } else if (lineStyle === 'dotted') {
    dashArray = '2,3';
  }

  const svg = `
    <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
      <line
        x1="${isVertical ? svgW / 2 : 0}"
        y1="${isVertical ? 0 : svgH / 2}"
        x2="${isVertical ? svgW / 2 : svgW}"
        y2="${isVertical ? svgH : svgH / 2}"
        stroke="${color}"
        stroke-width="${thickness}"
        ${dashArray !== 'none' ? `stroke-dasharray="${dashArray}"` : ''}
        stroke-linecap="round"
      />
    </svg>
  `;

  return `<div style="position:absolute; left:${x}px; top:${y}px;">${svg}</div>`;
}

function renderBox(element) {
  const styleAttr = getCommonStyleAttr(element);
  return `<div ${styleAttr}></div>`;
}

function renderRadio(element) {
  const styleAttr = getCommonStyleAttr(element);
  const optionsHtml = new Array(element.options || 2)
    .fill(0)
    .map((_, idx) => `<div>${element.selected === String(idx) ? '◉' : '○'} Option ${idx + 1}</div>`)
    .join('');
  return `<div ${styleAttr}>${optionsHtml}</div>`;
}

function renderCheckbox(element) {
  const styleAttr = getCommonStyleAttr(element);
  const items = new Array(element.count || 1)
    .fill(0)
    .map((_, idx) => `<div>${(element.checkedValues || []).includes(String(idx)) ? '☑' : '☐'} Item ${idx + 1}</div>`)
    .join('');
  return `<div ${styleAttr}>${items}</div>`;
}

function renderDate(element) {
  const styleAttr = getCommonStyleAttr(element);
  return `<div ${styleAttr}>${element.value || ''}${element.time ? ' ' + element.time : ''}</div>`;
}

function renderDefault(element) {
  const styleAttr = getCommonStyleAttr(element);
  return `<div ${styleAttr}></div>`;
}

// Map of element types to renderer functions
const renderers = {
  text: renderText,
  paragraph: renderParagraph,
  image: renderImage,
  line: renderLine,
  box: renderBox,
  table: renderLayoutTable,
  radio: renderRadio,
  checkbox: renderCheckbox,
  date: renderDate,
};

// Main render function: delegates to the appropriate renderer
function renderElement(element, dataRow, fieldMapping) {
  const renderer = renderers[element.type];
  if (renderer) {
    return renderer(element, dataRow, fieldMapping);
  }
  return renderDefault(element);
}

function getMappingGroup(fieldMapping, tableFieldMapping) {
  const isGrouped =
    fieldMapping &&
    typeof fieldMapping === 'object' &&
    (typeof fieldMapping.static === 'object' || typeof fieldMapping.table === 'object');

  if (!isGrouped) {
    return {
      staticFieldMapping: fieldMapping || {},
      tableFieldMapping: tableFieldMapping || fieldMapping || {},
    };
  }

  return {
    staticFieldMapping: fieldMapping.static || {},
    tableFieldMapping: tableFieldMapping || fieldMapping.table || fieldMapping.static || {},
  };
}

function normalizeRenderContext(dataInput, fieldMapping = {}, tableFieldMapping) {
  const { staticFieldMapping, tableFieldMapping: resolvedTableMapping } =
    getMappingGroup(fieldMapping, tableFieldMapping);

  if (
    dataInput &&
    !Array.isArray(dataInput) &&
    typeof dataInput === 'object' &&
    (
      Object.prototype.hasOwnProperty.call(dataInput, 'staticData') ||
      Object.prototype.hasOwnProperty.call(dataInput, 'tableRows') ||
      Object.prototype.hasOwnProperty.call(dataInput, 'collections') ||
      Object.prototype.hasOwnProperty.call(dataInput, 'dataRows')
    )
  ) {
    const dataRows = Array.isArray(dataInput.dataRows)
      ? dataInput.dataRows
      : dataInput.dataRows && typeof dataInput.dataRows === 'object'
        ? [dataInput.dataRows]
        : Array.isArray(dataInput.rows)
          ? dataInput.rows
          : dataInput.rows && typeof dataInput.rows === 'object'
            ? [dataInput.rows]
            : [];
    const providedStaticData =
      dataInput.staticData && typeof dataInput.staticData === 'object'
        ? dataInput.staticData
        : null;
    const staticData =
      providedStaticData && Object.keys(providedStaticData).length > 0
        ? providedStaticData
        : dataRows[0] || {};
    const tableRows = Array.isArray(dataInput.tableRows)
      ? dataInput.tableRows
      : dataRows;
    const collections =
      dataInput.collections && typeof dataInput.collections === 'object'
        ? { ...dataInput.collections }
        : {};

    if (tableRows.length > 0) {
      collections.line_items = collections.line_items || tableRows;
      collections.items = collections.items || tableRows;
      collections.tableRows = collections.tableRows || tableRows;
    }

    const rootData = {
      ...staticData,
      ...collections,
    };

    return {
      dataRows: dataRows.length > 0 ? dataRows : [rootData],
      staticData: rootData,
      tableRows,
      collections,
      staticFieldMapping,
      tableFieldMapping: resolvedTableMapping,
    };
  }

  const dataRows = Array.isArray(dataInput) && dataInput.length > 0 ? dataInput : [{}];
  const tableRows = dataRows;
  const collections = {
    line_items: tableRows,
    items: tableRows,
    tableRows,
  };
  const rootData = {
    ...(dataRows[0] || {}),
    ...collections,
  };

  return {
    dataRows,
    staticData: rootData,
    tableRows,
    collections,
    staticFieldMapping,
    tableFieldMapping: resolvedTableMapping,
  };
}

function rowsForTable(tableElement, context) {
  const collectionKey = tableElement.binding?.enabled ? tableElement.binding.collectionKey : '';
  if (collectionKey) {
    const boundCollection =
      getCollectionFromKey(context.staticData, collectionKey) ||
      context.collections[collectionKey];
    if (Array.isArray(boundCollection) && boundCollection.length > 0) {
      return boundCollection;
    }
  }

  if (Array.isArray(context.tableRows) && context.tableRows.length > 0) {
    return context.tableRows;
  }

  if (Array.isArray(context.dataRows) && context.dataRows.length > 0) {
    return context.dataRows;
  }

  return [{}];
}

function cloneWithStaticData(element, context) {
  const cloned = JSON.parse(JSON.stringify(element));
  if (cloned.type === 'text' || cloned.type === 'paragraph') {
    cloned.content = replacePlaceholders(
      cloned.content,
      context.staticData,
      context.staticFieldMapping
    );
  }
  if (cloned.type === 'image') {
    cloned.src = replacePlaceholders(cloned.src, context.staticData, context.staticFieldMapping);
  }
  if (cloned.type === 'date') {
    cloned.value = replacePlaceholders(cloned.value || '', context.staticData, context.staticFieldMapping);
    cloned.time = replacePlaceholders(cloned.time || '', context.staticData, context.staticFieldMapping);
  }
  return cloned;
}

function renderTemplateHtmlMultiRow(templateElements, dataInput, fieldMapping = {}, tableFieldMapping) {
  const context = normalizeRenderContext(dataInput, fieldMapping, tableFieldMapping);
  const nonTableElements = templateElements.filter(el => el.type !== 'table');
  const tableElements = templateElements
    .filter(el => el.type === 'table' && el.schemaVersion === 2)
    .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0));

  const staticHtml = nonTableElements
    .map(el => renderElement(cloneWithStaticData(el, context), context.staticData, context.staticFieldMapping))
    .join('');

  const tableHtml = tableElements.map(table => renderExpandedTable(table, context)).join('');

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        @page { size: A4; margin: 20px; }
        body { 
          margin: 0; 
          padding: 0; 
          font-family: Arial, sans-serif; 
          width: 210mm;
        }
        .document-root {
          position: relative;
          width: 100%;
          min-height: 297mm;
        }
        .static-layer {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          min-height: 297mm;
          z-index: 2;
          pointer-events: none;
        }
        .table-layer {
          position: relative;
          z-index: 1;
          width: 100%;
          box-sizing: border-box;
          min-height: 297mm;
        }
        .expanded-table-wrap {
          position: relative;
          box-sizing: border-box;
          break-inside: auto;
          page-break-inside: auto;
        }
        table { border-collapse: collapse; width: 100%; }
        thead { display: table-header-group; }
        tr { break-inside: avoid; page-break-inside: avoid; }
        td, th { word-break: break-word; }
      </style>
    </head>
    <body>
      <div class="document-root">
        <div class="table-layer">${tableHtml}</div>
        <div class="static-layer">${staticHtml}</div>
      </div>
    </body>
  </html>`;
}

function renderExpandedTable(tableElement, context) {
  const cols = tableElement.columns || [];
  const st = tableElement.style || {};
  const borderW = st.borderWidth != null ? Number(st.borderWidth) : 1;
  const borderC = st.borderColor || '#d1d5db';
  const defaultFontSize = st.fontSize || 13;
  const defaultFont = st.fontWeight || 'normal';
  const defaultColor = st.color || '#111827';
  const defaultFamily = st.fontFamily || 'Arial, sans-serif';
  const x = tableElement.position?.x || 0;
  const y = tableElement.position?.y || 0;
  const width =
    tableElement.size?.width ||
    cols.reduce((sum, col) => sum + (Number(col.width) || 0), 0) ||
    640;

  const colgroup = cols.map(c => `<col style="width:${c.width}px" />`).join('');
  const tableBorder = borderW > 0
    ? `border:${borderW}px solid ${escapeHtml(borderC)};border-collapse:collapse;`
    : 'border-collapse:collapse;';
  const baseFont = `font-size:${defaultFontSize}px;font-family:${escapeHtml(defaultFamily)};color:${escapeHtml(defaultColor)};font-weight:${defaultFont};`;

  // Render header row once
  const headerRow = tableElement.headerRow;
  const thead = headerRow && headerRow.cells
    ? `<thead><tr>${headerRow.cells.map((cell, idx) => {
        if (cell.mergedInto) return '';
        const cs = cell.style || {};
        const align = cs.textAlign || (cols[idx] && cols[idx].alignment) || 'left';
        const fs = cs.fontSize != null ? cs.fontSize : defaultFontSize;
        const fw = cs.fontWeight || 'bold';
        const bg = cs.backgroundColor
          ? `background-color:${escapeHtml(cs.backgroundColor)};`
          : 'background:#f3f4f6;';
        const rs = cell.span && cell.span.rowSpan > 1 ? ` rowspan="${cell.span.rowSpan}"` : '';
        const clsp = cell.span && cell.span.colSpan > 1 ? ` colspan="${cell.span.colSpan}"` : '';
        const text = escapeHtml(
          replacePlaceholders(cell.content?.value ?? '', context.staticData, context.staticFieldMapping)
        );
        return `<th${rs}${clsp} style="padding:6px 8px;border:1px solid ${escapeHtml(borderC)};text-align:${align};font-size:${fs}px;font-weight:${fw};${bg}">${text}</th>`;
      }).join('')}</tr></thead>`
    : '';

  // Expand template rows × all data rows
  const templateRows = tableElement.rows || [];
  const itemRows = rowsForTable(tableElement, context);
  const allExpandedRows = itemRows.flatMap(itemRow => {
    return templateRows.map(templateRow => {
      const tds = (templateRow.cells || []).map((cell, idx) => {
        if (cell.mergedInto) return '';
        const cs = cell.style || {};
        const align = cs.textAlign || (cols[idx] && cols[idx].alignment) || 'left';
        const fs = cs.fontSize != null ? cs.fontSize : defaultFontSize;
        const fw = cs.fontWeight || defaultFont;
        const bg = cs.backgroundColor
          ? `background-color:${escapeHtml(cs.backgroundColor)};`
          : '';
        const rs = cell.span && cell.span.rowSpan > 1 ? ` rowspan="${cell.span.rowSpan}"` : '';
        const clsp = cell.span && cell.span.colSpan > 1 ? ` colspan="${cell.span.colSpan}"` : '';

        // Resolve cell value — binding path takes priority over placeholder text
        let cellValue = '';
        if (cell.binding && cell.binding.path) {
          const ctx = cell.binding.scope === 'root' ? context.staticData : itemRow;
          const resolved = getNestedValue(
            ctx,
            cell.binding.path
          );
          cellValue = resolved !== undefined && resolved !== null
            ? String(resolved)
            : (cell.binding.fallback != null ? String(cell.binding.fallback) : '');
        } else {
          const raw = cell.content?.value ?? '';
          cellValue = replacePlaceholders(raw, itemRow, context.tableFieldMapping);
        }

        return `<td${rs}${clsp} style="padding:4px 8px;border:1px solid ${escapeHtml(borderC)};text-align:${align};font-size:${fs}px;font-weight:${fw};${bg}">${escapeHtml(cellValue)}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    });
  });

  return `<div class="expanded-table-wrap" style="margin-left:${x}px;margin-top:${y}px;width:${width}px;"><table style="${tableBorder}${baseFont}width:100%;"><colgroup>${colgroup}</colgroup>${thead}<tbody>${allExpandedRows.join('')}</tbody></table></div>`;
}

app.post('/parse-data', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File is required.' });
  }

  try {
    const originalName = req.file.originalname || '';
    const isJson =
      req.file.mimetype === 'application/json' ||
      originalName.toLowerCase().endsWith('.json');
    const isCsv =
      req.file.mimetype === 'text/csv' ||
      originalName.toLowerCase().endsWith('.csv');

    if (isJson) {
      const parsed = JSON.parse(req.file.buffer.toString('utf8'));
      const normalized = normalizeJsonData(parsed);

      if (normalized.headers.length === 0 && normalized.rows.length === 0) {
        return res.status(400).json({ error: 'No usable data found in JSON file.' });
      }

      return res.json({
        ...normalized,
        fileName: req.file.originalname,
        fileType: 'json',
      });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return res.status(400).json({ error: 'No worksheet found in file.' });
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: true, defval: '' });
    const normalized = normalizeParsedRows(rows, { preferTabular: isCsv });

    if (normalized.headers.length === 0) {
      return res.status(400).json({ error: 'No rows found in file.' });
    }

    return res.json({
      ...normalized,
      fileName: req.file.originalname,
      fileType: isCsv ? 'csv' : 'excel',
    });
  } catch (error) {
    console.error('Data parse error:', error);
    return res.status(500).json({ error: 'Unable to parse file.' });
  }
});

app.post('/generate-pdf', async (req, res) => {
  const {
    templateElements,
    dataRow,
    fieldMapping = {},
    tableFieldMapping,
    staticData,
    tableRows,
    collections,
    outputFileName,
  } = req.body;

  if (!templateElements || !Array.isArray(templateElements) || !dataRow) {
    return res.status(400).json({ error: 'templateElements and dataRow are required.' });
  }

  try {
    const html = renderTemplateHtmlMultiRow(
      templateElements,
      { dataRows: dataRow, staticData, tableRows, collections },
      fieldMapping,
      tableFieldMapping
    );
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// Replace or add alongside existing endpoint
app.post('/generate-document', async (req, res) => {
  const {
    templateElements,
    dataRows,
    staticData,
    tableRows,
    collections,
    fieldMapping = {},
    tableFieldMapping,
    outputFileName,
  } = req.body;

  if (!templateElements || !Array.isArray(templateElements)) {
    return res.status(400).json({ error: 'templateElements is required.' });
  }

  // dataRows can be empty array for template-only export. staticData/tableRows
  // are the normalized shape used for mixed-format sources.
  const rows = Array.isArray(dataRows) && dataRows.length > 0 ? dataRows : [{}];

  try {
    const html = renderTemplateHtmlMultiRow(
      templateElements,
      { dataRows: rows, staticData, tableRows, collections },
      fieldMapping,
      tableFieldMapping
    );

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Document generation error:', error);
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
