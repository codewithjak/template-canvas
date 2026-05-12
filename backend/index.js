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

function normalizeRows(rows) {
  const cleanedRows = rows
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''))
    .map((row) => row.map((cell) => String(cell ?? '').trim()));

  if (cleanedRows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const firstRow = cleanedRows[0];
  const hasHeaderRow = firstRow.every((value) => {
    const normalized = String(value).trim();
    return normalized.length > 0 && isNaN(Number(normalized));
  });

  const headers = hasHeaderRow
    ? firstRow.map((cell, idx) => (String(cell).trim() || `Column_${idx + 1}`))
    : firstRow.map((_, idx) => `Column_${idx + 1}`);

  const dataRows = hasHeaderRow ? cleanedRows.slice(1) : cleanedRows;

  return { headers, dataRows };
}

function buildDataRows(headers, dataRows) {
  return dataRows.map((row) => {
    const rowObj = {};
    headers.forEach((header, index) => {
      rowObj[header] = row[index] ?? '';
    });
    return rowObj;
  });
}

function replacePlaceholders(text, data, fieldMapping = {}) {
  if (typeof text !== 'string') {
    return text;
  }

  return text.replace(/\{\{([^}]+)\}\}/g, (match, placeholder) => {
    const key = placeholder.trim();
    const dataKey = fieldMapping[key] || key;
    const value = data[dataKey];
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

function renderTemplateHtml(templateElements, dataRow, fieldMapping = {}) {
  const mappedElements = templateElements.map((element) => {
    const cloned = JSON.parse(JSON.stringify(element));

    if (cloned.type === 'text' || cloned.type === 'paragraph') {
      cloned.content = replacePlaceholders(cloned.content, dataRow, fieldMapping);
    }

    if (cloned.type === 'image') {
      cloned.src = replacePlaceholders(cloned.src, dataRow, fieldMapping);
    }

    if (cloned.type === 'table' && cloned.schemaVersion === 2 && Array.isArray(cloned.rows)) {
      if (cloned.headerRow && Array.isArray(cloned.headerRow.cells)) {
        cloned.headerRow = {
          ...cloned.headerRow,
          cells: cloned.headerRow.cells.map((cell) =>
            cell.mergedInto
              ? cell
              : {
                  ...cell,
                  content: {
                    type: 'text',
                    value: resolveLayoutTableCell(cell, dataRow, fieldMapping, null, 'root'),
                  },
                  binding: undefined,
                }
          ),
        };
      }

      const tableBinding = cloned.binding || {};
      const collection =
        tableBinding.enabled && tableBinding.collectionKey
          ? getCollectionFromKey(dataRow, tableBinding.collectionKey)
          : null;

      if (collection && collection.length > 0) {
        const templateRows = cloned.rows;
        cloned.rows = collection.flatMap((item) =>
          templateRows.map((row) => ({
            ...row,
            cells: (row.cells || []).map((cell) =>
              cell.mergedInto
                ? cell
                : {
                    ...cell,
                    content: {
                      type: 'text',
                      value: resolveLayoutTableCell(cell, dataRow, fieldMapping, item, 'item'),
                    },
                    binding: undefined,
                  }
            ),
          }))
        );
      } else {
        cloned.rows = cloned.rows.map((row) => ({
          ...row,
          cells: (row.cells || []).map((cell) =>
            cell.mergedInto
              ? cell
              : {
                  ...cell,
                  content: {
                    type: 'text',
                    value: resolveLayoutTableCell(cell, dataRow, fieldMapping, null, 'root'),
                  },
                  binding: undefined,
                }
          ),
        }));
      }
    }

    return cloned;
  });

  const bodyHtml = mappedElements.map((el) => renderElement(el, dataRow, fieldMapping)).join('');

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <style>
        body { margin: 0; padding: 0; font-family: Arial, sans-serif; position: relative; width: 210mm; min-height: 297mm; }
        table { border-collapse: collapse; }
        td { word-break: break-word; }
      </style>
    </head>
    <body>
      ${bodyHtml}
    </body>
  </html>`;
}

app.post('/parse-data', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File is required.' });
  }

  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', raw: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      return res.status(400).json({ error: 'No worksheet found in file.' });
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });
    const { headers, dataRows } = normalizeRows(rows);

    if (headers.length === 0) {
      return res.status(400).json({ error: 'No rows found in file.' });
    }

    return res.json({
      headers,
      rows: buildDataRows(headers, dataRows),
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
    });
  } catch (error) {
    console.error('Data parse error:', error);
    return res.status(500).json({ error: 'Unable to parse file.' });
  }
});

app.post('/generate-pdf', async (req, res) => {
  const { templateElements, dataRow, fieldMapping = {}, outputFileName } = req.body;

  if (!templateElements || !Array.isArray(templateElements) || !dataRow) {
    return res.status(400).json({ error: 'templateElements and dataRow are required.' });
  }

  try {
    const html = renderTemplateHtml(templateElements, dataRow, fieldMapping);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});