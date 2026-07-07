'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const archiver = require('archiver');
const fs       = require('fs');
const path     = require('path');
const { v4: uuidv4 } = require('uuid');

const { parseDataSource, validateBindings } = require('./parsers/index');
const { generatePdfBuffer }                 = require('./renderer/pdfLibRenderer');
const { generateZplBuffer }                 = require('./renderer/zplRenderer');
const { rasterizePdfBuffer, isImageFormat } = require('./renderer/imageRenderer');
const { extractPdf }                        = require('./pdfImport/extract');
const { structureBlocks, isAvailable: structurerAvailable } = require('./pdfImport/structurer');
const { matchTemplate, isAvailable: matcherAvailable } = require('./pdfImport/matcher');
const { replacePlaceholders }               = require('./utils/resolver');
const { logExportEvent, logAiBuildEvent }   = require('./analytics');
const { checkExportAllowed, checkAiBuildAllowed } = require('./usage');
const { stampWatermark }                    = require('./renderer/watermark');

// Extracted helpers (pure functions) and self-contained route groups.
const {
  sanitizeFileName, sanitizeZipName, uniqueFileName, extForFormat, withPageSuffix,
} = require('./lib/fileNames');
const { normalisePayload }  = require('./lib/normalisePayload');
const { buildRowIr }        = require('./lib/buildRowIr');
const { renderDocEntries }  = require('./lib/renderDocEntries');
const { buildExportArtifact } = require('./lib/exportArtifact');
const { isEmailConfigured, makeRateLimiter, clientIp } = require('./lib/email');
const { deliver, validateDelivery } = require('./delivery');

// Throttle export emails: max 20 per hour per IP.
const deliveryRateLimited = makeRateLimiter(20, 60 * 60 * 1000);
const contactRouter         = require('./routes/contact');
const teamApiRouter         = require('./routes/teamApi');
const artifactStore         = require('./storage/artifactStore');
const { startRetryWorker } = require('./webhooks/dispatch');

const app    = express();
const PORT   = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

// Lifetime of presigned download URLs (webhook payloads + browser redirects).
const ARTIFACT_URL_TTL_MS = (parseInt(process.env.ARTIFACT_URL_TTL_SECONDS, 10) || 3600) * 1000;

// In production set FRONTEND_ORIGIN to the deployed frontend URL
// (e.g. https://app.map-doc.com) so the API only accepts that origin.
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// Async job registry + bulk engine — shared with the connector endpoint
// (/v1/generate/bulk) via lib/bulkJobs.js. The `jobs` Map is a singleton, so the
// status/download endpoints below read the same records regardless of who
// created the job (browser JWT or API key).
// ─────────────────────────────────────────────────────────────────────────────

const { jobs, JOBS_DIR, runBulkJob } = require('./lib/bulkJobs');

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

  // Metered entitlement: this is the billable AI step. Enforce the team's
  // monthly AI-rebuild quota BEFORE spending any tokens.
  const gate = await checkAiBuildAllowed({ authHeader: req.headers.authorization });
  if (!gate.allowed) {
    return res.status(gate.status).json({ error: gate.error });
  }

  try {
    const plan = await structureBlocks(pages, exemplar);
    // Count this build against the monthly quota (fire-and-forget, JWT-attributed).
    logAiBuildEvent(req.headers.authorization);
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
  // Emailing the export is itself a paid capability ("delivery").
  const wantsDelivery = Boolean(req.body.delivery && req.body.delivery.email);
  const gate = await checkExportAllowed({
    authHeader: req.headers.authorization, mode: 'single', rows: 1, format,
    delivery: wantsDelivery,
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

    const genArgs = {
      ir, templateElements, fieldMapping, tableCollectionBindings, collectionMappings, pageConfigs, pageSize,
    };

    // ── Email delivery (optional) ─────────────────────────────────────
    // When the caller asks to email the export, render it to a single
    // artifact and send it instead of streaming the file back.
    const delivery = req.body.delivery;
    if (delivery && delivery.email) {
      if (!isEmailConfigured()) {
        return res.status(503).json({ error: 'Email delivery is not configured.' });
      }
      const deliveryError = validateDelivery(delivery);
      if (deliveryError) return res.status(400).json({ error: deliveryError });

      if (deliveryRateLimited(clientIp(req))) {
        return res.status(429).json({ error: 'Too many emails sent — please try again in a little while.' });
      }

      const artifact = await buildExportArtifact({
        format, genArgs, gate, outputFileName,
        dpi:         parseInt(req.body.dpi, 10) || undefined,
        jpegQuality: req.body.jpegQuality,
      });

      logExportEvent(req.headers.authorization, { format, mode: 'single' });

      try {
        const result = await deliver({ artifact, delivery, authHeader: req.headers.authorization });
        return res.status(202).json(result);
      } catch (sendErr) {
        console.error('[generate-document] delivery failed:', sendErr?.response?.body || sendErr);
        return res.status(502).json({ error: 'Could not send the document. Please try again.' });
      }
    }
    // ──────────────────────────────────────────────────────────────────

    const pdfBuffer = await generatePdfBuffer(genArgs);

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

  // Stash every render input on the job record so the shared engine
  // (lib/bulkJobs.runBulkJob) can run the fan-out loop identically for the
  // browser and the connector (/v1/generate/bulk) paths.
  jobs.set(jobId, {
    status: 'running', current: 0, total, zipPath, zipFileName, createdAt: Date.now(),
    teamId: gate.teamId, source: 'browser',
    rows, driverCollectionKey, relatedCollections,
    ir: normalised.ir,
    templateElements:        normalised.templateElements,
    fieldMapping:            normalised.fieldMapping,
    tableCollectionBindings: normalised.tableCollectionBindings,
    collectionMappings:      normalised.collectionMappings,
    pageConfigs:             normalised.pageConfigs,
    pageSize:                normalised.pageSize,
    format, fileExt, dpi, jpegQuality, fileNameTemplate, gate,
  });

  // Tamper-proof usage tracking (fire-and-forget; team derived from JWT).
  logExportEvent(req.headers.authorization, { format, mode: 'bulk_async', rows: total });

  res.json({ jobId });

  runBulkJob(jobId);
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

app.get('/bulk-jobs/:jobId/download', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job)                  return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'done') return res.status(409).json({ error: 'Job not complete', status: job.status });

  // The artifact lives in S3; hand the client a fresh presigned URL and redirect.
  // The browser's anchor-based download follows this 302 without needing CORS,
  // and the filename comes from the URL's response-content-disposition.
  try {
    const { url } = await artifactStore.downloadTarget(req.params.jobId, {
      fileName: job.zipFileName, expiresInMs: ARTIFACT_URL_TTL_MS,
    });
    return res.redirect(302, url);
  } catch (err) {
    console.error('[bulk-download]', err);
    return res.status(500).json({ error: 'Could not produce download URL' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Mounted route groups
//   /v1/*  — team management + API key integration  (see routes/teamApi.js)
//   /contact — public contact form                  (see routes/contact.js)
// ─────────────────────────────────────────────────────────────────────────────

app.use(teamApiRouter);
app.use(require('./routes/apiGenerate'));   // POST /v1/generate — headless API generation (Step 1)
app.use(require('./routes/apiGenerateBulk')); // POST /v1/generate/bulk — headless API bulk fan-out (Step 1, Mode A)
app.use(require('./routes/webhooks'));      // /v1/webhooks — outbound webhook endpoints (Step 3)
app.use(require('./routes/connector'));     // /v1/me, /v1/hooks/*, /v1/events/sample — connector REST hooks (Step 4)
app.use(require('./routes/cloudConnect'));  // /v1/cloud/connections — Visual Cloud Builder connect-account (P5)
app.use(require('./routes/cloudRun'));      // /v1/cloud/runs — terraform plan/apply runs (P6/P7)
app.use(require('./routes/cloudDrift'));    // /v1/cloud/drift — drift detection (keeping the canvas in sync)
app.use(require('./routes/cloudDeployments')); // /v1/cloud/deployments — deployment registry + lifecycle
app.use(require('./routes/cloudArchitect')); // /v1/cloud/architect — LLM architect (P10)
app.use(contactRouter);
app.use(require('./admin'));   // [ADMIN PANEL] isolated feature — remove this line + backend/admin/ to disable


// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

// Durable webhook retry sweeper: re-attempts due deliveries (state lives in the
// DB, so retries survive restarts). No-op when Supabase isn't configured.
startRetryWorker();

// Continuous drift sweeper: re-plans each verified deployment against live state
// and fires `cloud.drift.detected` on new drift. No-op unless the cloud runner
// is configured (AWS creds + state bucket). See cloud/driftWorker.js.
require('./cloud/driftWorker').startDriftWorker();

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));