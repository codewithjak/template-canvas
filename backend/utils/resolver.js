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
// WinAnsi sanitizer
// ─────────────────────────────────────────────────────────────────────────────
//
// pdf-lib's StandardFonts encode text with WinAnsi (Windows-1252). Any character
// outside that set makes font.widthOfTextAtSize() / drawText() throw.
//
// HISTORY: this used to run unconditionally inside replacePlaceholders /
// resolveCellValue, so every resolved string was force-fitted to WinAnsi
// before the renderer saw it — which made embedded Unicode fonts unreachable.
// Since multilingual Phase 1 (task 1.7), resolution returns the ORIGINAL
// string and each emitter applies encoding at its own layer:
//   - PDF: renderer/textLayout.js sanitizes only the runs that draw on
//     StandardFonts; script runs draw raw on embedded Noto fonts.
//   - ZPL: renderer/zplRenderer.js sanitizes everything (ZPL output here is
//     not Unicode-capable).
//   - Download filenames (index.js / lib/bulkJobs.js): intentionally NOT
//     WinAnsi-sanitized — lib/fileNames.js sanitizeFileName() already strips
//     filesystem-illegal chars (including '?'), and zip entries are UTF-8, so
//     Unicode template names survive as real filenames.
//
// Strategy per character:
//   1. WinAnsi-encodable → keep as-is (the overwhelmingly common case).
//   2. Known symbol      → friendly ASCII look-alike (≤ → "<=", → → "->", ⁹ → "^9").
//   3. Otherwise         → NFKD-decompose, drop combining marks, keep what's safe
//                          (handles accented/compat forms); unrenderable glyphs
//                          (CJK, emoji, Greek…) degrade to a visible "?" per
//                          character rather than crash.
//
// Step 3 used to degrade to "" — the character was silently DELETED, so
// Arabic/CJK documents exported blank with no error and no trace of the lost
// content (MULTILINGUAL_EXPORT_ARCHITECTURE.md, failure mode F0). A visible
// "?" tells the user exactly where content was lost instead of hiding it.
// Real tofu (▯) is itself not WinAnsi-encodable, hence "?". Phase 1 makes
// this sanitizer font-aware (task 1.7) so embedded Unicode fonts receive the
// original characters and the fallback stops firing for supported scripts.

// cp1252's 0x80–0x9F band. The rest of WinAnsi is 0x20–0x7E and 0xA0–0xFF.
const CP1252_HIGH = new Set([
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160,
  0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
  0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
]);

function isWinAnsi(cp) {
  return cp === 0x09 || cp === 0x0A ||
         (cp >= 0x20 && cp <= 0x7E) ||
         (cp >= 0xA0 && cp <= 0xFF) ||
         CP1252_HIGH.has(cp);
}

// Friendly replacements for symbols people actually type. (Chars already in
// WinAnsi — ² ³ ¹ µ × ÷ ± … € — are intentionally absent; they pass through.)
const SYMBOL_MAP = {
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~',   // ≤ ≥ ≠ ≈
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', // → ← ↔ ⇒
  '−': '-',  '⁄': '/',                                   // − (minus) ⁄ (frac slash)
  '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6',  // ⁰ ⁴ ⁵ ⁶
  '⁷': '^7', '⁸': '^8', '⁹': '^9',                  // ⁷ ⁸ ⁹
  '₀': '_0', '₁': '_1', '₂': '_2', '₃': '_3',  // ₀ ₁ ₂ ₃
  '₄': '_4', '₅': '_5', '₆': '_6', '₇': '_7',  // ₄ ₅ ₆ ₇
  '₈': '_8', '₉': '_9',                                  // ₈ ₉
};

/**
 * Make a string safe for pdf-lib's WinAnsi-encoded standard fonts.
 * @param {string} input
 * @param {string} [fallback='?']  what an unmappable char becomes; pass ''
 *   to drop such chars entirely (e.g. filenames, where '?' is illegal)
 * @returns {string}
 */
function toWinAnsiSafe(input, fallback = '?') {
  if (typeof input !== 'string' || input === '') return input;

  // Fast path: nothing to do for pure-WinAnsi strings (the common case).
  let needsWork = false;
  for (const ch of input) {
    if (!isWinAnsi(ch.codePointAt(0))) { needsWork = true; break; }
  }
  if (!needsWork) return input;

  let out = '';
  for (const ch of input) {
    if (isWinAnsi(ch.codePointAt(0))) { out += ch; continue; }
    if (SYMBOL_MAP[ch] !== undefined) { out += SYMBOL_MAP[ch]; continue; }
    const decomposed = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    let kept = '';
    for (const d of decomposed) {
      if (isWinAnsi(d.codePointAt(0))) kept += d;
    }
    // Nothing survived decomposition (CJK, Arabic, emoji…): substitute the
    // fallback (default: a visible "?") instead of deleting the character.
    out += kept || fallback;
  }
  return out;
}

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

  // Returns the ORIGINAL Unicode — encoding is each emitter's concern
  // (see the WinAnsi sanitizer note above; multilingual Phase 1, task 1.7).
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

module.exports = { resolve, replacePlaceholders, resolveCellValue, toWinAnsiSafe, isWinAnsi };