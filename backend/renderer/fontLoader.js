/**
 * fontLoader.js
 *
 * Loads and caches fonts for pdf-lib. This is the renderer's single font
 * path: pdfLibRenderer obtains its fonts via createFontContext() below
 * (MULTILINGUAL_EXPORT_ARCHITECTURE.md, Phase 0 task 0.2).
 *
 * Phase 0: the context carries exactly the fonts the renderer embedded
 * before (Helvetica + HelveticaBold), so PDF output is byte-identical.
 * fontkit is registered on the document so Phase 1 can subset-embed Unicode
 * fonts from backend/fonts/ without touching the renderer again.
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
const fontkit = require('@pdf-lib/fontkit');

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

/**
 * True iff every codepoint is ≤ 0xFF (ISO Latin-1).
 *
 * This is the routing predicate for Phase 1: Latin-1 runs stay on
 * StandardFonts (byte-identical output), anything else routes to an embedded
 * Unicode font. Note WinAnsi (CP1252) additionally encodes a few codepoints
 * above 0xFF (€ ™ smart quotes — see resolver.js isWinAnsi); Phase 1 must
 * keep those on StandardFonts too, so the run router will use the stricter
 * WinAnsi predicate, not this one alone.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isLatin1(text) {
  for (const ch of String(text ?? '')) {
    if (ch.codePointAt(0) > 0xFF) return false;
  }
  return true;
}

/**
 * createFontContext — the renderer's font setup.
 *
 * Registers fontkit (required for embedding custom TTF/OTF; a no-op for
 * StandardFonts) and returns the { normal, bold } pair the render pipeline
 * threads through measurement and drawing. Phase 0 embeds exactly what the
 * renderer's old local embedFonts() did, so output bytes are unchanged.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @returns {Promise<{ normal: import('pdf-lib').PDFFont, bold: import('pdf-lib').PDFFont }>}
 */
async function createFontContext(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);
  return {
    normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold:   await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };
}

module.exports = { FontCache, resolveStandardFont, createFontContext, isLatin1 };