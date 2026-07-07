'use strict';

/**
 * lib/bulkJobs.js
 *
 * The async bulk-generation engine, extracted from index.js so BOTH the browser
 * endpoint (`/generate-bulk-documents/async`) and the connector endpoint
 * (`/v1/generate/bulk`) drive the identical job machinery. This module is a
 * singleton: every importer shares the same `jobs` Map, so the existing
 * status/download endpoints keep reading the same records regardless of who
 * created the job.
 *
 * A job is created by the caller (each endpoint assembles render inputs its own
 * way — the browser from `normalisePayload(req.body)`, the API from stored
 * template + bindings via `assembleGenArgs`), then `runBulkJob(jobId)` fans the
 * driver collection out into one document per row, zips them, persists to S3,
 * and fires `bulk.completed` (or `bulk.failed`). Per-row failures are logged and
 * skipped (best-effort), matching the original inline behavior.
 */

const archiver = require('archiver');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const { replacePlaceholders } = require('../utils/resolver');
const { sanitizeFileName, uniqueFileName, withPageSuffix } = require('./fileNames');
const { buildRowIr }       = require('./buildRowIr');
const { renderDocEntries } = require('./renderDocEntries');
const artifactStore        = require('../storage/artifactStore');
const { dispatchWebhook }  = require('../webhooks/dispatch');

// Lifetime of presigned download URLs (webhook payloads + browser redirects).
const ARTIFACT_URL_TTL_MS = (parseInt(process.env.ARTIFACT_URL_TTL_SECONDS, 10) || 3600) * 1000;

const JOBS_DIR = path.join(os.tmpdir(), 'bulk-jobs');
fs.mkdirSync(JOBS_DIR, { recursive: true });

const jobs = new Map();

// Auto-cleanup stale jobs every 5 minutes (TTL: 30 minutes).
const JOB_TTL_MS = 30 * 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [jobId, job] of jobs) {
    if (now - (job.createdAt || 0) > JOB_TTL_MS) {
      if (job.zipPath) fs.unlink(job.zipPath, () => {});
      jobs.delete(jobId);
    }
  }
}, 5 * 60 * 1000);
// Don't let the housekeeping timer hold the event loop open on its own.
if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();

// Notify subscribers that a bulk job finished. Fire-and-forget: a presigned
// download URL is minted and the 'bulk.completed' event dispatched. Never throws.
async function notifyBulkComplete(jobId, job) {
  try {
    const { url, expiresAt } = await artifactStore.downloadTarget(jobId, {
      fileName: job.zipFileName, expiresInMs: ARTIFACT_URL_TTL_MS,
    });
    dispatchWebhook(job.teamId, 'bulk.completed', {
      event:       'bulk.completed',
      teamId:      job.teamId,
      jobId,
      rows:        job.total,
      generated:   job.current,
      downloadUrl: url,
      expiresAt,
      createdAt:   new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[bulk-async] completion notify failed:', err.message);
  }
}

/**
 * Run a bulk job to completion in the background. Reads all render inputs off
 * the job record so both the browser and API endpoints share one loop. Resolves
 * when the job is done/errored; never rejects (failures land on the job record
 * plus a `bulk.failed` webhook).
 *
 * Expected job record fields (set by the creating endpoint):
 *   status, total, current, zipPath, zipFileName, teamId,
 *   rows, driverCollectionKey, relatedCollections,
 *   ir, templateElements, fieldMapping, tableCollectionBindings,
 *   collectionMappings, pageConfigs, pageSize,
 *   format, fileExt, dpi, jpegQuality, fileNameTemplate, gate
 *
 * @param {string} jobId
 */
async function runBulkJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return;

  const {
    rows, driverCollectionKey, relatedCollections, zipPath,
    ir, templateElements, fieldMapping, tableCollectionBindings,
    collectionMappings, pageConfigs, pageSize,
    format, fileExt, dpi, jpegQuality, fileNameTemplate, gate,
  } = job;

  try {
    const output    = fs.createWriteStream(zipPath);
    const archive   = archiver('zip', { store: true });
    const usedNames = new Set();

    archive.pipe(output);

    for (let i = 0; i < rows.length; i++) {
      if (job.status === 'cancelled') break;

      const row   = rows[i] || {};
      const rowIr = buildRowIr(ir, driverCollectionKey, row, i, relatedCollections);

      try {
        const entries = await renderDocEntries({
          format, gate, dpi, jpegQuality,
          genArgs: {
            ir: rowIr,
            templateElements,
            fieldMapping,
            tableCollectionBindings,
            collectionMappings,
            pageConfigs,
            pageSize,
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

    // Persist to S3 (resilient: retries + existence check), then drop the local
    // staging copy — S3 is now the source of truth for the artifact.
    await artifactStore.put(jobId, { filePath: zipPath, contentType: 'application/zip' });
    fs.unlink(zipPath, () => {});

    job.status = 'done';
    notifyBulkComplete(jobId, job);
  } catch (err) {
    console.error('[bulk-async] job failed:', err);
    job.status  = 'error';
    job.message = err.message;
    dispatchWebhook(job.teamId, 'bulk.failed', {
      event:     'bulk.failed',
      teamId:    job.teamId,
      jobId,
      rows:      job.total,
      error:     err.message,
      createdAt: new Date().toISOString(),
    });
  }
}

module.exports = { jobs, JOBS_DIR, ARTIFACT_URL_TTL_MS, notifyBulkComplete, runBulkJob };
