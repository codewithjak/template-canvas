'use strict';

/**
 * lib/templateAssembly.js
 *
 * Server-side equivalent of the browser's "press generate" assembly step.
 *
 * In the app the BROWSER takes the loaded template, the saved mapping and the
 * parsed data and assembles the one payload the renderers want (see
 * TemplateCanvas.tsx → exportPages, then dataSourceService → generatePayload).
 * The API has only `templateId` + `data`, so this module rebuilds that same
 * payload from persisted state instead:
 *
 *   body_json  (templates.body_json)        → page elements, headers/footers, size
 *   bindings   (template_bindings.*)         → field / collection / table mappings
 *   ir         (parsed from the pushed data) → the values
 *
 * It deliberately produces the exact shape `normalisePayload` consumes and then
 * delegates to it, so the API path and the browser path render identically.
 *
 * Pure: no I/O, no DB, no HTTP. Callers load the rows and pass them in.
 */

const { normalisePayload } = require('./normalisePayload');
const { buildRowIr } = require('./buildRowIr');

/**
 * Mapping blob for a template, with camelCase keys the renderers expect.
 * @typedef {Object} TemplateBindings
 * @property {object} fieldMapping
 * @property {object} collectionMappings
 * @property {object} tableCollectionBindings
 */

/**
 * Turn a saved TemplateDocument's pages into the per-page export entries
 * `normalisePayload` expects. Mirrors the browser exactly: each page carries
 * its own elements/header/footer, and the (already merged) mapping blob is
 * attached to every page — normalisePayload merges them back into one.
 *
 * @param {object} bodyJson  templates.body_json (a TemplateDocument)
 * @param {TemplateBindings} bindings
 */
function buildExportPages(bodyJson, bindings) {
  const pages = Array.isArray(bodyJson && bodyJson.pages) ? bodyJson.pages : [];
  return pages.map((page) => ({
    templateElements:        Array.isArray(page.elements) ? page.elements : [],
    header:                  page.header || null,
    footer:                  page.footer || null,
    fieldMapping:            bindings.fieldMapping,
    tableCollectionBindings: bindings.tableCollectionBindings,
    collectionMappings:      bindings.collectionMappings,
  }));
}

/**
 * Assemble the renderer args (the genArgs the browser would have sent) from
 * stored template + bindings + a parsed IR.
 *
 * @param {object} args
 * @param {object} args.bodyJson  templates.body_json
 * @param {TemplateBindings} args.bindings
 * @param {object} args.ir        CanonicalDocument (fields + collections)
 * @returns {object} normalised payload: { ir, templateElements, fieldMapping,
 *   tableCollectionBindings, collectionMappings, pageConfigs, pageSize }
 */
function assembleGenArgs({ bodyJson, bindings, ir }) {
  return normalisePayload({
    ir,
    pages:    buildExportPages(bodyJson, bindings),
    pageSize: (bodyJson && bodyJson.pageSize) || null,
  });
}

/**
 * Optionally narrow the IR to a single driver row, exactly as single-document
 * export does (backend/index.js → /generate-document). Returns the IR
 * unchanged when no driver collection is requested or it has no rows, so static
 * templates and single-record payloads pass straight through.
 *
 * @param {object} ir
 * @param {object} [opts]
 * @param {string} [opts.driverCollectionKey]
 * @param {number|string} [opts.rowIndex]
 * @param {object} [opts.relatedCollections]
 */
function scopeIrToRow(ir, opts = {}) {
  const key = String(opts.driverCollectionKey || '').trim().toLowerCase();
  const rows = key ? ir.collections[key] && ir.collections[key].rows : null;
  if (!key || !rows || rows.length === 0) return ir;

  const requested = parseInt(opts.rowIndex == null ? '0' : opts.rowIndex, 10) || 0;
  const index = Math.min(Math.max(0, requested), rows.length - 1);
  return buildRowIr(ir, key, rows[index], index, opts.relatedCollections || {});
}

module.exports = { assembleGenArgs, buildExportPages, scopeIrToRow };
