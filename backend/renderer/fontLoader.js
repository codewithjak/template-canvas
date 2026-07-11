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
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const modernFontkit = require('fontkit');
const { detectScript } = require('./textLayout');

// ─────────────────────────────────────────────────────────────────────────────
// fontkit adapter
//
// pdf-lib ships with @pdf-lib/fontkit (a 2018 fork of fontkit 1.x) whose
// subsetter silently CORRUPTS newer font builds — Google-Fonts static
// instances and Amiri both embedded with empty Arabic outlines (verified with
// both pdfjs and poppler; see MULTILINGUAL_EXPORT_ARCHITECTURE.md §7).
// Modern fontkit 2.x subsets them correctly but dropped the streaming API
// pdf-lib's embedder consumes, so this adapter restores exactly that:
//   - create() accepts the Uint8Array pdf-lib passes (fontkit 2 wants Buffer)
//   - subset.encodeStream() wraps fontkit 2's synchronous subset.encode(),
//     evaluated lazily at read time so every includeGlyph() call that
//     happens before pdf-lib serializes the font is included.
// includeGlyph()/.cff keep identical semantics between the two versions.
// ─────────────────────────────────────────────────────────────────────────────

function withEncodeStream(subset) {
  if (typeof subset.encodeStream === 'function') return subset;
  subset.encodeStream = () =>
    Readable.from((function* () { yield Buffer.from(subset.encode()); })());
  return subset;
}

const fontkit = {
  create(bytes) {
    const font = modernFontkit.create(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
    const createSubset = font.createSubset.bind(font);
    font.createSubset = () => withEncodeStream(createSubset());
    return font;
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Script → bundled font files (backend/fonts/, see LICENSES.md there).
// Scripts without an entry ('winansi', 'other') stay on StandardFonts.
// Hebrew and CJK reuse their regular weight for bold (no bold file bundled).
// ─────────────────────────────────────────────────────────────────────────────

const FONT_DIR = path.join(__dirname, '..', 'fonts');

const SCRIPT_FONT_FILES = {
  'latin-ext':      { normal: 'NotoSans-Regular.ttf',        bold: 'NotoSans-Bold.ttf' },
  'cyrillic-greek': { normal: 'NotoSans-Regular.ttf',        bold: 'NotoSans-Bold.ttf' },
  'hebrew':         { normal: 'NotoSansHebrew-Regular.ttf',  bold: 'NotoSansHebrew-Regular.ttf' },
  'arabic':         { normal: 'NotoNaskhArabic-Regular.ttf', bold: 'NotoNaskhArabic-Bold.ttf' },
  'cjk':            { normal: 'NotoSansCJKsc-Regular.otf',   bold: 'NotoSansCJKsc-Regular.otf' },
};

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
 * Registers fontkit and returns the font context the render pipeline threads
 * through measurement and drawing:
 *
 *   normal, bold           — the StandardFonts pair (Helvetica family), same
 *                            as always: pure-WinAnsi documents never touch
 *                            anything else and stay byte-identical.
 *   ensureScriptsFor(text) — async pre-embed pass. Detects which scripts
 *                            appear in `text` and subset-embeds the matching
 *                            bundled fonts ONCE per document. A document with
 *                            no non-WinAnsi text embeds nothing.
 *   forRun(script, bold)   — sync lookup used during measure/draw (both are
 *                            synchronous code paths, hence the pre-embed
 *                            pass). Returns null for scripts that have no
 *                            bundled font or were not pre-embedded, and the
 *                            caller degrades exactly as in Phase 0.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @returns {Promise<{
 *   normal: import('pdf-lib').PDFFont,
 *   bold: import('pdf-lib').PDFFont,
 *   ensureScriptsFor: (text: string) => Promise<void>,
 *   forRun: (script: string, bold: boolean) => import('pdf-lib').PDFFont | null,
 * }>}
 */
async function createFontContext(pdfDoc) {
  pdfDoc.registerFontkit(fontkit);

  const embeddedByFile = new Map();   // font filename → PDFFont

  async function embedFile(fileName) {
    if (embeddedByFile.has(fileName)) return;
    const bytes = await fs.promises.readFile(path.join(FONT_DIR, fileName));
    // subset: true — only glyphs actually used end up in the PDF, which is
    // what keeps a CJK document from carrying the full 16 MB font.
    embeddedByFile.set(fileName, await pdfDoc.embedFont(bytes, { subset: true }));
  }

  return {
    normal: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold:   await pdfDoc.embedFont(StandardFonts.HelveticaBold),

    async ensureScriptsFor(text) {
      const scripts = new Set();
      for (const ch of String(text ?? '')) {
        const s = detectScript(ch.codePointAt(0));
        if (SCRIPT_FONT_FILES[s]) scripts.add(s);
      }
      for (const s of scripts) {
        await embedFile(SCRIPT_FONT_FILES[s].normal);
        await embedFile(SCRIPT_FONT_FILES[s].bold);
      }
    },

    forRun(script, bold = false) {
      const files = SCRIPT_FONT_FILES[script];
      if (!files) return null;
      return embeddedByFile.get(bold ? files.bold : files.normal) || null;
    },
  };
}

module.exports = { FontCache, resolveStandardFont, createFontContext, isLatin1 };