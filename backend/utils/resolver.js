/**
 * utils/resolver.js  (v2)
 *
 * Resolves {{placeholder}} tokens against a CanonicalDocument's fields map,
 *
 * RESOLUTION STRATEGY
 * ───────────────────
 * The fields map uses dot-notation keys as stored by the parsers:
 *   { "company.name": "Acme", "invoice.no": "INV-001" }
 *
 * resolve(fields, "company.name") works via two steps:
 *   Step 1: Literal key lookup — "company.name" in fields → found immediately.
 *   Step 2: Dot-traversal — only needed if fields is genuinely nested.
 *           In practice the IR is always flat, so step 1 handles everything.
 *   Step 3: Return undefined if both fail (caller decides empty-string behavior).
 *
 * WHY TWO STEPS?
 * The legacy parsers stored dot-notation as literal flat keys. The new IR
 * does the same. Step 2 is a safety net for genuinely nested objects that
 * may come from an API response not routed through the IR normalizer.
 *
 * FIELD MAPPING
 * ─────────────
 * fieldMapping is an optional Record<string, string> that acts as an alias
 * table: if the template author wrote {{company_name}} but the data key is
 * "company.name", they add { "company_name": "company.name" } to fieldMapping.
 *
 * The goal is to eventually not need fieldMapping for well-structured data
 * (template placeholders match IR field keys exactly). fieldMapping remains
 * as an explicit escape hatch, not the primary lookup mechanism.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Core resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a single key against a data object.
 *
 * @param {Record<string,any>} obj    - ir.fields or a collection row
 * @param {string}             path   - the key to look up (may contain dots)
 * @returns {string|undefined}
 */
function resolve(obj, path) {
  if (obj == null || !path) return undefined;

  // Step 1: literal flat key — handles "company.name" stored as a flat key
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];

  // Step 2: dot traversal — handles genuinely nested objects
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current != null ? String(current) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder replacement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace all {{key}} tokens in a string with values from data.
 *
 * Token resolution order:
 *   1. fieldMapping[key] → aliased key → resolve(data, aliasedKey)
 *   2. resolve(data, key)
 *   3. '' (empty string — never undefined in the output)
 *
 * @param {string}                   text
 * @param {Record<string, string>}   data          - ir.fields or a row object
 * @param {Record<string, string>}   [fieldMapping] - optional alias table
 * @returns {string}
 */
function replacePlaceholders(text, data, fieldMapping = {}) {
  if (typeof text !== 'string') return String(text ?? '');

  return text.replace(/\{\{([^}]+)\}\}/g, (_, raw) => {
    const key       = raw.trim();
    const mappedKey = fieldMapping[key] || key;
    const value     = resolve(data, mappedKey);
    return value != null ? String(value) : '';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cell value resolver (for table cells with explicit binding or placeholder)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a table cell's value from a collection row.
 *
 * Supports two binding styles:
 *   a) Explicit binding: cell.binding.path → resolves directly from the row
 *   b) Placeholder:      cell.content.value contains {{column_name}}
 *
 * @param {object}                 cell      - template cell element
 * @param {Record<string,string>}  row       - one row from a collection
 * @param {Record<string,string>}  [colMap]  - column-level field mapping
 * @returns {string}
 */
function resolveCellValue(cell, row, colMap = {}) {
  // Explicit binding (preferred — no string parsing)
  if (cell.binding?.path) {
    const mappedKey = colMap[cell.binding.path] || cell.binding.path;
    const v = resolve(row, mappedKey);
    if (v != null) return String(v);
    return cell.binding.fallback != null ? String(cell.binding.fallback) : '';
  }

  // Placeholder-based binding (legacy / template-author shorthand)
  return replacePlaceholders(cell.content?.value ?? '', row, colMap);
}

module.exports = { resolve, replacePlaceholders, resolveCellValue };