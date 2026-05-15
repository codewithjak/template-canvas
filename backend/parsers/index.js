/**
 * parsers/index.js
 * Single entry-point that routes any incoming data source to the correct
 * format-specific parser and always returns the same normalized shape:
 *
 *   {
 *     metadata:    Record<string, string>
 *     collections: Record<string, { headers: string[], rows: object[] }>
 *   }
 *
 * Callers never need to know which parser ran.
 */

const { parseSheet } = require('./sheetParser');
const { parseJsonBuffer, parseJson } = require('./jsonParser');

/**
 * @param {Buffer|string|object} input
 * @param {string} mimeType   – MIME type hint (e.g. "text/csv", "application/json")
 * @returns {{ metadata, collections }}
 */
function parseDataSource(input, mimeType = '') {
  const type = mimeType.toLowerCase();

  // ── Excel / CSV ──────────────────────────────────────────────────────────
  if (
    type.includes('spreadsheetml') ||   // .xlsx
    type.includes('ms-excel') ||         // .xls
    type.includes('excel') ||
    type.includes('csv') ||
    type.includes('text/plain')          // plain text CSVs
  ) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return parseSheet(buf);
  }

  // ── JSON ─────────────────────────────────────────────────────────────────
  if (type.includes('json')) {
    if (Buffer.isBuffer(input) || typeof input === 'string') {
      return parseJsonBuffer(input);
    }
    return parseJson(input);
  }

  // ── API response (pre-parsed JS object / array) ───────────────────────────
  if (input !== null && typeof input === 'object' && !Buffer.isBuffer(input)) {
    return parseJson(input);
  }

  // ── Fallback: try Excel parser for any binary buffer ──────────────────────
  if (Buffer.isBuffer(input)) {
    try {
      return parseSheet(input);
    } catch (_) {
      // fall through
    }
  }

  // ── Fallback: try JSON for any string ─────────────────────────────────────
  if (typeof input === 'string') {
    try {
      return parseJsonBuffer(input);
    } catch (_) {
      // fall through
    }
  }

  throw new Error(`Cannot parse data source with MIME type "${mimeType}".`);
}

module.exports = { parseDataSource };