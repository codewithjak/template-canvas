'use strict';

/**
 * routes/apiGenerate.js
 *
 * POST /v1/generate — synchronous, API-key-authed document generation.
 *
 * This is the headless sibling of the browser's "press generate": an external
 * caller (or a connector like Zapier) sends only `templateId` + `data`, and the
 * server assembles the same renderer args the browser would and returns the
 * rendered file. See WEBHOOK_CONNECTOR_ARCHITECTURE.md, Step 1.
 *
 * Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');

const { parseDataSource } = require('../parsers/index');
const { checkExportAllowedForTeam } = require('../usage');
const { logExportEventForTeam } = require('../analytics');
const { httpError, sendError, requireApiTeam } = require('../lib/apiAuth');
const { loadTemplate, loadBindings } = require('../lib/templateStore');
const { assembleGenArgs, scopeIrToRow } = require('../lib/templateAssembly');
const { buildExportArtifact } = require('../lib/exportArtifact');
const { dispatchWebhook } = require('../webhooks/dispatch');

const router = express.Router();

// ── Route ───────────────────────────────────────────────────────────────────────
//
// Body: {
//   templateId: <uuid>,            required
//   data:       <any JSON>,        required — same shape /v1/ingest accepts
//   format?:    'pdf'|'zpl'|'png'|'jpeg'   (default 'pdf')
//   fileName?:  string             (default 'document')
//   driverCollectionKey?, rowIndex?, relatedCollections?   — optional row scoping
//   dpi?, jpegQuality?             — image formats only
// }
// Auth: X-API-Key: tc_live_…  (or Authorization: Bearer tc_live_…)
//
// Returns the rendered file (pdf/zpl/image, or a zip for multi-page images).

router.post('/v1/generate', async (req, res) => {
  try {
    const { teamId, sb } = await requireApiTeam(req);

    const { templateId, data } = req.body || {};
    if (!templateId)        throw httpError(400, '"templateId" is required.');
    if (data === undefined) throw httpError(400, '"data" is required.');

    const format = String(req.body.format || 'pdf').toLowerCase();

    // Resolve plan + entitlement BEFORE doing any rendering work.
    const gate = await checkExportAllowedForTeam({ teamId, mode: 'single', rows: 1, format });
    if (!gate.allowed) throw httpError(gate.status, gate.error);

    // Stored design + saved mapping (tenant-checked).
    const template = await loadTemplate(sb, teamId, templateId);
    const bindings = await loadBindings(sb, teamId, templateId);

    // Parse the pushed data exactly like /v1/ingest does.
    let ir;
    try {
      ir = parseDataSource(data, 'application/json');
    } catch (e) {
      throw httpError(422, `Could not parse data: ${e.message}`);
    }

    // Assemble the same renderer args the browser would, then render one file.
    const scopedIr = scopeIrToRow(ir, {
      driverCollectionKey: req.body.driverCollectionKey,
      rowIndex:            req.body.rowIndex,
      relatedCollections:  req.body.relatedCollections,
    });
    const genArgs = assembleGenArgs({ bodyJson: template.body_json, bindings, ir: scopedIr });

    const artifact = await buildExportArtifact({
      format,
      genArgs,
      gate,
      outputFileName: req.body.fileName || 'document',
      dpi:            parseInt(req.body.dpi, 10) || undefined,
      jpegQuality:    req.body.jpegQuality,
    });

    logExportEventForTeam(teamId, { format, mode: 'single', source: 'api' });

    // Notify subscribers that a document was generated. Fire-and-forget: the
    // file is the response, so this must never delay or fail the request.
    dispatchWebhook(teamId, 'document.generated', {
      event:      'document.generated',
      teamId,
      templateId,
      format,
      fileName:   artifact.fileName,
      bytes:      artifact.buffer.length,
      createdAt:  new Date().toISOString(),
    });

    res.set({
      'Content-Type':        artifact.contentType,
      'Content-Disposition': `attachment; filename="${artifact.fileName}"`,
    });
    return res.send(artifact.buffer);
  } catch (err) {
    return sendError(res, '[v1/generate]', err);
  }
});

module.exports = router;
