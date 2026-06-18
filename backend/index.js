'use strict';

require('dotenv').config();

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
const { rasterizePdfBuffer, isImageFormat } = require('./renderer/imageRenderer');
const { extractPdf }                        = require('./pdfImport/extract');
const { structureBlocks, isAvailable: structurerAvailable } = require('./pdfImport/structurer');
const { matchTemplate, isAvailable: matcherAvailable } = require('./pdfImport/matcher');
const { replacePlaceholders }               = require('./utils/resolver');
const { logExportEvent }                    = require('./analytics');
const { checkExportAllowed }                = require('./usage');
const { stampWatermark }                    = require('./renderer/watermark');

// Extracted helpers (pure functions) and self-contained route groups.
const {
  sanitizeFileName, sanitizeZipName, uniqueFileName, extForFormat, withPageSuffix,
} = require('./lib/fileNames');
const { normalisePayload }  = require('./lib/normalisePayload');
const { buildRowIr }        = require('./lib/buildRowIr');
const { renderDocEntries }  = require('./lib/renderDocEntries');
const contactRouter         = require('./routes/contact');
const teamApiRouter         = require('./routes/teamApi');

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
// POST /pdf-import  — extract a PDF into the ExtractedDocument IR (Phase 1).
// The client runs the deterministic pipeline (Phases 2–6) on the result.
// ─────────────────────────────────────────────────────────────────────────────

app.post('/pdf-import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required.' });
  try {
    const extracted = await extractPdf(req.file.buffer, req.file.originalname);
    return res.json(extracted);
  } catch (err) {
    console.error('[pdf-import]', err);
    return res.status(500).json({ error: err.message || 'Unable to extract PDF.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /pdf-structure — Phase 4 LLM structurer. Input: normalized pages/blocks.
// Output: a structure plan (paragraph groups + zones) referencing block ids.
// Returns 503 when unavailable so the client falls back to the deterministic
// pass-through structurer (the import always succeeds).
// ─────────────────────────────────────────────────────────────────────────────

app.post('/pdf-structure', async (req, res) => {
  const pages = req.body?.pages;
  const exemplar = req.body?.exemplar ?? null;
  if (!Array.isArray(pages)) return res.status(400).json({ error: '"pages" array is required.' });
  if (!structurerAvailable()) {
    return res.status(503).json({ error: 'Structurer unavailable (no API key).' });
  }
  try {
    const plan = await structureBlocks(pages, exemplar);
    return res.json(plan);
  } catch (err) {
    console.error('[pdf-structure]', err);
    return res.status(502).json({ error: err.message || 'Structuring failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /pdf-match — retrieval. Input: { extracted:{labels}, corpus:[{key,name,labels}] }.
// Output: { key, confidence, reason } (key "" = no clear match). 503 when no key.
// ─────────────────────────────────────────────────────────────────────────────

app.post('/pdf-match', async (req, res) => {
  const { extracted, corpus } = req.body || {};
  if (!extracted?.labels || !Array.isArray(corpus)) {
    return res.status(400).json({ error: '"extracted.labels" and "corpus" are required.' });
  }
  if (!matcherAvailable()) return res.status(503).json({ error: 'Matcher unavailable (no API key).' });
  try {
    return res.json(await matchTemplate({ extracted, corpus }));
  } catch (err) {
    console.error('[pdf-match]', err);
    return res.status(502).json({ error: err.message || 'Matching failed.' });
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

  const format = String(req.body.format || 'pdf').toLowerCase();

  // Entitlement gate (plan capability + monthly cap). Runs before any work.
  const gate = await checkExportAllowed({
    authHeader: req.headers.authorization, mode: 'single', rows: 1, format,
  });
  if (!gate.allowed) return res.status(gate.status).json({ error: gate.error });

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
    // Tamper-proof usage tracking (fire-and-forget; team derived from JWT).
    logExportEvent(req.headers.authorization, { format, mode: 'single' });

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

    if (isImageFormat(format)) {
      // Watermark the PDF FIRST, then rasterize — branding is baked into the pixels.
      const wmPdf = gate.watermark ? await stampWatermark(pdfBuffer) : pdfBuffer;
      const dpi   = parseInt(req.body.dpi, 10) || undefined;          // emitter clamps + defaults to 300
      const pages = await rasterizePdfBuffer(wmPdf, {
        imageFormat: format, dpi, jpegQuality: req.body.jpegQuality,
      });
      const base = outputFileName || 'document';

      // Single page → return the image directly; multi-page → zip the pages.
      if (pages.length === 1) {
        res.set({
          'Content-Type':        pages[0].contentType,
          'Content-Disposition': `attachment; filename="${base}.${pages[0].ext}"`,
        });
        return res.send(pages[0].buffer);
      }

      const archive = archiver('zip', { store: true });
      archive.on('error', err => { console.error('[generate-document] image zip error:', err); res.destroy(); });
      res.set({
        'Content-Type':        'application/zip',
        'Content-Disposition': `attachment; filename="${base}.zip"`,
      });
      archive.pipe(res);
      for (const p of pages) archive.append(p.buffer, { name: `${base}-p${p.pageIndex + 1}.${p.ext}` });
      return archive.finalize();
    }

    // Free tier: brand the PDF server-side so it can't be stripped client-side.
    const outBuffer = gate.watermark ? await stampWatermark(pdfBuffer) : pdfBuffer;

    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${outputFileName || 'document'}.pdf"`,
    });
    return res.send(outBuffer);
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
    const fileExt          = extForFormat(format);
    const dpi              = parseInt(req.body.dpi, 10) || undefined;   // image formats; emitter clamps + defaults
    const jpegQuality      = req.body.jpegQuality;
    const fileNameTemplate = String(bulk.fileNameTemplate || `${outputFileName || 'document'}-{{__index}}${fileExt}`);
    const zipFileName      = sanitizeZipName(bulk.zipFileName || `${outputFileName || 'documents'}.zip`, 'documents.zip');
    const relatedCollections = bulk.relatedCollections || {};

    // Entitlement gate (bulk capability + per-job rows + monthly cap). Must
    // run before any bytes are streamed so we can still return a JSON error.
    const gate = await checkExportAllowed({
      authHeader: req.headers.authorization, mode: 'bulk', rows: total, format,
    });
    if (!gate.allowed) return res.status(gate.status).json({ error: gate.error });

    // Tamper-proof usage tracking (fire-and-forget; team derived from JWT).
    logExportEvent(req.headers.authorization, { format, mode: 'bulk', rows: total });

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
        const entries = await renderDocEntries({
          format, gate, dpi, jpegQuality,
          genArgs: { ir: rowIr, templateElements, fieldMapping,
                     tableCollectionBindings, collectionMappings, pageConfigs, pageSize },
        });
        const resolvedName = replacePlaceholders(fileNameTemplate, rowIr.fields, {});
        const safeBase     = sanitizeFileName(resolvedName, `document-${i + 1}${fileExt}`, fileExt);
        for (const e of entries) {
          const name = uniqueFileName(withPageSuffix(safeBase, fileExt, e.pageIndex, e.multi), usedNames);
          archive.append(e.buffer, { name });
        }
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
  const fileExt          = extForFormat(format);
  const dpi              = parseInt(req.body.dpi, 10) || undefined;   // image formats; emitter clamps + defaults
  const jpegQuality      = req.body.jpegQuality;
  const fileNameTemplate = String(bulk.fileNameTemplate || `document-{{__index}}${fileExt}`);
  const zipFileName      = sanitizeZipName(bulk.zipFileName || 'documents.zip', 'documents.zip');
  const relatedCollections = bulk.relatedCollections || {};

  // Entitlement gate (bulk capability + per-job rows + monthly cap).
  const gate = await checkExportAllowed({
    authHeader: req.headers.authorization, mode: 'bulk_async', rows: total, format,
  });
  if (!gate.allowed) return res.status(gate.status).json({ error: gate.error });

  const jobId   = uuidv4();
  const zipPath = path.join(JOBS_DIR, `${jobId}.zip`);

  jobs.set(jobId, { status: 'running', current: 0, total, zipPath, zipFileName, createdAt: Date.now() });

  // Tamper-proof usage tracking (fire-and-forget; team derived from JWT).
  logExportEvent(req.headers.authorization, { format, mode: 'bulk_async', rows: total });

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
          const entries = await renderDocEntries({
            format, gate, dpi, jpegQuality,
            genArgs: {
              ir:                      rowIr,
              templateElements:        normalised.templateElements,
              fieldMapping:            normalised.fieldMapping,
              tableCollectionBindings: normalised.tableCollectionBindings,
              collectionMappings:      normalised.collectionMappings,
              pageConfigs:             normalised.pageConfigs,
              pageSize:                normalised.pageSize,
            },
          });
          const resolvedName = replacePlaceholders(fileNameTemplate, rowIr.fields, {});
          const safeBase     = sanitizeFileName(resolvedName, `document-${i + 1}${fileExt}`, fileExt);
          for (const e of entries) {
            const name = uniqueFileName(withPageSuffix(safeBase, fileExt, e.pageIndex, e.multi), usedNames);
            archive.append(e.buffer, { name });
          }
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
// Mounted route groups
//   /v1/*  — team management + API key integration  (see routes/teamApi.js)
//   /contact — public contact form                  (see routes/contact.js)
// ─────────────────────────────────────────────────────────────────────────────

app.use(teamApiRouter);
app.use(contactRouter);


// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));