/**
 * parsers/jsonParser.js  (v2 — scalable rewrite)
 *
 * Parses JSON data (from file upload or API response) into a CanonicalDocument IR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SUPPORTED INPUT SHAPES
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  1. Flat object
 *     { "name": "Acme", "total": 1000 }
 *     → ir.fields = { "name": "Acme", "total": "1000" }
 *
 *  2. Array of objects (pure collection)
 *     [ { id: 1, … }, { id: 2, … } ]
 *     → ir.collections.items = { columns: [...], rows: [...] }
 *
 *  3. Mixed object (flat scalars + array fields)
 *     { "company": "Acme", "lines": [ … ] }
 *     → ir.fields = { "company": "Acme" }
 *       ir.collections.lines = { … }
 *
 *  4. Deeply nested object
 *     { "invoice": { "no": "INV-001" }, "lines": [ … ] }
 *     → ir.fields = { "invoice.no": "INV-001" }   ← dot notation
 *       ir.collections.lines = { … }
 *
 *  5. Nested collections (array inside nested object)
 *     { "data": { "rows": [ … ] } }
 *     → ir.collections["data.rows"] = { … }
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KEY NAMING
 * ══════════════════════════════════════════════════════════════════════════
 *  Scalar fields use dot-notation paths matching their JSON structure.
 *  Resolver.js step-1 (literal key lookup) handles these directly —
 *  no special resolver logic is needed.
 *
 *  Template {{placeholder}} must match the dot-path:
 *    JSON:     { "company": { "name": "Acme" } }
 *    Key:      "company.name"
 *    Template: {{company.name}}
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OUTPUT
 * ══════════════════════════════════════════════════════════════════════════
 *  Returns a validated CanonicalDocument (throws on contract violation).
 */

const { createIR, validateIR } = require('../types/canonicalDocument');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function cellStr(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Normalize an array of objects into a Collection.
 * Arrays of primitives (strings, numbers) are skipped — they can't be tables.
 *
 * @returns {{ columns: string[], rows: object[] } | null}
 */
function normalizeCollection(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const objects = arr.filter(
    item => item !== null && typeof item === 'object' && !Array.isArray(item)
  );
  if (objects.length === 0) return null;

  // Union of all keys across all rows (preserves insertion order of first row)
  const colSet = new Set();
  objects.forEach(obj => Object.keys(obj).forEach(k => colSet.add(k)));
  const columns = Array.from(colSet);

  const rows = objects.map(obj => {
    const row = {};
    columns.forEach(col => {
      const v = obj[col];
      // Nested objects inside a table cell: stringify rather than silently drop
      row[col] = cellStr(v);
    });
    return row;
  });

  return { columns, rows };
}

/**
 * Recursively walk an object, routing values to ir.fields or ir.collections.
 *
 * @param {object}   obj
 * @param {string}   prefix         - dot-notation path so far ('' at root)
 * @param {object}   ir             - CanonicalDocument being built
 * @param {string[]} warnings
 */
function walk(obj, prefix, ir, warnings) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      const col = normalizeCollection(value);
      if (col) {
        // Normalize collection key: lowercase, spaces → underscore
        const colKey = fullKey.toLowerCase().replace(/\s+/g, '_');
        ir.collections[colKey] = col;
      } else if (value.length > 0) {
        // Array of primitives — store as comma-separated string in fields
        ir.fields[fullKey] = value.map(cellStr).join(', ');
        warnings.push(
          `"${fullKey}" is an array of primitives — stored as comma-separated string in fields.`
        );
      }
      // Empty arrays: skip silently
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      // Recurse into nested objects
      walk(value, fullKey, ir, warnings);
    } else {
      // Scalar (string, number, boolean, Date, null)
      ir.fields[fullKey] = cellStr(value);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an already-parsed JS value (object or array) into a CanonicalDocument.
 *
 * @param {object|Array} data
 * @param {{ fileName?: string }} [options]
 * @returns {import('../types/canonicalDocument').CanonicalDocument}
 */
function parseJson(data, options = {}) {
  const warnings = [];
  const ir = createIR({ type: 'json', fileName: options.fileName, warnings });

  if (Array.isArray(data)) {
    // Root-level array → single collection named "items"
    const col = normalizeCollection(data);
    if (col) {
      ir.collections['items'] = col;
    } else {
      warnings.push('Root array contained no objects — collections will be empty.');
    }
    return validateIR(ir);
  }

  if (data === null || typeof data !== 'object') {
    throw new Error('JSON data must be an object or array at the root level.');
  }

  walk(data, '', ir, warnings);
  return validateIR(ir);
}

/**
 * Parse a raw JSON string or Buffer into a CanonicalDocument.
 *
 * @param {Buffer|string} buffer
 * @param {{ fileName?: string }} [options]
 * @returns {import('../types/canonicalDocument').CanonicalDocument}
 */
function parseJsonBuffer(buffer, options = {}) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err.message}`);
  }
  return parseJson(data, options);
}

module.exports = { parseJson, parseJsonBuffer };