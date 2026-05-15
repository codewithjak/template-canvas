/**
 * server/index.js
 * Express routes – all heavy logic lives in parsers/ and renderer/.
 */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const puppeteer = require('puppeteer');

const { parseDataSource } = require('./parsers/index');
const { buildPdfHtml } = require('./renderer/pdfRenderer');

const app = express();
const PORT = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── /parse-data ──────────────────────────────────────────────────────────────
//
// Accepts: multipart/form-data with a "file" field (xlsx, xls, csv, json).
// Returns: { metadata, collections, fileName, fileType }
//
// metadata    – flat KV record from the KV section of the sheet
// collections – { collectionName: { headers: string[], rows: object[] } }
//
app.post('/parse-data', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required.' });

  try {
    const result = parseDataSource(req.file.buffer, req.file.mimetype);

    return res.json({
      metadata: result.metadata,
      collections: result.collections,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
    });
  } catch (err) {
    console.error('parse-data error:', err);
    return res.status(500).json({ error: err.message || 'Unable to parse file.' });
  }
});

// ── /parse-json (API data source) ────────────────────────────────────────────
//
// Accepts: application/json body with { data: <any JS value> }
// Returns: same { metadata, collections } shape as /parse-data
//
app.post('/parse-json', (req, res) => {
  try {
    const { data } = req.body;
    if (data === undefined) return res.status(400).json({ error: '"data" field is required.' });
    const result = parseDataSource(data, 'application/json');
    return res.json({ metadata: result.metadata, collections: result.collections });
  } catch (err) {
    console.error('parse-json error:', err);
    return res.status(500).json({ error: err.message || 'Unable to parse JSON data.' });
  }
});

// ── /generate-document ───────────────────────────────────────────────────────
//
// Accepts JSON body:
// {
//   templateElements:       CanvasElement[]
//   staticData:             Record<string,string>          – KV metadata
//   collections:            Record<string, object[]>       – rows per collection
//   fieldMapping:           Record<string,string>          – placeholder→metadataKey
//   tableCollectionBindings:Record<string,string>          – tableId→collectionKey
//   collectionMappings:     Record<string,Record<string,string>> – collectionKey→{placeholder→column}
//   outputFileName?:        string
// }
//
app.post('/generate-document', async (req, res) => {
  const {
    templateElements,
    staticData = {},
    collections = {},
    fieldMapping = {},
    tableCollectionBindings = {},
    collectionMappings = {},
    outputFileName,
  } = req.body;

  if (!templateElements || !Array.isArray(templateElements)) {
    return res.status(400).json({ error: '"templateElements" array is required.' });
  }

  try {
    const html = buildPdfHtml(
      templateElements,
      staticData,
      collections,
      fieldMapping,
      tableCollectionBindings,
      collectionMappings
    );

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('generate-document error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate document.' });
  }
});

// ── /generate-pdf (legacy compat – wraps generate-document) ─────────────────
app.post('/generate-pdf', async (req, res) => {
  const { templateElements, dataRow, fieldMapping, outputFileName } = req.body;
  if (!templateElements || !dataRow) {
    return res.status(400).json({ error: 'templateElements and dataRow are required.' });
  }
  // Treat dataRow as flat staticData; no collections
  req.body = {
    templateElements,
    staticData: dataRow,
    collections: {},
    fieldMapping: fieldMapping || {},
    tableCollectionBindings: {},
    collectionMappings: {},
    outputFileName,
  };
  // Forward to the new handler by re-calling generate-document logic
  return require('./renderer/pdfRenderer')
    ? res.redirect(307, '/generate-document')
    : res.status(500).json({ error: 'Internal routing error.' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});