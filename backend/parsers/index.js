/**
 * parsers/index.js
 *
 * Single entry-point that routes any incoming data source to the correct
 * format-specific parser and always returns the same normalized shape:
 *
 *   {
 *     metadata:    Record<string, string>
 *     collections: Record<string, { headers: string[], rows: object[] }>
 *   }
 *
 * CHANGES FROM PREVIOUS VERSION
 * ─────────────────────────────
 * 1. normalizeOutput() validates and repairs every parser's return value so
 *    downstream callers (pdfRenderer, mappingEngine) can trust the shape.
 *    Previously a parser returning { metadata: null } or omitting "headers"
 *    would cause silent NaN / undefined values that showed up only in the PDF.
 *
 * 2. Collection key normalization: all keys are lowercased and trimmed so
 *    "Items", "items", " items " all resolve to "items".  This closes the
 *    silent mismatch between tableCollectionBindings keys (set by the UI)
 *    and parser output keys (set by the file's sheet name / JSON key).
 *
 * 3. Row value coercion: every cell value is cast to string so
 *    replacePlaceholders / resolveCellValue never receives undefined or
 *    numeric values that would print as "[object Object]".
 *
 * 4. Explicit error messages: instead of silently falling through to a
 *    generic throw, each failed fallback logs a reason so engineers can
 *    identify which parser rejected which input.
 */

const { parseSheet }                  = require('./sheetParser');
const { parseJsonBuffer, parseJson }  = require('./jsonParser');

// ── Schema normalization ─────────────────────────────────────────────────────

/**
 * Guarantees the output of every parser conforms to the contract:
 *
 *   {
 *     metadata:    Record<string, string>          — flat key/value map
 *     collections: Record<string,                  — one entry per table
 *       { headers: string[], rows: object[] }
 *     >
 *   }
 *
 * Fixes common parser mistakes in-place:
 *   • metadata  null/undefined → {}
 *   • collection values        → {headers:[], rows:[]}
 *   • collection keys          → lowercased + trimmed
 *   • row cell values          → coerced to string
 */
function normalizeOutput(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Parser returned a non-object result.');
  }

  // ── metadata ──
  const metadata = (raw.metadata && typeof raw.metadata === 'object')
    ? raw.metadata
    : {};

  // Coerce all metadata values to string
  for (const [k, v] of Object.entries(metadata)) {
    metadata[k] = v != null ? String(v) : '';
  }

  // ── collections ──
  const rawCollections = (raw.collections && typeof raw.collections === 'object')
    ? raw.collections
    : {};

  const collections = {};
  for (const [rawKey, col] of Object.entries(rawCollections)) {
    const key = rawKey.trim().toLowerCase();

    const headers = Array.isArray(col?.headers)
      ? col.headers.map(h => (h != null ? String(h) : ''))
      : [];

    const rows = Array.isArray(col?.rows)
      ? col.rows.map(row => {
          if (!row || typeof row !== 'object') return {};
          const normalized = {};
          for (const [ck, cv] of Object.entries(row)) {
            normalized[ck] = cv != null ? String(cv) : '';
          }
          return normalized;
        })
      : [];

    collections[key] = { headers, rows };
  }

  return { metadata, collections };
}

// ── Router ───────────────────────────────────────────────────────────────────

/**
 * @param {Buffer|string|object} input
 * @param {string} mimeType  — MIME type hint (e.g. "text/csv", "application/json")
 * @returns {{ metadata: Record<string,string>, collections: Record<string,{headers:string[], rows:object[]}> }}
 */
function parseDataSource(input, mimeType = '') {
  const type = mimeType.toLowerCase();

  // ── Excel / CSV ────────────────────────────────────────────────────────────
  if (
    type.includes('spreadsheetml') ||  // .xlsx
    type.includes('ms-excel')       ||  // .xls
    type.includes('excel')          ||
    type.includes('csv')            ||
    type.includes('text/plain')         // plain-text CSVs
  ) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
    return normalizeOutput(parseSheet(buf));
  }

  // ── JSON ───────────────────────────────────────────────────────────────────
  if (type.includes('json')) {
    if (Buffer.isBuffer(input) || typeof input === 'string') {
      return normalizeOutput(parseJsonBuffer(input));
    }
    return normalizeOutput(parseJson(input));
  }

  // ── Pre-parsed JS object / API response ───────────────────────────────────
  if (input !== null && typeof input === 'object' && !Buffer.isBuffer(input)) {
    return normalizeOutput(parseJson(input));
  }

  // ── Fallback: try Excel for any binary buffer ──────────────────────────────
  if (Buffer.isBuffer(input)) {
    try {
      return normalizeOutput(parseSheet(input));
    } catch (e) {
      console.warn('[parseDataSource] Excel fallback failed:', e.message);
    }
  }

  // ── Fallback: try JSON for any string ─────────────────────────────────────
  if (typeof input === 'string') {
    try {
      return normalizeOutput(parseJsonBuffer(input));
    } catch (e) {
      console.warn('[parseDataSource] JSON fallback failed:', e.message);
    }
  }

  throw new Error(
    `Cannot parse data source: unrecognised input type "${typeof input}" with MIME "${mimeType}".`
  );
}

module.exports = { parseDataSource };