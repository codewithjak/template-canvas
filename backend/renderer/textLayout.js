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
 * Phase 1 adds script segmentation: a string is split into runs per script,
 * each run measured and drawn with the font that owns that script (embedded
 * Noto fonts via fontLoader's font context; WinAnsi runs stay on the
 * StandardFonts so existing Latin output is byte-identical).
 *
 * Phase 2 replaces the internals of this module with real shaping and bidi
 * (layoutLine) — the call sites stay put.
 */

'use strict';

const { toWinAnsiSafe, isWinAnsi } = require('../utils/resolver');
const bidiFactory = require('bidi-js');

// bidi-js is stateless after construction; one instance serves all renders.
const bidi = bidiFactory();

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

// ─────────────────────────────────────────────────────────────────────────────
// Script detection & run segmentation  (Phase 1, tasks 1.2 / 1.4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Unicode ranges → script buckets we bundle fonts for. First match wins.
 * Anything WinAnsi-encodable is 'winansi' (checked before this table);
 * anything unmatched is 'other' and goes through toWinAnsiSafe like before.
 */
const SCRIPT_RANGES = [
  [0x0100, 0x024F, 'latin-ext'],       // Latin Extended-A/B
  [0x1E00, 0x1EFF, 'latin-ext'],       // Latin Extended Additional
  [0x0370, 0x03FF, 'cyrillic-greek'],  // Greek and Coptic
  [0x0400, 0x052F, 'cyrillic-greek'],  // Cyrillic + Supplement
  [0x0590, 0x05FF, 'hebrew'],
  [0x0600, 0x06FF, 'arabic'],
  [0x0750, 0x077F, 'arabic'],          // Arabic Supplement
  [0x08A0, 0x08FF, 'arabic'],          // Arabic Extended-A
  [0xFB50, 0xFDFF, 'arabic'],          // Presentation Forms-A
  [0xFE70, 0xFEFF, 'arabic'],          // Presentation Forms-B
  [0x1100, 0x11FF, 'cjk'],             // Hangul Jamo
  [0x2E80, 0x9FFF, 'cjk'],             // radicals, kana, CJK ideographs
  [0xAC00, 0xD7AF, 'cjk'],             // Hangul syllables
  [0xF900, 0xFAFF, 'cjk'],             // CJK Compatibility Ideographs
  [0xFF00, 0xFFEF, 'cjk'],             // full/half-width forms
];

/**
 * Script bucket for one codepoint.
 * @param {number} cp
 * @returns {'winansi'|'latin-ext'|'cyrillic-greek'|'hebrew'|'arabic'|'cjk'|'other'}
 */
function detectScript(cp) {
  if (isWinAnsi(cp)) return 'winansi';
  for (const [lo, hi, script] of SCRIPT_RANGES) {
    if (cp >= lo && cp <= hi) return script;
  }
  return 'other';
}

/**
 * Split a string into runs of a single script.
 * A pure-WinAnsi string yields exactly ONE 'winansi' run — that invariant is
 * what keeps existing Latin exports on the untouched StandardFonts path.
 *
 * @param {string} text
 * @returns {Array<{ text: string, script: string }>}
 */
function segmentRuns(text) {
  const runs = [];
  for (const ch of String(text ?? '')) {
    const script = detectScript(ch.codePointAt(0));
    const last = runs[runs.length - 1];
    if (last && last.script === script) last.text += ch;
    else runs.push({ text: ch, script });
  }
  return runs.length ? runs : [{ text: '', script: 'winansi' }];
}

/** True iff every codepoint is WinAnsi-encodable (single-run fast path). */
function allWinAnsi(text) {
  for (const ch of String(text ?? '')) {
    if (!isWinAnsi(ch.codePointAt(0))) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bidi line layout  (Phase 2, tasks 2.2/2.3 — see the doc's spike verdict)
//
// Division of labor:
//   bidi-js  — decides the VISUAL ORDER OF RUNS on a line (UAX#9 levels +
//              L2 reordering), which is exactly what fontkit does not do.
//   fontkit  — inside pdf-lib's embedded-font encoder: contextual joining
//              and intra-run RTL reversal. It receives each RTL run in
//              LOGICAL order (joining needs logical neighbors) and emits
//              visually-ordered glyphs itself.
//
// fontkit's one defect: it blindly reverses any run whose script block is
// RTL — including pure Arabic-Indic digit runs, which bidi classifies as
// LTR (even level). Those runs are pre-reversed here so fontkit's flip
// restores the correct visual order. Width is order-independent, so
// measurement is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

/** Scripts whose runs fontkit lays out right-to-left. */
const FONTKIT_RTL_SCRIPTS = new Set(['arabic', 'hebrew']);

/**
 * UAX#9 rule L4: characters with the Bidi_Mirrored property use their
 * mirrored form when they resolve to an RTL (odd) embedding level —
 * otherwise "(شهري)" exports with visually swapped parentheses.
 * The subset that appears in documents; extend as needed.
 */
const BIDI_MIRROR = {
  '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
  '<': '>', '>': '<', '«': '»', '»': '«', '‹': '›', '›': '‹',
};

/** True iff any codepoint is in an RTL script block (engages bidi layout). */
function hasRtl(text) {
  for (const ch of String(text ?? '')) {
    if (FONTKIT_RTL_SCRIPTS.has(detectScript(ch.codePointAt(0)))) return true;
  }
  return false;
}

/**
 * Base direction of a string from its first strong directional character
 * (UAX#9 P2/P3, the `direction: 'auto'` semantics of the template model).
 * Neutrals (digits, punctuation, whitespace) are skipped; no strong
 * character at all → 'ltr' (today's behavior).
 *
 * @param {string} text
 * @returns {'ltr' | 'rtl'}
 */
function baseDirection(text) {
  for (const ch of String(text ?? '')) {
    const script = detectScript(ch.codePointAt(0));
    if (FONTKIT_RTL_SCRIPTS.has(script)) return 'rtl';
    // Strong LTR: any letter — ASCII/Latin-1 letters or a non-RTL script bucket.
    if (script !== 'winansi' && script !== 'other') return 'ltr';
    if (/\p{L}/u.test(ch)) return 'ltr';
  }
  return 'ltr';
}

/**
 * Split one LINE into segments in VISUAL (left-to-right draw) order.
 * Each segment's `text` is exactly the string to hand to pdf-lib for its
 * font (see the hand-off rules in the header comment).
 *
 * Base direction is derived from the first strong directional character
 * (UAX#9 P2/P3 — bidi-js's default), i.e. the `direction: 'auto'` semantics
 * planned for the template model in Phase 3.
 *
 * @param {string} text  one line, logical order (no newlines)
 * @returns {Array<{ text: string, script: string }>}
 */
function visualSegments(text) {
  const s = String(text ?? '');
  const embedding = bidi.getEmbeddingLevels(s);

  // L2 reordering: bidi-js hands back the exact ranges to reverse (inclusive,
  // in UTF-16 code units), highest level first. Slots are built per CODE
  // POINT — reversing whole codepoints can never split a surrogate pair —
  // with a unit-index → slot-index map to translate the ranges.
  const slots = [];
  const unitToSlot = new Array(s.length);
  for (let unit = 0; unit < s.length; ) {
    const cp = s.codePointAt(unit);
    const len = cp > 0xFFFF ? 2 : 1;
    for (let k = 0; k < len; k++) unitToSlot[unit + k] = slots.length;
    slots.push({ unit: s.slice(unit, unit + len), level: embedding.levels[unit] });
    unit += len;
  }
  for (const [start, end] of bidi.getReorderSegments(s, embedding)) {
    let a = unitToSlot[start], b = unitToSlot[end];
    while (a < b) { const t = slots[a]; slots[a] = slots[b]; slots[b] = t; a++; b--; }
  }

  // L4 mirroring: swap paired brackets that resolved to an RTL level.
  for (const slot of slots) {
    if (slot.level % 2 === 1 && BIDI_MIRROR[slot.unit]) slot.unit = BIDI_MIRROR[slot.unit];
  }

  // Group consecutive slots into visual runs by (odd level?, script bucket).
  const segments = [];
  for (const slot of slots) {
    const cp  = slot.unit.codePointAt(0);
    const rtl = slot.level % 2 === 1;
    const script = detectScript(cp);
    const last = segments[segments.length - 1];
    if (last && last.rtl === rtl && last.script === script) last.units.push(slot.unit);
    else segments.push({ rtl, script, units: [slot.unit] });
  }

  return segments.map(seg => {
    let t = seg.units.join('');
    if (seg.rtl) {
      // Odd-level run: slots are in visual order; restore LOGICAL order for
      // fontkit, which shapes on logical neighbors and re-reverses itself.
      t = [...t].reverse().join('');
    } else if (FONTKIT_RTL_SCRIPTS.has(seg.script)) {
      // Even-level (LTR) run in an RTL script block — Arabic-Indic digits.
      // fontkit will blindly flip it; pre-reverse so the net order is right.
      t = [...t].reverse().join('');
    }
    return { text: t, script: seg.script };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mixed-run measurement & drawing  (Phase 1, task 1.5)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True iff the (embedded, fontkit-backed) font has a real glyph for every
 * character of `text`. StandardFonts have no fontkit handle and return false.
 * Reaches into pdf-lib's CustomFontEmbedder — the only place the underlying
 * fontkit font is exposed — hence the defensive guards.
 *
 * @param {import('pdf-lib').PDFFont} font
 * @param {string} text
 * @returns {boolean}
 */
function fontCoversText(font, text) {
  const fk = font && font.embedder && font.embedder.font;
  if (!fk || typeof fk.hasGlyphForCodePoint !== 'function') return false;
  for (const ch of String(text)) {
    if (!fk.hasGlyphForCodePoint(ch.codePointAt(0))) return false;
  }
  return true;
}

/**
 * Neutral-run font inheritance (found via the Arabic template E2E):
 * parentheses, digits and punctuation between Arabic words are 'winansi'
 * runs, which used to draw in Helvetica — visibly smaller and off-balance
 * next to Naskh glyphs. Browsers (and therefore the editor preview) take
 * those characters from the Arabic font itself when it covers them, so the
 * export does the same: a winansi run whose nearest non-winansi neighbor is
 * an RTL-script run inherits that script — gated on the embedded font
 * actually covering every character (otherwise it stays on the fallback).
 *
 * @param {Array<{ text: string, script: string }>} runs  draw order
 * @param {(script: string, text: string) => boolean} covers
 * @returns {Array<{ text: string, script: string }>}
 */
function inheritNeutralScripts(runs, covers) {
  return runs.map((run, i) => {
    if (run.script !== 'winansi' || !run.text) return run;

    let prev = null, next = null;
    for (let j = i - 1; j >= 0; j--) if (runs[j].script !== 'winansi') { prev = runs[j].script; break; }
    for (let j = i + 1; j < runs.length; j++) if (runs[j].script !== 'winansi') { next = runs[j].script; break; }

    const candidate = FONTKIT_RTL_SCRIPTS.has(prev) ? prev
                    : FONTKIT_RTL_SCRIPTS.has(next) ? next
                    : null;
    if (candidate && covers(candidate, run.text)) return { ...run, script: candidate };
    return run;
  });
}

/**
 * The text a run actually renders, and the font that renders it.
 * 'winansi' runs pass through on the caller's StandardFont; 'other' runs
 * (symbols, scripts we bundle no font for) are sanitized exactly as the
 * resolver used to do (symbol map / decompose / '?') and drawn on the
 * StandardFont; script runs render raw on their embedded font.
 *
 * @param {{ text: string, script: string }} run
 * @param {{ forRun?: (script: string, bold: boolean) => import('pdf-lib').PDFFont }} fontCtx
 * @param {import('pdf-lib').PDFFont} fallbackFont  caller's StandardFont (bold already applied)
 * @param {boolean} bold
 * @returns {{ text: string, font: import('pdf-lib').PDFFont }}
 */
function resolveRun(run, fontCtx, fallbackFont, bold) {
  if (run.script === 'winansi') return { text: run.text, font: fallbackFont };
  if (run.script === 'other')   return { text: toWinAnsiSafe(run.text), font: fallbackFont };
  const font = fontCtx && fontCtx.forRun ? fontCtx.forRun(run.script, bold) : null;
  if (!font) return { text: toWinAnsiSafe(run.text), font: fallbackFont };
  return { text: run.text, font };
}

/**
 * Width of a possibly mixed-script string, measured per run on the same font
 * that will draw it. Pure-WinAnsi input takes the exact single-font path.
 *
 * @param {object|null} fontCtx   font context from fontLoader (or null)
 * @param {boolean} bold
 * @param {import('pdf-lib').PDFFont} fallbackFont
 * @param {string} text
 * @param {number} size
 * @returns {number}
 */
/** The run list a mixed line measures AND draws — one source of truth. */
function lineRuns(fontCtx, bold, text) {
  const runs = hasRtl(text) ? visualSegments(text) : segmentRuns(text);
  return inheritNeutralScripts(runs, (script, t) => fontCoversText(fontCtx.forRun(script, bold), t));
}

function mixedWidth(fontCtx, bold, fallbackFont, text, size) {
  const s = String(text ?? '');
  if (!fontCtx || allWinAnsi(s)) return safeWidth(fallbackFont, s, size);
  let w = 0;
  for (const run of lineRuns(fontCtx, bold, s)) {
    const r = resolveRun(run, fontCtx, fallbackFont, bold);
    w += safeWidth(r.font, r.text, size);
  }
  return w;
}

/**
 * Draw a possibly mixed-script line, one run at a time, advancing x.
 * Pure-WinAnsi input produces the exact same single drawText call as before.
 *
 * Limitation (documented): when `rotate` is set and the line is mixed-script,
 * per-run advance does not compose with rotation, so rotated text falls back
 * to the sanitized single-font draw — identical to pre-Phase-1 behavior.
 * Rotation is only used by watermarks today.
 *
 * @param {import('pdf-lib').PDFPage} page
 * @param {object|null} fontCtx
 * @param {boolean} bold
 * @param {import('pdf-lib').PDFFont} fallbackFont
 * @param {string} text
 * @param {object} options  pdf-lib drawText options ({ x, y, size, color, opacity, rotate })
 */
function drawMixed(page, fontCtx, bold, fallbackFont, text, options) {
  const s = String(text ?? '');
  if (!fontCtx || allWinAnsi(s) || options.rotate) {
    const line = options.rotate && !allWinAnsi(s) ? toWinAnsiSafe(s) : s;
    drawTextSafe(page, line, { ...options, font: fallbackFont });
    return;
  }
  // Lines containing RTL text are laid out in visual run order (Phase 2);
  // pure-LTR mixed lines keep the logical order, which is already visual.
  // Neutral runs inherit their RTL neighbor's font (lineRuns).
  let x = options.x;
  for (const run of lineRuns(fontCtx, bold, s)) {
    const r = resolveRun(run, fontCtx, fallbackFont, bold);
    if (r.text) drawTextSafe(page, r.text, { ...options, x, font: r.font });
    x += safeWidth(r.font, r.text, options.size);
  }
}

module.exports = {
  safeWidth, drawTextSafe, encodableOrFallback, FALLBACK_CHAR,
  detectScript, segmentRuns, allWinAnsi, mixedWidth, drawMixed,
  hasRtl, visualSegments, baseDirection, inheritNeutralScripts, fontCoversText,
};
