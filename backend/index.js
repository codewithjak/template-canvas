/**
 * server/index.js
 *
 * /generate-document now uses pdfLibRenderer (pdf-lib based, no browser).
 * Puppeteer removed from the main path entirely.
 */

const express   = require('express');
const cors      = require('cors');
const multer    = require('multer');

const { parseDataSource }   = require('./parsers/index');
const { generatePdfBuffer } = require('./renderer/pdfLibRenderer');

const app    = express();
const PORT   = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

function normalizeCollectionKeys(collections = {}) {
  const out = {};
  for (const [k, v] of Object.entries(collections)) out[k.trim().toLowerCase()] = v;
  return out;
}

function normalizeBindingKeys(bindings = {}) {
  const out = {};
  for (const [tableId, collKey] of Object.entries(bindings)) {
    out[tableId] = typeof collKey === 'string' ? collKey.trim().toLowerCase() : collKey;
  }
  return out;
}

app.post('/parse-data', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required.' });
  try {
    const result = parseDataSource(req.file.buffer, req.file.mimetype);
    return res.json({ metadata: result.metadata, collections: result.collections, fileName: req.file.originalname, fileType: req.file.mimetype });
  } catch (err) {
    console.error('[parse-data]', err);
    return res.status(500).json({ error: err.message || 'Unable to parse file.' });
  }
});

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

app.post('/generate-document', async (req, res) => {
  const { templateElements, staticData = {}, collections = {}, fieldMapping = {}, tableCollectionBindings = {}, collectionMappings = {}, outputFileName } = req.body;
  if (!Array.isArray(templateElements)) return res.status(400).json({ error: '"templateElements" array is required.' });
  try {
    const pdfBuffer = await generatePdfBuffer({
      templateElements,
      staticData,
      collections            : normalizeCollectionKeys(collections),
      fieldMapping,
      tableCollectionBindings: normalizeBindingKeys(tableCollectionBindings),
      collectionMappings,
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.pdf"` });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[generate-document]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate document.' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));