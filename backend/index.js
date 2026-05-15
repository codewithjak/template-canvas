/**
 * server/index.js
 * Express routes – all heavy logic lives in parsers/ and renderer/.
 *
 * CHANGES vs previous version
 * ───────────────────────────
 * 1. PAGE MARGINS (generatePdf)
 *    The Puppeteer page.pdf() call previously used margin: { top:'0', ... }.
 *
 *    Problem: when the table grows across a page break, the continuation rows
 *    start flush at the physical top of the new page (y=0), with no breathing
 *    room.  Same for any absolutely-positioned element that the layout pass
 *    pushes onto a new page.
 *
 *    Fix: set margin: { top: '20px', bottom: '20px', left: '0', right: '0' }.
 *    Puppeteer applies these as physical PDF page margins, so every page
 *    (including continuation pages) automatically has 20 px of blank space at
 *    the top and bottom.  Left/right margins are kept at 0 because the canvas
 *    template already has internal horizontal spacing baked into element x
 *    positions.
 *
 *    ⚠️  IMPORTANT: the PAGE_MARGIN_V constant in renderer/pdfRenderer.js
 *    browser script must equal the numeric value used here (20).  Both places
 *    must be updated together if this number changes.
 *
 * 2. VIEWPORT HEIGHT
 *    Increased from 1123 to A4_CONTENT_H = 1083 px (1123 - 40 for margins).
 *    This makes initial getBoundingClientRect() measurements in the browser
 *    layout pass consistent with the effective per-page content height.
 *
 * All other logic (browser lifecycle, collection key normalisation, legacy
 * /generate-pdf route, error handling) is unchanged.
 */

const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const puppeteer  = require('puppeteer');

const { parseDataSource } = require('./parsers/index');
const { buildPdfHtml }    = require('./renderer/pdfRenderer');

const app    = express();
const PORT   = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Shared Puppeteer browser instance ────────────────────────────────────────

let browser = null;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    browser.on('disconnected', () => { browser = null; });
  }
  return browser;
}

async function closeBrowserOnExit() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
process.on('SIGINT',  closeBrowserOnExit);
process.on('SIGTERM', closeBrowserOnExit);

// ── Collection key normalisation helpers (unchanged) ─────────────────────────

function normalizeCollectionKeys(collections = {}) {
  const out = {};
  for (const [k, v] of Object.entries(collections)) {
    out[k.trim().toLowerCase()] = v;
  }
  return out;
}

function normalizeBindingKeys(bindings = {}) {
  const out = {};
  for (const [tableId, collKey] of Object.entries(bindings)) {
    out[tableId] = typeof collKey === 'string' ? collKey.trim().toLowerCase() : collKey;
  }
  return out;
}

// ── Core PDF generation ───────────────────────────────────────────────────────

// PAGE MARGIN CONSTANT
// ────────────────────
// Must equal PAGE_MARGIN_V in renderer/pdfRenderer.js browser script.
// Change both places together.
const PDF_PAGE_MARGIN = '20px';

async function generatePdf({
  templateElements,
  staticData              = {},
  collections             = {},
  fieldMapping            = {},
  tableCollectionBindings = {},
  collectionMappings      = {},
}) {
  const normCollections = normalizeCollectionKeys(collections);
  const normBindings    = normalizeBindingKeys(tableCollectionBindings);

  const html = buildPdfHtml(
    templateElements,
    staticData,
    normCollections,
    fieldMapping,
    normBindings,
    collectionMappings
  );

  const b    = await getBrowser();
  const page = await b.newPage();

  try {
    // Viewport height = A4 content height after top+bottom margins.
    // This makes the browser layout script's getBoundingClientRect()
    // measurements consistent with the per-page content area.
    await page.setViewport({ width: 794, height: 1083, deviceScaleFactor: 1 });

    await page.setContent(html, { waitUntil: 'load' });

    // Wait for the browser layout pass to confirm reflow is complete.
    await page.waitForFunction('window.__pdfReady === true', { timeout: 15_000 });

    const pdfBuffer = await page.pdf({
      format         : 'A4',
      printBackground: true,
      margin: {
        // FIX: non-zero top/bottom margins ensure every page (including table
        // continuation pages) has proper spacing at its top edge.
        // ⚠️  Keep in sync with PAGE_MARGIN_V in renderer/pdfRenderer.js.
        top   : PDF_PAGE_MARGIN,
        bottom: PDF_PAGE_MARGIN,
        left  : '0',   // horizontal spacing is handled by template element positions
        right : '0',
      },
    });

    return pdfBuffer;
  } finally {
    await page.close();
  }
}

// ── /parse-data ───────────────────────────────────────────────────────────────

app.post('/parse-data', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required.' });

  try {
    const result = parseDataSource(req.file.buffer, req.file.mimetype);
    return res.json({
      metadata    : result.metadata,
      collections : result.collections,
      fileName    : req.file.originalname,
      fileType    : req.file.mimetype,
    });
  } catch (err) {
    console.error('[parse-data]', err);
    return res.status(500).json({ error: err.message || 'Unable to parse file.' });
  }
});

// ── /parse-json ───────────────────────────────────────────────────────────────

app.post('/parse-json', (req, res) => {
  const { data } = req.body;
  if (data === undefined) return res.status(400).json({ error: '"data" field is required.' });

  try {
    const result = parseDataSource(data, 'application/json');
    return res.json({ metadata: result.metadata, collections: result.collections });
  } catch (err) {
    console.error('[parse-json]', err);
    return res.status(500).json({ error: err.message || 'Unable to parse JSON data.' });
  }
});

// ── /generate-document ───────────────────────────────────────────────────────

app.post('/generate-document', async (req, res) => {
  const {
    templateElements,
    staticData              = {},
    collections             = {},
    fieldMapping            = {},
    tableCollectionBindings = {},
    collectionMappings      = {},
    outputFileName,
  } = req.body;

  if (!Array.isArray(templateElements)) {
    return res.status(400).json({ error: '"templateElements" array is required.' });
  }

  try {
    const pdfBuffer = await generatePdf({
      templateElements,
      staticData,
      collections,
      fieldMapping,
      tableCollectionBindings,
      collectionMappings,
    });

    res.set({
      'Content-Type'        : 'application/pdf',
      'Content-Disposition' : `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[generate-document]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate document.' });
  }
});

// ── /generate-pdf (legacy compat) ─────────────────────────────────────────────

app.post('/generate-pdf', async (req, res) => {
  const { templateElements, dataRow, fieldMapping, outputFileName } = req.body;

  if (!templateElements || !dataRow) {
    return res.status(400).json({ error: '"templateElements" and "dataRow" are required.' });
  }

  try {
    const pdfBuffer = await generatePdf({
      templateElements,
      staticData             : dataRow,
      collections            : {},
      fieldMapping           : fieldMapping || {},
      tableCollectionBindings: {},
      collectionMappings     : {},
    });

    res.set({
      'Content-Type'        : 'application/pdf',
      'Content-Disposition' : `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[generate-pdf]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate document.' });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});