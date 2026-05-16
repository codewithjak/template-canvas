/**
 * fontLoader.js
 *
 * Loads and caches fonts for pdf-lib.
 *
 * pdf-lib requires fonts to be embedded as ArrayBuffer/Uint8Array.
 * We use the standard PDF built-in fonts (Helvetica family) as fallback,
 * and support custom TTF/OTF fonts placed in backend/fonts/.
 *
 * Font name mapping mirrors what the canvas uses:
 *   'Arial, sans-serif'       → Helvetica  (built-in, no embed needed)
 *   'Arial'                   → Helvetica
 *   'Times New Roman, serif'  → TimesRoman (built-in)
 *   'Courier New, monospace'  → Courier    (built-in)
 *   anything else             → Helvetica  (safe fallback)
 *
 * Built-in PDF fonts do NOT need to be embedded as files.
 * pdf-lib exposes them via StandardFonts enum.
 */

const { StandardFonts } = require('pdf-lib');

// Maps canvas fontFamily strings → pdf-lib StandardFonts keys
const FONT_MAP = {
  'arial'            : 'Helvetica',
  'helvetica'        : 'Helvetica',
  'sans-serif'       : 'Helvetica',
  'times new roman'  : 'TimesRoman',
  'times'            : 'TimesRoman',
  'serif'            : 'TimesRoman',
  'courier new'      : 'Courier',
  'courier'          : 'Courier',
  'monospace'        : 'Courier',
};

const BOLD_MAP = {
  'Helvetica'  : 'HelveticaBold',
  'TimesRoman' : 'TimesRomanBold',
  'Courier'    : 'CourierBold',
};

const ITALIC_MAP = {
  'Helvetica'  : 'HelveticaOblique',
  'TimesRoman' : 'TimesRomanItalic',
  'Courier'    : 'CourierOblique',
};

/**
 * Resolves a canvas fontFamily string to a StandardFonts key.
 * @param {string} fontFamily  e.g. "Arial, sans-serif"
 * @param {boolean} bold
 * @returns {string}  StandardFonts key e.g. "HelveticaBold"
 */
function resolveStandardFont(fontFamily = '', bold = false) {
  // Normalise: take first family name, lowercase, strip quotes
  const first = (fontFamily || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '');

  const base = FONT_MAP[first] || 'Helvetica';
  return bold ? (BOLD_MAP[base] || base) : base;
}

/**
 * FontCache — embed each unique StandardFont once per PDFDocument.
 *
 * Usage:
 *   const cache = new FontCache(pdfDoc);
 *   const font  = await cache.get('Arial, sans-serif', true);  // bold
 */
class FontCache {
  constructor(pdfDoc) {
    this.doc   = pdfDoc;
    this.cache = new Map();   // key → PDFFont
  }

  /**
   * @param {string}  fontFamily  canvas fontFamily string
   * @param {boolean} bold
   * @returns {Promise<import('pdf-lib').PDFFont>}
   */
  async get(fontFamily = '', bold = false) {
    const key = resolveStandardFont(fontFamily, bold);
    if (!this.cache.has(key)) {
      const font = await this.doc.embedFont(StandardFonts[key] || StandardFonts.Helvetica);
      this.cache.set(key, font);
    }
    return this.cache.get(key);
  }
}

module.exports = { FontCache, resolveStandardFont };