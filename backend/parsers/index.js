/**
 * backend/parsers/index.js
 *
 * Routes any incoming data source to the correct parser.
 * Always returns a validated CanonicalDocument. Nothing else.
 *
 * Exports
 * ───────
 *   parseDataSource(input, mimeType, opts?) → CanonicalDocument
 *   validateBindings(templateElements, ir, fieldMapping?) → { valid, missingFields, missingCollections }
 */

'use strict';

const { parseSheet }                 = require('./sheetParser');
const { parseJsonBuffer, parseJson } = require('./jsonParser');

function isExcelOrCsv(mimeType) {
  const t = mimeType.toLowerCase();
  return (
    t.includes('spreadsheetml') ||
    t.includes('ms-excel')      ||
    t.includes('excel')         ||
    t.includes('csv')           ||
    t.includes('text/plain')
  );
}

function isJson(mimeType) {
  return mimeType.toLowerCase().includes('json');
}

/**
 * @param {Buffer|string|object} input
 * @param {string} mimeType
 * @param {{ fileName?: string }} [opts]
 * @returns {CanonicalDocument}
 */
function parseDataSource(input, mimeType = '', opts = {}) {
  if (isExcelOrCsv(mimeType)) {
    return parseSheet(Buffer.isBuffer(input) ? input : Buffer.from(input), opts);
  }

  if (isJson(mimeType)) {
    if (Buffer.isBuffer(input) || typeof input === 'string') return parseJsonBuffer(input, opts);
    return parseJson(input, opts);
  }

  if (input !== null && typeof input === 'object' && !Buffer.isBuffer(input)) {
    return parseJson(input, opts);
  }

  if (Buffer.isBuffer(input)) {
    try { return parseSheet(input, opts); } catch (e) {
      console.warn('[parseDataSource] Excel fallback failed:', e.message);
    }
  }

  if (typeof input === 'string') {
    try { return parseJsonBuffer(input, opts); } catch (e) {
      console.warn('[parseDataSource] JSON fallback failed:', e.message);
    }
  }

  throw new Error(
    `Cannot parse data source: unrecognised type "${typeof input}" with MIME "${mimeType}".`
  );
}

/**
 * Validate all {{placeholder}} tokens and table collection keys against the IR.
 * Call before PDF generation to surface missing bindings explicitly.
 *
 * @param {object[]} templateElements
 * @param {CanonicalDocument} ir
 * @param {Record<string,string>} [fieldMapping]
 * @returns {{ valid: boolean, missingFields: object[], missingCollections: object[] }}
 */
function validateBindings(templateElements, ir, fieldMapping = {}) {
  const missingFields      = [];
  const missingCollections = [];
  const placeholderRe      = /\{\{([^}]+)\}\}/g;

  for (const el of templateElements) {
    const textContent = el.content || el.src || el.value || '';
    if (typeof textContent === 'string') {
      let match;
      while ((match = placeholderRe.exec(textContent)) !== null) {
        const key       = match[1].trim();
        const mappedKey = fieldMapping[key] || key;
        const found     = mappedKey in ir.fields ||
          mappedKey.split('.').reduce(
            (o, k) => (o != null && typeof o === 'object' ? o[k] : undefined),
            ir.fields
          ) != null;
        if (!found) missingFields.push({ placeholder: key, resolvedKey: mappedKey });
      }
    }

    if (el.type === 'table') {
      const collKey = (el.binding?.collectionKey || '').trim().toLowerCase();
      if (collKey && !(collKey in ir.collections)) {
        missingCollections.push({ elementId: el.id, collectionKey: collKey });
      }
    }
  }

  return {
    valid: missingFields.length === 0 && missingCollections.length === 0,
    missingFields,
    missingCollections,
  };
}

module.exports = { parseDataSource, validateBindings };