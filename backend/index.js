/**
 * backend/server/index.js
 *
 * Endpoints
 * ─────────
 *   POST /parse-data         multipart file upload  → CanonicalDocument JSON
 *   POST /parse-json         { data } body          → CanonicalDocument JSON
 *   POST /validate-bindings  { templateElements, fields, collections, fieldMapping? }
 *   POST /generate-document       { pages[], ir, outputFileName? }
 *   POST /generate-bulk-documents { pages[], ir, bulk } → ZIP of PDFs
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
const { replacePlaceholders }               = require('./utils/resolver');

const app    = express();
const PORT   = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// ZIP helpers
//
// Keeps bulk export dependency-free for the MVP. Files are stored without
// compression; PDFs are already compressed well enough for this use case.
// ─────────────────────────────────────────────────────────────────────────────

let crcTable = null;

function getCrcTable() {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(buffer) {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day  = (date.getDate() || 1);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | day;
  return { time, date: dosDate };
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  const { time, date } = dosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function sanitizeFileName(name, fallback) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  const base = cleaned || fallback;
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function sanitizeZipName(name, fallback) {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');

  const base = cleaned || fallback;
  return base.toLowerCase().endsWith('.zip') ? base : `${base.replace(/\.pdf$/i, '')}.zip`;
}

function uniqueFileName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const dot = name.toLowerCase().endsWith('.pdf') ? name.length - 4 : name.length;
  const base = name.slice(0, dot);
  const ext = name.slice(dot);
  let i = 2;
  let candidate = `${base}-${i}${ext}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /generate-bulk-documents
// ─────────────────────────────────────────────────────────────────────────────

app.post('/generate-bulk-documents', async (req, res) => {
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

    const bulk = req.body.bulk || {};
    const driverCollectionKey = String(bulk.driverCollectionKey || '').trim().toLowerCase();
    if (!driverCollectionKey) {
      return res.status(400).json({ error: '"bulk.driverCollectionKey" is required.' });
    }

    const driverCollection = ir.collections[driverCollectionKey];
    if (!driverCollection || !Array.isArray(driverCollection.rows)) {
      return res.status(400).json({
        error: `Bulk collection "${driverCollectionKey}" was not found.`,
      });
    }

    const rows = driverCollection.rows;
    if (rows.length === 0) {
      return res.status(400).json({
        error: `Bulk collection "${driverCollectionKey}" has no rows.`,
      });
    }

    const fileNameTemplate = String(
      bulk.fileNameTemplate || `${outputFileName || 'document'}-{{index}}.pdf`
    );
    const zipFileName = sanitizeZipName(
      bulk.zipFileName || `${outputFileName || 'documents'}.zip`,
      'documents.zip',
    );

    const usedNames = new Set();
    const entries = [];

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i] || {};
      const rowFields = {
        ...ir.fields,
        ...row,
        __rowIndex:  String(i),
        __index:     String(i + 1),
        __rowNumber: String(i + 1),
      };

      const rowIr = {
        ...ir,
        fields: rowFields,
        collections: {
          ...ir.collections,
          [driverCollectionKey]: {
            ...driverCollection,
            rows: [row],
          },
        },
      };

      if (i === 0) {
        const validation = validateBindings(templateElements, rowIr, fieldMapping);
        if (!validation.valid) {
          console.warn('[generate-bulk-documents] missing bindings on first row:', validation);
        }
      }

      const pdfBuffer = await generatePdfBuffer({
        ir: rowIr,
        templateElements,
        fieldMapping,
        tableCollectionBindings,
        collectionMappings,
        pageConfigs,
      });

      const filenameFields = {
        ...rowFields,
        rowIndex:  String(i),
        index:     String(i + 1),
        rowNumber: String(i + 1),
      };
      const resolvedName = replacePlaceholders(fileNameTemplate, filenameFields, {});
      const safeName = uniqueFileName(
        sanitizeFileName(resolvedName, `document-${i + 1}.pdf`),
        usedNames,
      );

      entries.push({ name: safeName, data: pdfBuffer });
    }

    const zipBuffer = buildZip(entries);

    res.set({
      'Content-Type'       : 'application/zip',
      'Content-Disposition': `attachment; filename="${zipFileName}"`,
    });
    return res.send(zipBuffer);

  } catch (err) {
    console.error('[generate-bulk-documents]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate bulk documents.' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
