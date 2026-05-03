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

function renderElement(element) {
  const commonStyles = [];
  if (element.position) {
    const { x, y } = element.position;
    commonStyles.push(`position:absolute`, `left:${x}px`, `top:${y}px`);
  }

  if (element.style) {
    if (element.style.width) commonStyles.push(`width:${element.style.width}px`);
    if (element.style.height) commonStyles.push(`height:${element.style.height}px`);
    if (element.style.color) commonStyles.push(`color:${element.style.color}`);
    if (element.style.fontSize) commonStyles.push(`font-size:${element.style.fontSize}px`);
    if (element.style.fontWeight) commonStyles.push(`font-weight:${element.style.fontWeight}`);
    if (element.style.fontFamily) commonStyles.push(`font-family:${element.style.fontFamily}`);
    if (element.style.backgroundColor) commonStyles.push(`background-color:${element.style.backgroundColor}`);
    if (element.style.borderColor && element.style.borderWidth !== undefined) {
      commonStyles.push(`border:${element.style.borderWidth}px solid ${element.style.borderColor}`);
    }
    if (element.style.textAlign) commonStyles.push(`text-align:${element.style.textAlign}`);
    if (element.style.lineHeight) commonStyles.push(`line-height:${element.style.lineHeight}px`);
    if (element.style.borderRadius) commonStyles.push(`border-radius:${element.style.borderRadius}px`);
    if (element.style.opacity !== undefined) {
      const opacity = Number(element.style.opacity);
      if (!Number.isNaN(opacity)) {
        commonStyles.push(`opacity:${opacity / 100}`);
      }
    }
  }

  const styleAttr = `style="${commonStyles.join(';')}"`;

  switch (element.type) {
    case 'text':
      return `<div ${styleAttr}>${element.content || ''}</div>`;
    case 'paragraph':
      return `<div ${styleAttr}>${element.content || ''}</div>`;
    case 'image': {
      const width = element.style?.width ? `width:${element.style.width}px;` : '';
      const height = element.style?.height ? `height:${element.style.height}px;` : '';
      const objectFit = element.style?.objectFit ? `object-fit:${element.style.objectFit};` : '';
      return `<img src="${element.src || ''}" alt="" style="position:absolute;left:${element.position?.x}px;top:${element.position?.y}px;${width}${height}${objectFit};" />`;
    }
    case 'line': {
      const width = element.style?.direction === 'vertical' ? '1px' : `${element.style?.length || 100}px`;
      const height = element.style?.direction === 'vertical' ? `${element.style?.length || 100}px` : '1px';
      const borderStyle = element.style?.style || 'solid';
      return `<div style="position:absolute;left:${element.position?.x}px;top:${element.position?.y}px;width:${width};height:${height};background:${element.style?.color || '#000'};border:${element.style?.thickness || 1}px ${borderStyle} ${element.style?.color || '#000'};"></div>`;
    }
    case 'box': {
      return `<div ${styleAttr}></div>`;
    }
    case 'table': {
      const rowsHtml = (element.data || [])
        .map((row) => `<tr>${row.map((cell) => `<td style="padding:4px;border:1px solid #ccc;">${cell}</td>`).join('')}</tr>`)
        .join('');
      return `<table style="position:absolute;left:${element.position?.x}px;top:${element.position?.y}px;border-collapse:collapse;${element.style?.width ? `width:${element.style.width}px;` : ''};">${rowsHtml}</table>`;
    }
    case 'radio': {
      const optionsHtml = new Array(element.options || 2)
        .fill(0)
        .map((_, idx) => `<div>${element.selected === String(idx) ? '◉' : '○'} Option ${idx + 1}</div>`)
        .join('');
      return `<div ${styleAttr}>${optionsHtml}</div>`;
    }
    case 'checkbox': {
      const items = new Array(element.count || 1)
        .fill(0)
        .map((_, idx) => `<div>${(element.checkedValues || []).includes(String(idx)) ? '☑' : '☐'} Item ${idx + 1}</div>`)
        .join('');
      return `<div ${styleAttr}>${items}</div>`;
    }
    case 'date': {
      return `<div ${styleAttr}>${element.value || ''}${element.time ? ' ' + element.time : ''}</div>`;
    }
    default:
      return `<div ${styleAttr}></div>`;
  }
}

function renderTemplateHtml(templateElements, dataRow, fieldMapping = {}) {
  const mappedElements = templateElements.map((element) => {
    const cloned = JSON.parse(JSON.stringify(element));

    if (cloned.type === 'text' || cloned.type === 'paragraph') {
      cloned.content = replacePlaceholders(cloned.content, dataRow, fieldMapping);
    }

    if (cloned.type === 'table' && Array.isArray(cloned.data)) {
      cloned.data = cloned.data.map((row) => row.map((cell) => replacePlaceholders(cell, dataRow, fieldMapping)));
    }

    if (cloned.type === 'image') {
      cloned.src = replacePlaceholders(cloned.src, dataRow, fieldMapping);
    }

    return cloned;
  });

  const bodyHtml = mappedElements.map(renderElement).join('');

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
    const browser = await puppeteer.launch();
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