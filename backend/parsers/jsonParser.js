/**
 * jsonParser.js
 * Parses JSON data (from a JSON file upload or an API response) into
 * the normalized { metadata, collections } structure.
 *
 * Supported input shapes:
 *   1. Flat object   { "name": "Acme", "total": 1000 }
 *                    → metadata only
 *
 *   2. Array of obj  [ { id:1, … }, { id:2, … } ]
 *                    → collections.items
 *
 *   3. Mixed object  { "invoice": { "no": "INV-001", … }, "lines": [ … ] }
 *                    → metadata from scalar/nested scalar fields,
 *                      collections from array fields
 *
 *   4. Deeply nested { "data": { "header": { … }, "rows": [ … ] } }
 *                    → flattened with dot notation
 */

function cellStr(v) {
  return v === undefined || v === null ? '' : String(v);
}

/**
 * Normalize an array of objects into { headers, rows }.
 * Primitive arrays (strings/numbers) are skipped.
 */
function normalizeCollection(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const objects = arr.filter(item => item !== null && typeof item === 'object' && !Array.isArray(item));
  if (objects.length === 0) return null;

  const headerSet = new Set();
  objects.forEach(obj => Object.keys(obj).forEach(k => headerSet.add(k)));
  const headers = Array.from(headerSet);

  const rows = objects.map(obj => {
    const row = {};
    headers.forEach(h => { row[h] = cellStr(obj[h]); });
    return row;
  });

  return { headers, rows };
}

/**
 * Recursively walk an object, accumulating:
 *   metadata   – scalar leaf values (keyed with dot-path prefix)
 *   collections – array-of-object values (keyed with dot-path prefix)
 */
function walk(obj, prefix, metadata, collections) {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      const col = normalizeCollection(value);
      if (col) collections[fullKey] = col;
      // else: array of primitives – skip
    } else if (value !== null && typeof value === 'object') {
      walk(value, fullKey, metadata, collections);
    } else {
      metadata[fullKey] = cellStr(value);
    }
  }
}

/**
 * @param {object|Array} data  – already-parsed JS value
 * @returns {{ metadata: Record<string,string>, collections: Record<string,{ headers:string[], rows:object[] }> }}
 */
function parseJson(data) {
  const metadata = {};
  const collections = {};

  if (Array.isArray(data)) {
    const col = normalizeCollection(data);
    if (col) collections['items'] = col;
    return { metadata, collections };
  }

  if (data === null || typeof data !== 'object') {
    throw new Error('JSON data must be an object or array.');
  }

  walk(data, '', metadata, collections);
  return { metadata, collections };
}

/**
 * Parse a raw JSON string or Buffer into { metadata, collections }.
 */
function parseJsonBuffer(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
  const data = JSON.parse(text);
  return parseJson(data);
}

module.exports = { parseJson, parseJsonBuffer };