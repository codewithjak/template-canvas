'use strict';

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const multer  = require('multer');
const archiver = require('archiver');
const sgMail   = require('@sendgrid/mail');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { v4: uuidv4 } = require('uuid');

const { parseDataSource, validateBindings } = require('./parsers/index');
const { generatePdfBuffer }                 = require('./renderer/pdfLibRenderer');
const { generateZplBuffer }                 = require('./renderer/zplRenderer');
const { replacePlaceholders }               = require('./utils/resolver');
const { logExportEvent }                    = require('./analytics');
const { checkExportAllowed }                = require('./usage');
const { stampWatermark }                    = require('./renderer/watermark');
const { planAllows }                        = require('./plans');

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
    const fileExt          = format === 'zpl' ? '.zpl' : '.pdf';
    const fileNameTemplate = String(bulk.fileNameTemplate || `${outputFileName || 'document'}-{{__index}}${fileExt}`);
    const zipFileName      = sanitizeZipName(bulk.zipFileName || `${outputFileName || 'documents'}.zip`, 'documents.zip');
    const relatedCollections = bulk.relatedCollections || {};
    const generateBuffer   = format === 'zpl' ? generateZplBuffer : generatePdfBuffer;

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
        let buffer = await generateBuffer({
          ir: rowIr, templateElements, fieldMapping,
          tableCollectionBindings, collectionMappings, pageConfigs, pageSize,
        });
        if (gate.watermark && format !== 'zpl') buffer = await stampWatermark(buffer);

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
          let buffer = await generateBuffer({
            ir:                      rowIr,
            templateElements:        normalised.templateElements,
            fieldMapping:            normalised.fieldMapping,
            tableCollectionBindings: normalised.tableCollectionBindings,
            collectionMappings:      normalised.collectionMappings,
            pageConfigs:             normalised.pageConfigs,
            pageSize:                normalised.pageSize,
          });
          if (gate.watermark && format !== 'zpl') buffer = await stampWatermark(buffer);

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

// ════════════════════════════════════════════════════════════════════════════
// API INTEGRATION ENDPOINTS   (additive — see supabase/api_integration.sql)
//
//   Key management — browser, authenticated by Supabase JWT:
//     POST   /v1/keys          issue or rotate the team's single API key
//     GET    /v1/keys          key metadata (prefix/created/revoked) — never the secret
//     POST   /v1/keys/revoke   revoke the current key
//     GET    /v1/usage         plan + usage summary
//
//   Data ingestion — external systems, authenticated by the API key:
//     POST   /v1/ingest        push JSON → normalised IR stored against a template
//
// These endpoints are entirely separate from the existing generate/parse
// routes above; they add a second auth mode (API key) without altering the
// JWT-based flow the app already uses.
// ════════════════════════════════════════════════════════════════════════════

const {
  extractApiKey,
  resolveTeamFromJwt,
  resolveTeamFromApiKey,
  issueKeyForTeam,
  getKeyMeta,
  revokeKeyForTeam,
} = require('./apiKeys');
const {
  listTeam,
  createInvite,
  revokeInvite,
  removeMember,
  lookupInvite,
  acceptInvite,
} = require('./teams');
const { getUsageSummary, getTeamPlan } = require('./usage');

// Owner/admin may manage the team; members/viewers may not.
const isManager = (role) => role === 'owner' || role === 'admin';
const { PLAN_ORDER, getPlan } = require('./plans');
const { getAdmin: getSupabaseAdmin } = require('./supabaseAdmin');

// Flatten a saved template document (body_json) to its element list.
function collectTemplateElements(bodyJson) {
  if (!bodyJson || !Array.isArray(bodyJson.pages)) return [];
  return bodyJson.pages.flatMap(p => (Array.isArray(p.elements) ? p.elements : []));
}

// ── Key management (JWT-scoped) ───────────────────────────────────────────────

app.post('/v1/keys', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    // API access is a Business-tier capability.
    if (!planAllows(await getTeamPlan(ctx.teamId), 'api')) {
      return res.status(403).json({ error: 'API access requires the Business plan. Upgrade to unlock it.' });
    }
    const apiKey = await issueKeyForTeam(ctx.teamId);
    // Returned ONCE. Only a hash is stored — it cannot be retrieved again.
    return res.json({ apiKey, prefix: apiKey.slice(0, 14) });
  } catch (err) {
    console.error('[v1/keys POST]', err);
    return res.status(500).json({ error: err.message || 'Could not issue key.' });
  }
});

app.get('/v1/keys', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    return res.json({ key: await getKeyMeta(ctx.teamId) });
  } catch (err) {
    console.error('[v1/keys GET]', err);
    return res.status(500).json({ error: err.message || 'Could not load key.' });
  }
});

app.post('/v1/keys/revoke', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    await revokeKeyForTeam(ctx.teamId);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[v1/keys/revoke]', err);
    return res.status(500).json({ error: err.message || 'Could not revoke key.' });
  }
});

app.get('/v1/usage', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    return res.json(await getUsageSummary(ctx.teamId));
  } catch (err) {
    console.error('[v1/usage]', err);
    return res.status(500).json({ error: err.message || 'Could not load usage.' });
  }
});

// ── Team management (JWT-scoped) ──────────────────────────────────────────────
//
//   GET  /v1/team                team + members + invites + seats (any member)
//   POST /v1/team/invites        create an invite             (owner/admin)
//   POST /v1/team/invites/revoke revoke a pending invite      (owner/admin)
//   POST /v1/team/members/remove remove a member              (owner/admin)
//   GET  /v1/invites/:token      public invite details for the accept screen
//   POST /v1/invites/accept      accept an invite             (the invitee)
//
// Team workspaces are a Business-tier capability; every team route below
// re-checks it server-side (a downgrade must stop further management).

// Map a thrown error to its HTTP status; log only true server faults.
function sendTeamError(res, tag, err, fallback) {
  const status = err.status || 500;
  if (status >= 500) console.error(tag, err);
  return res.status(status).json({ error: err.message || fallback });
}

app.get('/v1/team', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!planAllows(await getTeamPlan(ctx.teamId), 'teams')) {
      return res.status(403).json({ error: 'Team workspaces require the Business plan.' });
    }
    const data = await listTeam(ctx.teamId);
    return res.json({ ...data, role: ctx.role, currentUserId: ctx.userId });
  } catch (err) {
    return sendTeamError(res, '[v1/team GET]', err, 'Could not load team.');
  }
});

app.post('/v1/team/invites', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!planAllows(await getTeamPlan(ctx.teamId), 'teams')) {
      return res.status(403).json({ error: 'Team workspaces require the Business plan.' });
    }
    if (!isManager(ctx.role)) {
      return res.status(403).json({ error: 'Only owners and admins can invite members.' });
    }
    const { email, role } = req.body || {};
    const invite = await createInvite(ctx.teamId, email, role, ctx.userId);
    // The token is returned so the UI can build a shareable accept link
    // (no email is sent server-side yet).
    return res.json({ invite });
  } catch (err) {
    return sendTeamError(res, '[v1/team/invites]', err, 'Could not create invite.');
  }
});

app.post('/v1/team/invites/revoke', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!isManager(ctx.role)) {
      return res.status(403).json({ error: 'Only owners and admins can manage invites.' });
    }
    const { inviteId } = req.body || {};
    if (!inviteId) return res.status(400).json({ error: '"inviteId" is required.' });
    await revokeInvite(ctx.teamId, inviteId);
    return res.json({ ok: true });
  } catch (err) {
    return sendTeamError(res, '[v1/team/invites/revoke]', err, 'Could not revoke invite.');
  }
});

app.post('/v1/team/members/remove', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });
    if (!isManager(ctx.role)) {
      return res.status(403).json({ error: 'Only owners and admins can remove members.' });
    }
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: '"userId" is required.' });
    await removeMember(ctx.teamId, userId);
    return res.json({ ok: true });
  } catch (err) {
    return sendTeamError(res, '[v1/team/members/remove]', err, 'Could not remove member.');
  }
});

// Unauthenticated — the token itself is the capability. Lets the accept page
// show "you've been invited to X" before the user signs in.
app.get('/v1/invites/:token', async (req, res) => {
  try {
    const info = await lookupInvite(req.params.token);
    if (!info) return res.status(404).json({ error: 'This invite link is invalid.' });
    return res.json(info);
  } catch (err) {
    return sendTeamError(res, '[v1/invites GET]', err, 'Could not load invite.');
  }
});

app.post('/v1/invites/accept', async (req, res) => {
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Sign in to accept this invite.' });
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ error: '"token" is required.' });
    const result = await acceptInvite(ctx.userId, ctx.userEmail, token);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return sendTeamError(res, '[v1/invites/accept]', err, 'Could not accept invite.');
  }
});

// ── Data ingestion (API-key-scoped) ───────────────────────────────────────────
//
// Body: { templateId: <uuid>, data: <any JSON> }
// Auth: X-API-Key: tc_live_…   (or Authorization: Bearer tc_live_…)
//
// Normalises the payload to the CanonicalDocument IR using the SAME parser the
// app's /parse-json route uses, verifies the template belongs to the key's
// team, then upserts the payload onto template_bindings.last_payload for
// (team, template). Existing mapping columns on that row are preserved.
// validateBindings runs against any saved mapping so the caller sees missing
// bindings instead of silent blanks downstream.
app.post('/v1/ingest', async (req, res) => {
  try {
    const rawKey = extractApiKey(req);
    if (!rawKey) return res.status(401).json({ error: 'API key required (X-API-Key header).' });

    const teamId = await resolveTeamFromApiKey(rawKey);
    if (!teamId) return res.status(403).json({ error: 'Invalid or revoked API key.' });

    // A team can hold a key issued while on Business but later downgrade — keep
    // the capability check live on every request, not just at issue time.
    if (!planAllows(await getTeamPlan(teamId), 'api')) {
      return res.status(403).json({ error: 'API access requires the Business plan.' });
    }

    const { templateId, data } = req.body || {};
    if (!templateId)        return res.status(400).json({ error: '"templateId" is required.' });
    if (data === undefined) return res.status(400).json({ error: '"data" is required.' });

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(503).json({ error: 'Server not configured for Supabase.' });

    // Tenant isolation: the template must belong to the key's team.
    const { data: tpl, error: tplErr } = await sb
      .from('templates')
      .select('id, team_id, body_json')
      .eq('id', templateId)
      .maybeSingle();
    if (tplErr) throw tplErr;
    if (!tpl || tpl.team_id !== teamId) {
      return res.status(404).json({ error: 'Template not found for this team.' });
    }

    // Normalise → CanonicalDocument IR (same path as POST /parse-json).
    let ir;
    try {
      ir = parseDataSource(data, 'application/json');
    } catch (e) {
      return res.status(422).json({ error: `Could not parse data: ${e.message}` });
    }

    // Load any existing binding so we can validate against its saved mapping.
    const { data: binding } = await sb
      .from('template_bindings')
      .select('field_mapping')
      .eq('team_id', teamId)
      .eq('template_id', templateId)
      .maybeSingle();

    const fieldMapping = binding?.field_mapping || {};
    const elements     = collectTemplateElements(tpl.body_json);
    const validation   = validateBindings(elements, ir, fieldMapping);

    // Store latest payload. Only these columns are written, so existing mapping
    // columns are preserved on update and default to '{}' on first insert.
    const { error: upErr } = await sb.from('template_bindings').upsert(
      {
        team_id:        teamId,
        template_id:    templateId,
        last_payload:   ir,
        last_ingest_at: new Date().toISOString(),
        updated_at:     new Date().toISOString(),
      },
      { onConflict: 'team_id,template_id' },
    );
    if (upErr) throw upErr;

    return res.json({
      ok:          true,
      templateId,
      bound:       !!binding, // false → app needs a one-time link/mapping
      fields:      Object.keys(ir.fields).length,
      collections: Object.fromEntries(
        Object.entries(ir.collections).map(([k, c]) => [k, c.rows.length]),
      ),
      warnings:    ir.source?.warnings || [],
      validation,
    });
  } catch (err) {
    console.error('[v1/ingest]', err);
    return res.status(500).json({ error: err.message || 'Ingestion failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/plan  — DEV-ONLY plan switch (stand-in for Stripe checkout)
//
// Lets a signed-in user set their own team's plan, so the full gating
// experience is testable before billing exists. Guarded by an env flag and
// DISABLED unless ALLOW_PLAN_SELF_SERVICE=true — in production the Stripe
// webhook is the only thing that may write teams.plan.
//
// Body: { plan: 'free' | 'pro' | 'business' }
// ─────────────────────────────────────────────────────────────────────────────

app.post('/v1/plan', async (req, res) => {
  if (process.env.ALLOW_PLAN_SELF_SERVICE !== 'true') {
    return res.status(403).json({ error: 'Plan changes are handled through billing.' });
  }
  try {
    const ctx = await resolveTeamFromJwt(req.headers.authorization);
    if (!ctx) return res.status(401).json({ error: 'Authentication required.' });

    const plan = String(req.body?.plan || '').toLowerCase();
    if (!PLAN_ORDER.includes(plan)) {
      return res.status(400).json({ error: `plan must be one of: ${PLAN_ORDER.join(', ')}` });
    }

    const sb = getSupabaseAdmin();
    if (!sb) return res.status(503).json({ error: 'Server not configured for Supabase.' });

    const { error } = await sb.from('teams').update({ plan }).eq('id', ctx.teamId);
    if (error) throw error;

    return res.json({ plan, name: getPlan(plan).name });
  } catch (err) {
    console.error('[v1/plan]', err);
    return res.status(500).json({ error: err.message || 'Could not change plan.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /contact
//
// Public "Contact us" form on the marketing site. Emails the submission to
// CONTACT_TO (defaults to junaid.khan@map-doc.com, which forwards to the team
// inbox) via SendGrid, with the visitor's address as Reply-To so a reply goes
// straight back to them. Unauthenticated, so it is validated, honeypot-guarded
// and lightly rate-limited per IP.
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_TO   = process.env.CONTACT_TO   || 'junaid.khan@map-doc.com';
const CONTACT_FROM = process.env.CONTACT_FROM || 'noreply@map-doc.com';
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Tiny in-memory per-IP throttle: max 5 submissions / 10 min. Resets on
// restart — enough to blunt casual abuse without a datastore.
const contactHits = new Map();
function contactRateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const recent = (contactHits.get(ip) || []).filter((t) => now - t < windowMs);
  recent.push(now);
  contactHits.set(ip, recent);
  return recent.length > 5;
}

const escapeHtml = (s) =>
  String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

app.post('/contact', async (req, res) => {
  const { name = '', email = '', message = '', company = '' } = req.body || {};

  // Honeypot: real users never see/fill the hidden "company" field.
  if (String(company).trim()) return res.json({ ok: true });

  const cleanName    = String(name).trim();
  const cleanEmail   = String(email).trim();
  const cleanMessage = String(message).trim();

  if (!cleanName || !cleanEmail || !cleanMessage) {
    return res.status(400).json({ error: 'Name, email and message are all required.' });
  }
  if (!CONTACT_EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (cleanName.length > 120 || cleanMessage.length > 5000) {
    return res.status(400).json({ error: 'That message is too long.' });
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    console.error('[contact] SENDGRID_API_KEY not set');
    return res.status(503).json({ error: 'Contact form is not configured yet.' });
  }

  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')
    .split(',')[0]
    .trim();
  if (contactRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many messages — please try again in a little while.' });
  }

  try {
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      to: CONTACT_TO,
      from: CONTACT_FROM, // must be a SendGrid-authenticated sender/domain
      replyTo: { email: cleanEmail, name: cleanName },
      subject: `New contact message from ${cleanName}`,
      text: `Name: ${cleanName}\nEmail: ${cleanEmail}\n\n${cleanMessage}`,
      html:
        `<p><strong>Name:</strong> ${escapeHtml(cleanName)}<br>` +
        `<strong>Email:</strong> ${escapeHtml(cleanEmail)}</p>` +
        `<p style="white-space:pre-wrap">${escapeHtml(cleanMessage)}</p>`,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[contact]', err?.response?.body || err);
    return res.status(502).json({ error: 'Could not send your message. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));