'use strict';

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const archiver = require('archiver');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { v4: uuidv4 } = require('uuid');

const { parseDataSource, validateBindings } = require('./parsers/index');
const { generatePdfBuffer }                 = require('./renderer/pdfLibRenderer');
const { generateZplBuffer }                 = require('./renderer/zplRenderer');
const { replacePlaceholders }               = require('./utils/resolver');

const app    = express();
const PORT   = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

// In production set FRONTEND_ORIGIN to the deployed frontend URL
// (e.g. https://app.map-doc.com) so the API only accepts that origin.
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Async job registry
// ─────────────────────────────────────────────────────────────────────────────

const JOBS_DIR = path.join(os.tmpdir(), 'bulk-jobs');
fs.mkdirSync(JOBS_DIR, { recursive: true });

const jobs = new Map();

// Auto-cleanup stale jobs every 5 minutes (TTL: 30 minutes)
const JOB_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (now - (job.createdAt || 0) > JOB_TTL_MS) {
      if (job.zipPath) fs.unlink(job.zipPath, () => {});
      jobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// File name helpers
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeFileName(name, fallback, ext = '.pdf') {
  const cleaned = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  const base = cleaned || fallback;
  return base.toLowerCase().endsWith(ext) ? base : `${base}${ext}`;
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
  if (!used.has(name)) { used.add(name); return name; }
  const dot  = name.toLowerCase().endsWith('.pdf') ? name.length - 4 : name.length;
  const base = name.slice(0, dot);
  const ext  = name.slice(dot);
  let i = 2;
  let candidate = `${base}-${i}${ext}`;
  while (used.has(candidate)) { i += 1; candidate = `${base}-${i}${ext}`; }
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
    const canvasPageH = body.pageSize?.canvasHeight || CANVAS_PAGE_H;
    const yOffset  = pageIndex * canvasPageH;
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
    fieldMapping:             mergedFm,
    tableCollectionBindings:  normalizeBindingKeys(mergedBind),
    collectionMappings:       normalizeCollectionMappings(mergedColMp),
    outputFileName:           body.outputFileName,
    pageConfigs,
    pageSize:                 body.pageSize || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk row IR builder
// Shared by single-document (with rowIndex), streaming bulk, and async bulk.
//
// - Promotes all driver-row columns into ir.fields (case-normalised)
// - Scopes driver collection to [row]
// - Filters related collections by FK
// ─────────────────────────────────────────────────────────────────────────────

function buildRowIr(ir, driverCollectionKey, row, rowIndex, relatedCollections) {
  const driverColl = ir.collections[driverCollectionKey] || { rows: [], columns: [] };

  // Normalise row keys to lowercase so they match classifier's case-insensitive lookup
  const normRow = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])
  );

  const rowFields = {
    ...ir.fields,
    ...normRow,
    __rowIndex:  String(rowIndex),
    __index:     String(rowIndex + 1),
    __rowNumber: String(rowIndex + 1),
  };

  const scopedCollections = {
    ...ir.collections,
    [driverCollectionKey]: { ...driverColl, rows: [row] },
  };

  for (const [collKey, cfg] of Object.entries(relatedCollections || {})) {
    const coll = ir.collections[collKey];
    if (!coll) continue;
    const driverValue = String(row[cfg.driverRowField] ?? row[cfg.driverRowField?.toLowerCase()] ?? '');
    scopedCollections[collKey] = {
      ...coll,
      rows: coll.rows.filter(r =>
        String(r[cfg.filterColumn] ?? r[cfg.filterColumn?.toLowerCase()] ?? '') === driverValue
      ),
    };
  }

  return { ...ir, fields: rowFields, collections: scopedCollections };
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
//
// Single PDF export.
// Accepts optional rowIndex + driverCollectionKey + relatedCollections so it
// scopes the IR to one driver row — identical logic to bulk row generation.
// This fixes the bug where single export rendered ALL rows from every collection.
// ─────────────────────────────────────────────────────────────────────────────

app.post('/generate-document', async (req, res) => {
  if (!Array.isArray(req.body.pages)) {
    return res.status(400).json({ error: '"pages" array is required.' });
  }
  try {
    let {
      templateElements,
      ir,
      fieldMapping,
      tableCollectionBindings,
      collectionMappings,
      outputFileName,
      pageConfigs,
      pageSize,
    } = normalisePayload(req.body);

    // ── Row scoping (single PDF) ─────────────────────────────────────
    // If the caller provides driverCollectionKey, scope the IR to the
    // requested row exactly as bulk does.  Falls back gracefully when
    // no driver is provided (static templates with no relational data).
    const driverCollectionKey = String(req.body.driverCollectionKey || '').trim().toLowerCase();
    if (driverCollectionKey && ir.collections[driverCollectionKey]?.rows?.length) {
      const rowIndex       = Math.max(0, parseInt(req.body.rowIndex ?? '0', 10));
      const rows           = ir.collections[driverCollectionKey].rows;
      const row            = rows[Math.min(rowIndex, rows.length - 1)];
      const relatedCollections = req.body.relatedCollections || {};
      ir = buildRowIr(ir, driverCollectionKey, row, rowIndex, relatedCollections);
    }
    // ────────────────────────────────────────────────────────────────

    const validation = validateBindings(templateElements, ir, fieldMapping);
    if (!validation.valid) console.warn('[generate-document] missing bindings:', validation);

    const pdfBuffer = await generatePdfBuffer({
      ir, templateElements, fieldMapping, tableCollectionBindings, collectionMappings, pageConfigs, pageSize,
    });

    // ── Format-aware response ─────────────────────────────────────────
    const format = String(req.body.format || 'pdf').toLowerCase();
    if (format === 'zpl') {
      const zplBuffer = await generateZplBuffer({
        ir, templateElements, fieldMapping, tableCollectionBindings, collectionMappings, pageConfigs, pageSize,
      });
      res.set({
        'Content-Type':        'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.zpl"`,
      });
      return res.send(zplBuffer);
    }

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[generate-document]', err);
    return res.status(500).json({ error: err.message || 'Failed to generate document.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /generate-bulk-documents  — streaming ZIP  (≤ 300 rows)
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
      pageSize,
    } = normalisePayload(req.body);

    const bulk                = req.body.bulk || {};
    const driverCollectionKey = String(bulk.driverCollectionKey || '').trim().toLowerCase();
    if (!driverCollectionKey) {
      return res.status(400).json({ error: '"bulk.driverCollectionKey" is required.' });
    }

    const driverCollection = ir.collections[driverCollectionKey];
    if (!driverCollection?.rows?.length) {
      return res.status(400).json({
        error: `Bulk collection "${driverCollectionKey}" not found or has no rows.`,
      });
    }

    const rows             = driverCollection.rows;
    const total            = rows.length;
    const format           = String(req.body.format || req.body.bulk?.format || 'pdf').toLowerCase();
    const fileExt          = format === 'zpl' ? '.zpl' : '.pdf';
    const fileNameTemplate = String(bulk.fileNameTemplate || `${outputFileName || 'document'}-{{__index}}${fileExt}`);
    const zipFileName      = sanitizeZipName(bulk.zipFileName || `${outputFileName || 'documents'}.zip`, 'documents.zip');
    const relatedCollections = bulk.relatedCollections || {};
    const generateBuffer   = format === 'zpl' ? generateZplBuffer : generatePdfBuffer;

    res.set({
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="${zipFileName}"`,
      'X-Bulk-Total':        String(total),
      'Transfer-Encoding':   'chunked',
    });

    const archive   = archiver('zip', { store: true });
    const usedNames = new Set();

    archive.on('error', err => {
      console.error('[bulk] archiver error:', err);
      res.destroy();
    });

    archive.pipe(res);

    for (let i = 0; i < rows.length; i++) {
      const row   = rows[i] || {};
      const rowIr = buildRowIr(ir, driverCollectionKey, row, i, relatedCollections);

      if (i === 0) {
        const validation = validateBindings(templateElements, rowIr, fieldMapping);
        if (!validation.valid) console.warn('[bulk] missing bindings on first row:', validation);
      }

      try {
        const buffer = await generateBuffer({
          ir: rowIr, templateElements, fieldMapping,
          tableCollectionBindings, collectionMappings, pageConfigs, pageSize,
        });

        const resolvedName = replacePlaceholders(fileNameTemplate, rowIr.fields, {});
        const safeName     = uniqueFileName(
          sanitizeFileName(resolvedName, `document-${i + 1}${fileExt}`, fileExt),
          usedNames,
        );

        archive.append(buffer, { name: safeName });
      } catch (rowErr) {
        console.error(`[bulk] row ${i} failed:`, rowErr.message);
      }
    }

    await archive.finalize();

  } catch (err) {
    console.error('[generate-bulk-documents]', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || 'Failed to generate bulk documents.' });
    }
    res.destroy();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /generate-bulk-documents/async  — background job  (> 300 rows)
// ─────────────────────────────────────────────────────────────────────────────

app.post('/generate-bulk-documents/async', async (req, res) => {
  if (!Array.isArray(req.body.pages)) {
    return res.status(400).json({ error: '"pages" array is required.' });
  }

  let normalised;
  try {
    normalised = normalisePayload(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const bulk                = req.body.bulk || {};
  const driverCollectionKey = String(bulk.driverCollectionKey || '').trim().toLowerCase();
  if (!driverCollectionKey) {
    return res.status(400).json({ error: '"bulk.driverCollectionKey" is required.' });
  }

  const driverCollection = normalised.ir.collections[driverCollectionKey];
  if (!driverCollection?.rows?.length) {
    return res.status(400).json({
      error: `Bulk collection "${driverCollectionKey}" not found or has no rows.`,
    });
  }

  const rows             = driverCollection.rows;
  const total            = rows.length;
  const format           = String(req.body.format || req.body.bulk?.format || 'pdf').toLowerCase();
  const fileExt          = format === 'zpl' ? '.zpl' : '.pdf';
  const fileNameTemplate = String(bulk.fileNameTemplate || `document-{{__index}}${fileExt}`);
  const zipFileName      = sanitizeZipName(bulk.zipFileName || 'documents.zip', 'documents.zip');
  const relatedCollections = bulk.relatedCollections || {};
  const generateBuffer   = format === 'zpl' ? generateZplBuffer : generatePdfBuffer;

  const jobId   = uuidv4();
  const zipPath = path.join(JOBS_DIR, `${jobId}.zip`);

  jobs.set(jobId, { status: 'running', current: 0, total, zipPath, zipFileName, createdAt: Date.now() });

  res.json({ jobId });

  ;(async () => {
    const job = jobs.get(jobId);
    try {
      const output    = fs.createWriteStream(zipPath);
      const archive   = archiver('zip', { store: true });
      const usedNames = new Set();

      archive.pipe(output);

      for (let i = 0; i < rows.length; i++) {
        if (job.status === 'cancelled') break;

        const row   = rows[i] || {};
        const rowIr = buildRowIr(normalised.ir, driverCollectionKey, row, i, relatedCollections);

        try {
          const buffer = await generateBuffer({
            ir:                      rowIr,
            templateElements:        normalised.templateElements,
            fieldMapping:            normalised.fieldMapping,
            tableCollectionBindings: normalised.tableCollectionBindings,
            collectionMappings:      normalised.collectionMappings,
            pageConfigs:             normalised.pageConfigs,
            pageSize:                normalised.pageSize,
          });

          const resolvedName = replacePlaceholders(fileNameTemplate, rowIr.fields, {});
          const safeName     = uniqueFileName(
            sanitizeFileName(resolvedName, `document-${i + 1}${fileExt}`, fileExt),
            usedNames,
          );

          archive.append(buffer, { name: safeName });
          job.current = i + 1;
        } catch (rowErr) {
          console.error(`[bulk-async] row ${i} failed:`, rowErr.message);
        }
      }

      await archive.finalize();

      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
      });

      job.status = 'done';
    } catch (err) {
      console.error('[bulk-async] job failed:', err);
      job.status  = 'error';
      job.message = err.message;
    }
  })();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /bulk-jobs/:jobId/status
// ─────────────────────────────────────────────────────────────────────────────

app.get('/bulk-jobs/:jobId/status', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { status, current, total, message } = job;
  res.json({ status, current, total, ...(message ? { message } : {}) });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /bulk-jobs/:jobId/download
// ─────────────────────────────────────────────────────────────────────────────

app.get('/bulk-jobs/:jobId/download', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job)                  return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done') return res.status(409).json({ error: 'Job not complete', status: job.status });

  res.set({
    'Content-Type':        'application/zip',
    'Content-Disposition': `attachment; filename="${job.zipFileName}"`,
  });

  const stream = fs.createReadStream(job.zipPath);
  stream.pipe(res);

  stream.on('close', () => {
    fs.unlink(job.zipPath, () => {});
    jobs.delete(req.params.jobId);
  });

  stream.on('error', err => {
    console.error('[bulk-download]', err);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));