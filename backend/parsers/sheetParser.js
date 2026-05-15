/**
 * sheetParser.js
 * Parses Excel and CSV files into a normalized { metadata, collections } structure.
 *
 * Handles mixed-format sheets:
 *   - Section 1 (rows 1-N): vertical key→value pairs  → metadata
 *   - (blank rows separator)
 *   - Section 2 (row N+1 = headers, rest = data):     → collections["items"]
 *
 * Multiple tabular sections become collections["items"], collections["collection_2"], etc.
 */

const XLSX = require('xlsx');

// ── Row utilities ──────────────────────────────────────────────────────────

function cellStr(cell) {
  if (cell === undefined || cell === null) return '';
  return String(cell).trim();
}

function isBlankRow(row) {
  if (!Array.isArray(row)) return true;
  return row.every(c => cellStr(c) === '');
}

/**
 * A section is KV if ≥70% of its non-blank rows have:
 *   - a non-empty value in column A
 *   - no content beyond column B (i.e. at most 2 columns used)
 */
function isKvSection(rows) {
  const nonBlank = rows.filter(r => !isBlankRow(r));
  if (nonBlank.length < 1) return false;

  const kvLike = nonBlank.filter(row => {
    const key = cellStr(row[0]);
    if (!key) return false;
    const beyondB = row.slice(2).some(c => cellStr(c) !== '');
    return !beyondB;
  });

  return kvLike.length >= nonBlank.length * 0.7;
}

function parseKvSection(rows) {
  const record = {};
  for (const row of rows) {
    if (isBlankRow(row)) continue;
    const key = cellStr(row[0]);
    const value = cellStr(row[1]);
    // Skip generic header rows like "Field Name" / "Key" / "Parameter"
    const lk = key.toLowerCase().replace(/[^a-z]/g, '');
    if (!key || ['fieldname', 'key', 'parameter', 'label', 'field'].includes(lk)) continue;
    record[key] = value;
  }
  return record;
}

function parseTabularSection(rows) {
  const nonBlank = rows.filter(r => !isBlankRow(r));
  if (nonBlank.length < 2) return null; // need header + ≥1 data row

  const headerRow = nonBlank[0];
  const headers = headerRow
    .map(c => cellStr(c))
    .filter(h => h !== '');

  if (headers.length < 2) return null; // degenerate – not a real table

  const dataRows = nonBlank.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = cellStr(row[i]);
    });
    return obj;
  });

  return { headers, rows: dataRows };
}

// ── Section splitter ────────────────────────────────────────────────────────

function splitIntoSections(rows) {
  const sections = [];
  let current = [];

  for (const row of rows) {
    if (isBlankRow(row)) {
      if (current.length > 0) {
        sections.push([...current]);
        current = [];
      }
    } else {
      current.push(row);
    }
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * @param {Buffer} buffer
 * @returns {{ metadata: Record<string,string>, collections: Record<string,{ headers: string[], rows: object[] }> }}
 */
function parseSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) throw new Error('No worksheet found in file.');

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    blankrows: true, // keep blank rows so we can detect section separators
    defval: '',
  });

  const sections = splitIntoSections(rows);
  const metadata = {};
  const collections = {};
  let collectionIndex = 0;

  for (const section of sections) {
    if (isKvSection(section)) {
      Object.assign(metadata, parseKvSection(section));
    } else {
      const tabular = parseTabularSection(section);
      if (tabular && tabular.rows.length > 0) {
        const name = collectionIndex === 0 ? 'items' : `collection_${collectionIndex + 1}`;
        collections[name] = tabular;
        collectionIndex++;
      }
    }
  }

  return { metadata, collections };
}

module.exports = { parseSheet };