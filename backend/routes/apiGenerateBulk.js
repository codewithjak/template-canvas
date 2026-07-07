'use strict';

/**
 * routes/apiGenerateBulk.js
 *
 * POST /v1/generate/bulk — async, API-key-authed BULK document generation.
 *
 * The headless sibling of the browser's "bulk export": an external caller (or a
 * connector like n8n/Zapier/Make) sends one `templateId` plus a `data` payload
 * whose driver collection holds N rows, and the server fans that collection out
 * into one document per row — Mode A ("500 records → 1 template"). It returns a
 * `jobId` immediately and fires the `bulk.completed` webhook (with a presigned
 * zip URL) when the job finishes.
 *
 * This reuses the EXACT same engine the browser uses: it assembles the same
 * renderer args via lib/templateAssembly, registers a job in the shared
 * lib/bulkJobs registry, and calls runBulkJob — identical fan-out, S3
 * persistence, retries, and webhook dispatch. The only differences from the
 * browser path are API-key auth (vs JWT) and that the render inputs come from
 * the stored template + bindings (vs the browser's `pages`).
 *
 * NOTE: heterogeneous batches ("10 records → 10 different templates") are NOT a
 * server concern — that is expressed as an n8n/Zapier workflow that loops over
 * the single-document POST /v1/generate, once per record with its own
 * templateId. This endpoint deliberately covers only the single-template
 * fan-out. See WEBHOOK_CONNECTOR_ARCHITECTURE.md, Step 1.
 *
 * Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');
const path    = require('path');
const { v4: uuidv4 } = require('uuid');

const { parseDataSource } = require('../parsers/index');
const { checkExportAllowedForTeam } = require('../usage');
const { logExportEventForTeam } = require('../analytics');
const { httpError, sendError, requireApiTeam } = require('../lib/apiAuth');
const { loadTemplate, loadBindings } = require('../lib/templateStore');
const { assembleGenArgs } = require('../lib/templateAssembly');
const { extForFormat, sanitizeZipName } = require('../lib/fileNames');
const { jobs, JOBS_DIR, runBulkJob } = require('../lib/bulkJobs');

const router = express.Router();

/**
 * Resolve which parsed collection drives the fan-out. Honors an explicit
 * `driverCollectionKey`; otherwise auto-detects when the choice is unambiguous
 * (a single collection, or the `items` collection a bare JSON array produces).
 * Throws a friendly httpError listing the options when it can't decide.
 *
 * @param {object} collections  normalised ir.collections (keys already lowercased)
 * @param {string} [requested]
 * @returns {string} the resolved collection key
 */
function resolveDriverKey(collections, requested) {
  const keys = Object.keys(collections || {});
  const asked = String(requested || '').trim().toLowerCase();

  if (asked) {
    if (!collections[asked]) {
      throw httpError(400, `Bulk collection "${asked}" not found. Available: ${keys.join(', ') || '(none)'}.`);
    }
    return asked;
  }

  if (keys.length === 1) return keys[0];
  if (collections.items) return 'items';

  throw httpError(
    400,
    keys.length === 0
      ? 'No collection found in "data" to generate in bulk. Send an array of records (or a driver collection).'
      : `"driverCollectionKey" is required — "data" has multiple collections: ${keys.join(', ')}.`,
  );
}

// ── POST /v1/generate/bulk ────────────────────────────────────────────────────
//
// Body: {
//   templateId: <uuid>,            required
//   data:       <any JSON>,        required — same shape /v1/ingest accepts;
//                                   its driver collection holds the N records
//   driverCollectionKey?: string   collection to fan out over (auto-detected
//                                   when there is exactly one, or an `items` array)
//   format?:    'pdf'|'zpl'|'png'|'jpeg'   (default 'pdf')
//   fileNameTemplate?: string      per-file name, supports {{__index}} + fields
//   zipFileName?:      string      name of the returned zip
//   relatedCollections?: object    extra collections to expose per row
//   dpi?, jpegQuality?             image formats only
// }
// Auth: X-API-Key: tc_live_…  (or Authorization: Bearer tc_live_…)
//
// Returns { jobId } immediately; the zip is delivered via the `bulk.completed`
// webhook (or polled at GET /bulk-jobs/:jobId/status + /download).
router.post('/v1/generate/bulk', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);

    const { templateId, data } = req.body || {};
    if (!templateId)        throw httpError(400, '"templateId" is required.');
    if (data === undefined) throw httpError(400, '"data" is required.');

    const format = String(req.body.format || 'pdf').toLowerCase();

    // Stored design + saved mapping (tenant-checked), same as /v1/generate.
    const template = await loadTemplate(sb, teamId, templateId);
    const bindings = await loadBindings(sb, teamId, templateId);

    // Parse the pushed data exactly like /v1/ingest and /v1/generate do.
    let ir;
    try {
      ir = parseDataSource(data, 'application/json');
    } catch (e) {
      throw httpError(422, `Could not parse data: ${e.message}`);
    }

    // Assemble the same renderer args the browser builds. `normalised.ir`
    // carries the normalised (lowercased) collection keys the engine fans over.
    const normalised = assembleGenArgs({ bodyJson: template.body_json, bindings, ir });

    const driverCollectionKey = resolveDriverKey(normalised.ir.collections, req.body.driverCollectionKey);
    const rows = normalised.ir.collections[driverCollectionKey].rows || [];
    if (rows.length === 0) {
      throw httpError(400, `Bulk collection "${driverCollectionKey}" has no rows.`);
    }
    const total = rows.length;

    // Same entitlement gate as the browser bulk path — bulk capability, per-job
    // row ceiling, and the monthly export cap — evaluated for the key's team.
    const gate = await checkExportAllowedForTeam({ teamId, mode: 'bulk_async', rows: total, format });
    if (!gate.allowed) throw httpError(gate.status, gate.error);

    const fileExt          = extForFormat(format);
    const fileNameTemplate = String(req.body.fileNameTemplate || `document-{{__index}}${fileExt}`);
    const zipFileName      = sanitizeZipName(req.body.zipFileName || 'documents.zip', 'documents.zip');
    const relatedCollections = req.body.relatedCollections || {};

    const jobId   = uuidv4();
    const zipPath = path.join(JOBS_DIR, `${jobId}.zip`);

    // Identical job-record shape the browser endpoint stashes, so the shared
    // engine (lib/bulkJobs.runBulkJob) runs the fan-out loop unchanged.
    jobs.set(jobId, {
      status: 'running', current: 0, total, zipPath, zipFileName, createdAt: Date.now(),
      teamId, source: 'api',
      rows, driverCollectionKey, relatedCollections,
      ir: normalised.ir,
      templateElements:        normalised.templateElements,
      fieldMapping:            normalised.fieldMapping,
      tableCollectionBindings: normalised.tableCollectionBindings,
      collectionMappings:      normalised.collectionMappings,
      pageConfigs:             normalised.pageConfigs,
      pageSize:                normalised.pageSize,
      format, fileExt,
      dpi:         parseInt(req.body.dpi, 10) || undefined,
      jpegQuality: req.body.jpegQuality,
      fileNameTemplate, gate,
    });

    logExportEventForTeam(teamId, { format, mode: 'bulk_async', rows: total, source: 'api' });

    // Kick off the job; deliver the jobId now, the zip via bulk.completed later.
    res.status(202).json({ jobId, rows: total });
    runBulkJob(jobId);
  } catch (err) {
    return sendError(res, '[v1/generate/bulk]', err);
  }
});

module.exports = router;
