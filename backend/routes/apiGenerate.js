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
 * SELF-CONTAINED BY DESIGN. It only *calls* existing exported helpers; it does
 * not modify usage.js / analytics.js / teamApi.js. A few small things are
 * therefore restated locally (the API-key auth sequence, the export
 * entitlement check, the usage-log insert). Those are deliberate, temporary
 * duplications — see API_GENERATE_REFACTOR_NOTES.md for how they should be
 * consolidated once we choose to touch the shared modules.
 *
 * Mounted by index.js (one additive `app.use` line).
 */

const express = require('express');

const { parseDataSource } = require('../parsers/index');
const { planAllows, minPlanFor, getPlan } = require('../plans');
const { getTeamPlan, getPlanLimits, getMonthlyExportCount } = require('../usage');
const { httpError, sendError, requireApiTeam } = require('../lib/apiAuth');
const { assembleGenArgs, scopeIrToRow } = require('../lib/templateAssembly');
const { buildExportArtifact } = require('../lib/exportArtifact');
const { dispatchWebhook } = require('../webhooks/dispatch');

const router = express.Router();

// ── Stored-state loaders (tenant-scoped) ────────────────────────────────────────

/** Load the template's design, asserting it belongs to the key's team. */
async function loadTemplate(sb, teamId, templateId) {
  const { data, error } = await sb
    .from('templates')
    .select('id, team_id, body_json')
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.team_id !== teamId) throw httpError(404, 'Template not found for this team.');
  return data;
}

/** Load the saved mapping blob, normalised to the camelCase keys assembly wants. */
async function loadBindings(sb, teamId, templateId) {
  const { data } = await sb
    .from('template_bindings')
    .select('field_mapping, collection_mappings, table_collection_bindings')
    .eq('team_id', teamId)
    .eq('template_id', templateId)
    .maybeSingle();
  return {
    fieldMapping:            (data && data.field_mapping)             || {},
    collectionMappings:      (data && data.collection_mappings)       || {},
    tableCollectionBindings: (data && data.table_collection_bindings) || {},
  };
}

// ── Entitlement (export caps + watermark) ───────────────────────────────────────
//
// A trimmed, single-document restatement of usage.checkExportAllowed for the
// key path (which has a teamId, not a JWT). See refactor notes.

/** Throw if `format` needs a capability the plan lacks. */
function assertFormatAllowed(plan, format) {
  if (format === 'zpl' && !planAllows(plan, 'zpl')) {
    const name = getPlan(minPlanFor('zpl') || 'business').name;
    throw httpError(403, `ZPL / label export requires the ${name} plan.`);
  }
}

/** Throw if generating one more document would exceed the monthly cap. */
async function assertUnderMonthlyCap(teamId, plan) {
  const limit = getPlanLimits(plan).maxExportsPerMonth;
  if (limit == null) return;
  const used = await getMonthlyExportCount(teamId);
  if (used + 1 > limit) {
    throw httpError(402, `Monthly export limit reached (${limit}).`);
  }
}

/** Resolve the team's plan and confirm a single export is allowed. */
async function checkEntitlement(teamId, format) {
  const plan = await getTeamPlan(teamId);
  assertFormatAllowed(plan, format);
  await assertUnderMonthlyCap(teamId, plan);
  // Free/legacy plans get a watermark; api capability is Business-only today, so
  // this is effectively always false here, but kept general.
  return { plan, watermark: !planAllows(plan, 'cleanExport') };
}

// ── Usage logging (fire-and-forget, team-attributed) ─────────────────────────────

/** Append a pdf_exported event for the team (user_id null on the API path). */
function logExport(sb, teamId, metadata) {
  sb.from('analytics_events')
    .insert({ team_id: teamId, user_id: null, event_type: 'pdf_exported', metadata })
    .then(() => {}, (err) => console.warn('[v1/generate] usage log failed:', err.message));
}

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
    const gate = await checkEntitlement(teamId, format);

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

    logExport(sb, teamId, { format, mode: 'single', source: 'api' });

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
