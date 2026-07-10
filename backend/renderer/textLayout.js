/**
 * renderer/textLayout.js
 *
 * Crash-proof text measurement and drawing for the pdf-lib renderer
 * (MULTILINGUAL_EXPORT_ARCHITECTURE.md, Phase 0 tasks 0.4 / 0.6).
 *
 * pdf-lib's StandardFonts encode WinAnsi (CP1252); both widthOfTextAtSize()
 * and drawText() throw on any character outside it. Resolved template text is
 * pre-sanitized by resolver.js toWinAnsiSafe(), but strings that bypass the
 * resolver (chart titles/labels, bound chart series, checkbox labels) used to
 * hard-fail the whole export. Everything here degrades instead of throwing.
 *
 * Phase 2 replaces the internals of this module with real script
 * segmentation, shaping, and bidi (layoutLine) — the call sites stay put.
 */

'use strict';

/**
 * The visible stand-in for a character the current font cannot encode.
 * Real tofu (▯ U+25AF) is itself not WinAnsi-encodable, so Phase 0 uses '?';
 * once Phase 1 embeds Unicode fonts the substitution disappears for real text.
 */
const FALLBACK_CHAR = '?';

/**
 * Replace every character the font cannot encode with FALLBACK_CHAR.
 * Probes per character with widthOfTextAtSize — only called on the failure
 * path, so the per-char cost is paid exclusively by already-broken strings.
 *
 * @param {import('pdf-lib').PDFFont} font
 * @param {string} text
 * @param {number} size
 * @returns {string}
 */
function encodableOrFallback(font, text, size) {
  let out = '';
  for (const ch of String(text)) {
    try { font.widthOfTextAtSize(ch, size); out += ch; }
    catch { out += FALLBACK_CHAR; }
  }
  return out;
}

/**
 * widthOfTextAtSize that never throws.
 *
 *  - null/undefined font → 0, preserving the renderer's dry-run contract
 *    (wrapText is deliberately called with a null font during measurement
 *    passes and expects width 0).
 *  - encode failure → width of the text with unencodable chars replaced by
 *    FALLBACK_CHAR, i.e. the width of what drawTextSafe will actually draw,
 *    so wrapping and alignment stay consistent with the drawn output.
 *
 * @param {import('pdf-lib').PDFFont | null | undefined} font
 * @param {string} text
 * @param {number} size
 * @returns {number}
 */
function safeWidth(font, text, size) {
  if (!font) return 0;
  const s = String(text ?? '');
  try { return font.widthOfTextAtSize(s, size); }
  catch { return font.widthOfTextAtSize(encodableOrFallback(font, s, size), size); }
}

/**
 * page.drawText that never throws.
 * On encode failure the string is redrawn with unencodable characters
 * replaced by FALLBACK_CHAR — degrade visibly, never blank, never crash.
 *
 * @param {import('pdf-lib').PDFPage} page
 * @param {string} text
 * @param {object} options  pdf-lib drawText options ({ font, size, ... })
 */
function drawTextSafe(page, text, options) {
  const s = String(text ?? '');
  try { page.drawText(s, options); return; }
  catch { /* fall through to the fallback draw */ }
  try {
    page.drawText(encodableOrFallback(options.font, s, options.size), options);
  } catch { /* a failure here means a broken font object — never abort the export for one string */ }
}

module.exports = { safeWidth, drawTextSafe, encodableOrFallback, FALLBACK_CHAR };
