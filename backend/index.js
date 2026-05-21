/**
 * backend/server/index.js
 *
 * Endpoints
 * ─────────
 *   POST /parse-data         multipart file upload  → CanonicalDocument JSON
 *   POST /parse-json         { data } body          → CanonicalDocument JSON
 *   POST /validate-bindings  { templateElements, fields, collections, fieldMapping? }
 *   POST /generate-document  { pages[], ir, outputFileName? }
 *
 * Every endpoint works exclusively with CanonicalDocument { fields, collections, source }.
 * No metadata aliases. No staticData fallbacks.
 */

'use strict';

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');

const { parseDataSource, validateBindings } = require('./parsers/index');
const { generatePdfBuffer }                 = require('./renderer/pdfLibRenderer');

const app    = express();
const PORT   = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Key normalisation
// ─────────────────────────────────────────────────────────────────────────────

const normalizeCollectionKeys = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.trim().toLowerCase(), v]));

const normalizeBindingKeys = (obj = {}) =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v.trim().toLowerCase() : v])
  );

const normalizeCollectionMappings = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k.trim().toLowerCase(), v]));

// ─────────────────────────────────────────────────────────────────────────────
// Payload normaliser
//
// Expected request body shape:
// {
//   pages: [
//     {
//       templateElements: [...],
//       header: {...} | null,
//       footer: {...} | null,
//       fieldMapping: {},
//       tableCollectionBindings: {},
//       collectionMappings: {},
//     }
//   ],
//   ir: { fields, collections, source },   ← CanonicalDocument from /parse-data
//   outputFileName: "invoice"
// }
// ─────────────────────────────────────────────────────────────────────────────

const CANVAS_PAGE_H = 1123;

function normalisePayload(body) {
  if (!body.ir || !body.ir.fields || !body.ir.collections) {
    throw new Error('Request body must include "ir" (CanonicalDocument with fields and collections).');
  }

  const ir          = body.ir;
  const mergedEls   = [];
  const mergedFm    = {};
  const mergedBind  = {};
  const mergedColMp = {};

  const pageConfigs = (body.pages || []).map(p => ({
    header: p.header || null,
    footer: p.footer || null,
  }));

  (body.pages || []).forEach((page, pageIndex) => {
    const yOffset = pageIndex * CANVAS_PAGE_H;

    const elements = (page.templateElements || []).map(el => ({
      ...el,
      position: { ...el.position, y: (el.position?.y || 0) + yOffset },
    }));

    mergedEls.push(...elements);
    Object.assign(mergedFm,    page.fieldMapping            || {});
    Object.assign(mergedBind,  page.tableCollectionBindings || {});
    Object.assign(mergedColMp, page.collectionMappings      || {});
  });

  return {
    templateElements:        mergedEls,
    ir:                      { ...ir, collections: normalizeCollectionKeys(ir.collections) },
    fieldMapping:            mergedFm,
    tableCollectionBindings: normalizeBindingKeys(mergedBind),
    collectionMappings:      normalizeCollectionMappings(mergedColMp),
    outputFileName:          body.outputFileName,
    pageConfigs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /parse-data
// ─────────────────────────────────────────────────────────────────────────────

app.post('/parse-data', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required.' });
  try {
    const ir = parseDataSource(req.file.buffer, req.file.mimetype, {
      fileName: req.file.originalname,
    });
    return res.json({
      fields:      ir.fields,
      collections: ir.collections,
      source:      ir.source,
      fileName:    req.file.originalname,
      fileType:    req.file.mimetype,
    });
  } catch (err) {
    console.error('[parse-data]', err);
    return res.status(500).json({ error: err.message || 'Unable to parse file.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /parse-json
// ─────────────────────────────────────────────────────────────────────────────

app.post('/parse-json', (req, res) => {
  const { data } = req.body;
  if (data === undefined) return res.status(400).json({ error: '"data" field is required.' });
  try {
    const ir = parseDataSource(data, 'application/json');
    return res.json({
      fields:      ir.fields,
      collections: ir.collections,
      source:      ir.source,
    });
  } catch (err) {
    console.error('[parse-json]', err);
    return res.status(500).json({ error: err.message || 'Unable to parse JSON data.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /validate-bindings
// ─────────────────────────────────────────────────────────────────────────────

app.post('/validate-bindings', (req, res) => {
  const { templateElements = [], fields = {}, collections = {}, fieldMapping = {} } = req.body;
  const ir = { fields, collections, source: { type: 'api', warnings: [] } };
  return res.json(validateBindings(templateElements, ir, fieldMapping));
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /generate-document
// ─────────────────────────────────────────────────────────────────────────────

app.post('/generate-document', async (req, res) => {
  if (!Array.isArray(req.body.pages)) {
    return res.status(400).json({ error: '"pages" array is required.' });
  }

  try {
    const {
      templateElements,
      ir,
      fieldMapping,
      tableCollectionBindings,
      collectionMappings,
      outputFileName,
      pageConfigs,
    } = normalisePayload(req.body);

    // Binding validation — logs warnings, never blocks generation
    const validation = validateBindings(templateElements, ir, fieldMapping);
    if (!validation.valid) {
      console.warn('[generate-document] missing bindings:', validation);
    }

    const pdfBuffer = await generatePdfBuffer({
      ir,
      templateElements,
      fieldMapping,
      tableCollectionBindings,
      collectionMappings,
      pageConfigs,
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

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));