'use strict';

/**
 * lib/exportArtifact.js
 *
 * Turns a render request into ONE deliverable artifact: { buffer, fileName,
 * contentType }. It reuses renderDocEntries (the same per-format renderer bulk
 * uses, watermarking included) so email delivery stays consistent with export:
 *   - pdf / zpl / single-page image -> the file itself
 *   - multi-page image              -> the pages zipped into one buffer
 *
 * Pure-ish: the only I/O is rendering. No HTTP, no email knowledge.
 */

const archiver = require('archiver');
const { renderDocEntries } = require('./renderDocEntries');
const { sanitizeFileName, withPageSuffix } = require('./fileNames');

const CONTENT_TYPES = {
  '.pdf': 'application/pdf',
  '.zpl': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.zip': 'application/zip',
};

/** MIME type for a file extension, defaulting to a generic binary type. */
function contentTypeForExt(ext) {
  return CONTENT_TYPES[String(ext).toLowerCase()] || 'application/octet-stream';
}

/** Drop a trailing extension from a file name, if present. */
function stemOf(name, ext) {
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name.slice(0, -ext.length) : name;
}

/** Collect an archiver zip stream into a single in-memory Buffer. */
function zipEntriesToBuffer(entries, stem) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { store: true });
    const chunks = [];
    archive.on('data', (chunk) => chunks.push(chunk));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    for (const e of entries) {
      archive.append(e.buffer, { name: withPageSuffix(stem + e.ext, e.ext, e.pageIndex, e.multi) });
    }
    archive.finalize();
  });
}

/** Render to a single deliverable artifact. */
async function buildExportArtifact({ format, genArgs, gate, dpi, jpegQuality, outputFileName }) {
  const entries = await renderDocEntries({ format, genArgs, gate, dpi, jpegQuality });
  const ext     = entries[0].ext;
  const base    = sanitizeFileName(outputFileName || 'document', `document${ext}`, ext);

  if (entries.length === 1) {
    return { buffer: entries[0].buffer, fileName: base, contentType: contentTypeForExt(ext) };
  }

  const stem      = stemOf(base, ext);
  const zipBuffer = await zipEntriesToBuffer(entries, stem);
  return { buffer: zipBuffer, fileName: `${stem}.zip`, contentType: 'application/zip' };
}

module.exports = { buildExportArtifact, contentTypeForExt };
