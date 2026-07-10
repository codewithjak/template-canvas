/**
 * parsers/sheetParser.js  (v2 — scalable rewrite)
 *
 * Parses Excel (.xlsx / .xls) and CSV files into a CanonicalDocument IR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DETECTION STRATEGY  (in priority order, highest wins)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  1. EXPLICIT SHEET NAMING  (most reliable — zero ambiguity)
 *     Sheet name prefix controls intent:
 *       "meta_*"   → parsed as KV pairs → ir.fields
 *       "list_*"   → parsed as table    → ir.collections[<name after prefix>]
 *       "data_*"   → alias for list_*
 *       (no prefix) → falls through to structural detection
 *
 *  2. STRUCTURAL SIGNALS  (per section within a sheet)
 *     A section is declared KV when ALL of:
 *       a. Exactly 2 non-empty columns used
 *       b. Every value in col A is unique (real keys don't repeat)
 *       c. Fewer than MAX_KV_ROWS rows (large 2-col blocks are data, not meta)
 *     Otherwise: tabular.
 *
 *  3. FALLBACK
 *     Treat as tabular. Never silently drop data.
 *     A warning is added to ir.source.warnings.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MULTI-SHEET SUPPORT
 * ══════════════════════════════════════════════════════════════════════════
 *  Every sheet is processed. Sheet name becomes the collection key.
 *  KV sheets merge into ir.fields. Tabular sheets become ir.collections.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MIXED-SHEET SECTIONS  (blank-row separated blocks within one sheet)
 * ══════════════════════════════════════════════════════════════════════════
 *  A single sheet may contain a KV header block followed by a data table.
 *  Blank rows are used as section separators. Each section is classified
 *  independently using the structural signal rules above.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OUTPUT
 * ══════════════════════════════════════════════════════════════════════════
 *  Returns a CanonicalDocument:
 *  {
 *    fields:      Record<string, string>
 *    collections: Record<string, { columns: string[], rows: object[] }>
 *    source:      { type: 'excel'|'csv', fileName, sheets, warnings }
 *  }
 */

const XLSX = require('xlsx');
const { isUtf8 } = require('buffer');
const { createIR, validateIR } = require('../types/canonicalDocument');

// ─────────────────────────────────────────────────────────────────────────────
// CSV encoding detection  (multilingual export Phase 4, task 4.1)
//
// A CSV saved as Windows-1256 (Arabic), GBK (Chinese), etc. used to mojibake
// because the buffer was handed to XLSX.read as-is. Guardrails:
//   - UTF-8 (the default and the overwhelmingly common case) is NEVER
//     touched: a valid-UTF-8 buffer takes the exact pre-existing path.
//   - Transcoding happens only on a HIGH-CONFIDENCE detection of a legacy
//     encoding; anything ambiguous also takes the pre-existing path.
//   - Excel files are untouched (they carry their own encoding internally).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * chardet confidence (0..100) required before we trust a legacy encoding.
 * Realistic legacy files score 90+ (windows-1256 Arabic ≈ 91, GBK ≈ 97);
 * tiny/ambiguous samples score ≤ ~35 and fall back to the old path.
 */
const ENCODING_MIN_CONFIDENCE = 60;

/**
 * Decode a CSV buffer to a string, or return null to keep the pre-existing
 * buffer path (low-confidence detection or any failure).
 *
 * Discovered while testing this task: XLSX.read(type:'buffer') decodes a
 * BOM-less CSV as cp1252, so even plain UTF-8 CSVs mojibaked for non-ASCII
 * text. Valid UTF-8 is therefore decoded explicitly here too — for pure
 * ASCII this is byte-for-byte identical to the old path, and for non-ASCII
 * it only fixes text that was previously garbled.
 *
 * @param {Buffer} buffer
 * @returns {{ text: string, encoding: string, transcoded: boolean } | null}
 */
function decodeCsv(buffer) {
  // UTF-16 BOMs: unambiguous, decode directly.
  if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
    return { text: buffer.slice(2).toString('utf16le'), encoding: 'utf-16le', transcoded: true };
  }
  if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
    return { text: Buffer.from(buffer.slice(2)).swap16().toString('utf16le'), encoding: 'utf-16be', transcoded: true };
  }
  // Valid UTF-8 (including pure ASCII and the UTF-8 BOM): the expected
  // encoding — decode it, no warning.
  if (isUtf8(buffer)) {
    const text = buffer.toString('utf8');
    return { text: text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text, encoding: 'utf-8', transcoded: false };
  }

  try {
    const chardet = require('chardet');
    const iconv   = require('iconv-lite');
    const matches = chardet.analyse(buffer);
    const best    = matches && matches[0];
    if (!best || best.confidence < ENCODING_MIN_CONFIDENCE) return null;
    if (!iconv.encodingExists(best.name)) return null;
    return { text: iconv.decode(buffer, best.name), encoding: best.name, transcoded: true };
  } catch {
    return null;   // detection is best-effort; the old path is the fallback
  }
}

/** True iff the upload is a CSV by filename (Excel handles its own encoding). */
function isCsvFileName(fileName) {
  return /\.csv$/i.test(String(fileName || ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** 2-column sections with ≥ this many rows are treated as tabular, not KV */
const MAX_KV_ROWS = 40;

/** Generic "header-label" values that are never useful KV keys */
const SKIP_KV_KEYS = new Set([
  'fieldname', 'key', 'parameter', 'label', 'field',
  'name', 'value', 'property', 'attribute',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Cell helpers
// ─────────────────────────────────────────────────────────────────────────────

function cellStr(v) {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function isBlankRow(row) {
  if (!Array.isArray(row) || row.length === 0) return true;
  return row.every(c => cellStr(c) === '');
}

/** Count how many columns (from the left) are non-empty in a row */
function usedColumnCount(row) {
  let last = -1;
  for (let i = 0; i < row.length; i++) {
    if (cellStr(row[i]) !== '') last = i;
  }
  return last + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section splitter  (blank rows = section boundaries)
// ─────────────────────────────────────────────────────────────────────────────

function splitIntoSections(rows) {
  const sections = [];
  let current = [];

  for (const row of rows) {
    if (isBlankRow(row)) {
      if (current.length > 0) {
        sections.push(current);
        current = [];
      }
    } else {
      current.push(row);
    }
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

// ─────────────────────────────────────────────────────────────────────────────
// Detection  (Strategy 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if a section of rows should be treated as key→value pairs.
 *
 * Conditions (ALL must hold):
 *   a. Every non-blank row uses ≤ 2 columns
 *   b. Column A values are all unique (real keys don't repeat)
 *   c. Section has fewer than MAX_KV_ROWS rows
 */
function isKvSection(rows) {
  const nonBlank = rows.filter(r => !isBlankRow(r));
  if (nonBlank.length < 1) return false;
  if (nonBlank.length >= MAX_KV_ROWS) return false;   // (c) too large → tabular

  const keysSeen = new Set();
  for (const row of nonBlank) {
    const colCount = usedColumnCount(row);
    if (colCount > 2) return false;                    // (a) more than 2 cols used

    const key = cellStr(row[0]);
    if (!key) return false;                            // col A must be non-empty
    if (keysSeen.has(key)) return false;               // (b) duplicate key → tabular
    keysSeen.add(key);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a KV section into a flat Record<string, string>.
 * Skips generic header rows like "Field Name" / "Key".
 */
function parseKvSection(rows, warnings = []) {
  const record = {};
  for (const row of rows) {
    if (isBlankRow(row)) continue;
    const key = cellStr(row[0]);
    const val = cellStr(row[1]);
    if (!key) continue;

    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    if (SKIP_KV_KEYS.has(normalized)) {
      warnings.push(`Skipped likely-header KV row with key "${key}"`);
      continue;
    }
    record[key] = val;
  }
  return record;
}

/**
 * Parse a tabular section into { columns, rows }.
 * Returns null if the section is degenerate (< 1 header col or 0 data rows).
 */
function parseTabularSection(rows, warnings = []) {
  const nonBlank = rows.filter(r => !isBlankRow(r));
  if (nonBlank.length < 2) {
    // 1 row with no data rows — treat the single row as field data
    if (nonBlank.length === 1) {
      warnings.push(
        'Single-row table section found — treating columns as fields, ' +
        'not a collection. Wrap in a KV section or add data rows.'
      );
    }
    return null;
  }

  const headerRow = nonBlank[0];
  const columns = [];
  const colIndexMap = [];   // maps output-column-index → raw-row-index

  for (let i = 0; i < headerRow.length; i++) {
    const h = cellStr(headerRow[i]);
    if (h !== '') {
      columns.push(h);
      colIndexMap.push(i);
    }
  }

  if (columns.length < 1) {
    warnings.push('Tabular section has no header row — skipped.');
    return null;
  }

  const dataRows = nonBlank.slice(1).map(row => {
    const obj = {};
    columns.forEach((col, ci) => {
      obj[col] = cellStr(row[colIndexMap[ci]]);
    });
    return obj;
  });

  return { columns, rows: dataRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection key helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeCollectionKey(base, existingKeys) {
  const normalized = base.trim().toLowerCase().replace(/\s+/g, '_');
  if (!existingKeys.has(normalized)) return normalized;

  let i = 2;
  while (existingKeys.has(`${normalized}_${i}`)) i++;
  return `${normalized}_${i}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet-level name prefix detection  (Strategy 1)
// ─────────────────────────────────────────────────────────────────────────────

const META_PREFIX  = /^meta[_\-\s]/i;
const LIST_PREFIX  = /^(?:list|data)[_\-\s]/i;

function sheetIntent(sheetName) {
  if (META_PREFIX.test(sheetName)) {
    return { intent: 'kv', collectionName: null };
  }
  if (LIST_PREFIX.test(sheetName)) {
    const collectionName = sheetName.replace(/^(?:list|data)[_\-\s]/i, '').trim() || sheetName;
    return { intent: 'table', collectionName };
  }
  return { intent: 'auto', collectionName: sheetName };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-sheet processor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process one sheet and merge results into ir.
 *
 * @param {string[][]} rows         - raw rows from sheet_to_json
 * @param {string}     sheetName
 * @param {object}     ir           - CanonicalDocument being built
 * @param {string[]}   warnings     - shared warnings array
 */
function processSheet(rows, sheetName, ir, warnings) {
  const { intent, collectionName } = sheetIntent(sheetName);

  // ── Explicit meta sheet ───────────────────────────────────────────────────
  if (intent === 'kv') {
    const kvRows = rows.filter(r => !isBlankRow(r));
    const record = parseKvSection(kvRows, warnings);
    Object.assign(ir.fields, record);
    return;
  }

  // ── Explicit table sheet ──────────────────────────────────────────────────
  if (intent === 'table') {
    const kvRows = rows.filter(r => !isBlankRow(r));
    const tabular = parseTabularSection(kvRows, warnings);
    if (tabular && tabular.rows.length > 0) {
      const key = makeCollectionKey(collectionName, new Set(Object.keys(ir.collections)));
      ir.collections[key] = tabular;
    } else {
      warnings.push(`Sheet "${sheetName}" declared as table but produced no rows.`);
    }
    return;
  }

  // ── Auto-detect: split by blank rows and classify each section ────────────
  const sections = splitIntoSections(rows);

  // Determine the default collection name for this sheet (its first table section)
  // Sheet "Sheet1" → "items", other sheets → their name
  const defaultCollKey = sheetName.toLowerCase() === 'sheet1' ? 'items' : sheetName;

  for (const section of sections) {
    if (isKvSection(section)) {
      const record = parseKvSection(section, warnings);
      Object.assign(ir.fields, record);
    } else {
      const tabular = parseTabularSection(section, warnings);
      if (tabular && tabular.rows.length > 0) {
        const key = makeCollectionKey(defaultCollKey, new Set(Object.keys(ir.collections)));
        ir.collections[key] = tabular;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse an Excel or CSV buffer into a CanonicalDocument.
 *
 * @param {Buffer} buffer
 * @param {{ fileName?: string }} [options]
 * @returns {import('../types/canonicalDocument').CanonicalDocument}
 */
function parseSheet(buffer, options = {}) {
  const warnings = [];

  // CSVs are decoded to a string first (see decodeCsv) — UTF-8 explicitly,
  // legacy encodings via detection; Excel takes the pre-existing path.
  const decoded = isCsvFileName(options.fileName) ? decodeCsv(buffer) : null;
  if (decoded && decoded.transcoded) warnings.push(`CSV decoded from ${decoded.encoding} (auto-detected).`);

  const workbook = decoded
    ? XLSX.read(decoded.text, { type: 'string', raw: false, cellDates: true })
    : XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: true });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('No sheets found in file.');
  }

  const ir = createIR({
    type: 'excel',
    fileName: options.fileName,
    sheets: workbook.SheetNames,
    warnings,
  });

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: true,   // keep blank rows for section boundary detection
      defval: '',
    });

    try {
      processSheet(rows, sheetName, ir, warnings);
    } catch (err) {
      warnings.push(`Sheet "${sheetName}" failed to parse: ${err.message}`);
    }
  }

  if (warnings.length > 0) {
    ir.source.warnings = warnings;
  }

  return validateIR(ir);
}

module.exports = { parseSheet };