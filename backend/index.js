/**
 * server/index.js
 *
 * Updated to handle the multi-page canvas payload shape:
 *
 * NEW shape (from multi-page TemplateCanvas):
 * {
 *   pages: [
 *     {
 *       pageId, label, repeatHeader, headerElementIds,
 *       templateElements, staticData, collections,
 *       fieldMapping, tableCollectionBindings, collectionMappings
 *     },
 *     ...
 *   ],
 *   outputFileName
 * }
 *
 * LEGACY shape (still supported for backward compat):
 * {
 *   templateElements, staticData, collections,
 *   fieldMapping, tableCollectionBindings, collectionMappings,
 *   outputFileName
 * }
 *
 * For the multi-page shape, elements from each page are Y-offset by
 * pageIndex * 1123px so they map to distinct PDF pages via the coordinate
 * engine in pdfLibRenderer. When the full composition engine is built,
 * normalisePayload() is the only function that changes.
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

// ── Normalisation helpers ─────────────────────────────────────────────────────

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

// ── Payload normalisation ─────────────────────────────────────────────────────

/**
 * Accepts either the new pages[] shape or the legacy flat shape.
 * Returns a single normalised object ready for generatePdfBuffer.
 *
 * Multi-page strategy:
 *   Each canvas page is 1123px tall. Elements from page N are offset by
 *   N * 1123px on the Y axis so the coordinate engine places them on the
 *   correct PDF page automatically.
 *
 *   Data (staticData, collections, fieldMapping, collectionMappings) is
 *   merged across pages — in practice all pages share the same data source.
 */
function normalisePayload(body) {

  // ── New multi-page shape ───────────────────────────────────────────────────
  if (Array.isArray(body.pages)) {
    const CANVAS_PAGE_H             = 1123;
    const mergedElements            = [];
    const mergedStaticData          = {};
    const mergedCollections         = {};
    const mergedFieldMapping        = {};
    const mergedTableBindings       = {};
    const mergedCollectionMappings  = {};

    body.pages.forEach((page, pageIndex) => {
      const yOffset = pageIndex * CANVAS_PAGE_H;

      // Offset every element's Y position by the page index
      const elements = Array.isArray(page.templateElements)
        ? page.templateElements.map(el => ({
            ...el,
            position: {
              ...el.position,
              y: (el.position?.y || 0) + yOffset,
            },
          }))
        : [];

      mergedElements.push(...elements);

      // Merge data — later pages overwrite for same keys (same source in practice)
      Object.assign(mergedStaticData,           page.staticData              || {});
      Object.assign(mergedFieldMapping,         page.fieldMapping            || {});
      Object.assign(mergedTableBindings,        page.tableCollectionBindings || {});
      Object.assign(mergedCollectionMappings,   page.collectionMappings      || {});

      const pageCols = page.collections || {};
      for (const [k, v] of Object.entries(pageCols)) {
        mergedCollections[k] = v;
      }
    });

    return {
      templateElements        : mergedElements,
      staticData              : mergedStaticData,
      collections             : normalizeCollectionKeys(mergedCollections),
      fieldMapping            : mergedFieldMapping,
      tableCollectionBindings : normalizeBindingKeys(mergedTableBindings),
      collectionMappings      : mergedCollectionMappings,
      outputFileName          : body.outputFileName,
    };
  }

  // ── Legacy flat shape ─────────────────────────────────────────────────────
  return {
    templateElements        : body.templateElements        || [],
    staticData              : body.staticData              || {},
    collections             : normalizeCollectionKeys(body.collections        || {}),
    fieldMapping            : body.fieldMapping            || {},
    tableCollectionBindings : normalizeBindingKeys(body.tableCollectionBindings || {}),
    collectionMappings      : body.collectionMappings      || {},
    outputFileName          : body.outputFileName,
  };
}

// ── /parse-data ───────────────────────────────────────────────────────────────

app.post('/parse-data', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required.' });
  try {
    const result = parseDataSource(req.file.buffer, req.file.mimetype);
    return res.json({
      metadata   : result.metadata,
      collections: result.collections,
      fileName   : req.file.originalname,
      fileType   : req.file.mimetype,
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
  const hasPages    = Array.isArray(req.body.pages);
  const hasElements = Array.isArray(req.body.templateElements);

  if (!hasPages && !hasElements) {
    return res.status(400).json({
      error: '"pages" array or "templateElements" array is required.',
    });
  }

  try {
    const {
      templateElements,
      staticData,
      collections,
      fieldMapping,
      tableCollectionBindings,
      collectionMappings,
      outputFileName,
    } = normalisePayload(req.body);

    const pdfBuffer = await generatePdfBuffer({
      templateElements,
      staticData,
      collections,
      fieldMapping,
      tableCollectionBindings,
      collectionMappings,
    });

    res.set({
      'Content-Type'       : 'application/pdf',
      'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[generate-document]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate document.' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));