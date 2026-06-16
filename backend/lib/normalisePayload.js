'use strict';

/**
 * normalisePayload.js
 *
 * Takes the raw request body for a generate call and flattens it into one tidy
 * shape the renderers understand. The app sends one entry per page; this:
 *   - stacks every page's elements into a single list, shifting each page's
 *     elements down by one page-height so they land on the right page, and
 *   - merges the per-page field mappings / bindings into single objects,
 *     lower-casing keys so lookups are case-insensitive.
 */

const {
  normalizeCollectionKeys,
  normalizeBindingKeys,
  normalizeCollectionMappings,
} = require('./normalizeKeys');

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

module.exports = { normalisePayload, CANVAS_PAGE_H };
