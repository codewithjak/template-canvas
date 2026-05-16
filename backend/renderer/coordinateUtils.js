/**
 * coordinateUtils.js
 *
 * Handles the coordinate system translation between canvas pixels and PDF points.
 *
 * Canvas coordinate system:
 *   - Origin: top-left
 *   - Units: CSS pixels at 96 DPI
 *   - A4 canvas size: 794 × 1123 px
 *   - Y increases downward
 *
 * PDF coordinate system (pdf-lib):
 *   - Origin: bottom-left
 *   - Units: points at 72 DPI
 *   - A4 page size: 595.28 × 841.89 pt
 *   - Y increases upward
 *
 * Scale factor:
 *   px → pt = 595.28 / 794 ≈ 0.7497
 *   This is applied uniformly to x, y, width, height, fontSize.
 *
 * Y conversion (canvas top-left origin → PDF bottom-left origin):
 *   The PageManager tracks the current Y in PDF pt from the top of the
 *   content area. Individual element renderers receive the PDF Y directly
 *   from the PageManager — they do NOT convert canvas Y themselves.
 *   Canvas Y is only used to determine draw ORDER (sort elements top→bottom).
 */

const CANVAS_W = 794;    // canvas width in px
const PDF_W    = 595.28; // A4 width in pt

// Uniform scale: 1 canvas px = SCALE PDF pt
const SCALE = PDF_W / CANVAS_W;  // ≈ 0.7497

/**
 * Convert a canvas pixel measurement to PDF points.
 * Used for x positions, widths, heights, font sizes, border widths.
 * @param {number} px
 * @returns {number} pt
 */
function px(pixels) {
  return (pixels || 0) * SCALE;
}

/**
 * Parse a CSS hex/rgb color string to an rgb tuple [0..1, 0..1, 0..1].
 * Falls back to black on any parse failure.
 * @param {string} color  e.g. '#214883' or 'rgb(33,72,131)' or '#fff'
 * @returns {[number, number, number]}
 */
function parseColor(color) {
  if (!color || typeof color !== 'string') return [0, 0, 0];

  const s = color.trim();

  // #rrggbb or #rgb
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) return [r, g, b];
    }
  }

  // rgb(r, g, b)
  const rgb = s.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgb) {
    return [
      parseInt(rgb[1]) / 255,
      parseInt(rgb[2]) / 255,
      parseInt(rgb[3]) / 255,
    ];
  }

  // Named colours (small subset used in templates)
  const named = {
    black       : [0, 0, 0],
    white       : [1, 1, 1],
    red         : [1, 0, 0],
    green       : [0, 0.502, 0],
    blue        : [0, 0, 1],
    transparent : [1, 1, 1],   // treat as white in PDF
  };
  if (named[s.toLowerCase()]) return named[s.toLowerCase()];

  return [0, 0, 0];  // fallback: black
}

/**
 * Wrap text into lines that fit within maxWidth pt, using the given pdf-lib font.
 * @param {string} text
 * @param {import('pdf-lib').PDFFont} font
 * @param {number} fontSizePt
 * @param {number} maxWidthPt
 * @returns {string[]}
 */
function wrapText(text, font, fontSizePt, maxWidthPt) {
  if (!text) return [''];
  const lines   = [];
  const paragraphs = String(text).split('\n');

  for (const para of paragraphs) {
    if (!para) { lines.push(''); continue; }
    const words = para.split(' ');
    let line = '';

    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      let w = 0;
      try { w = font.widthOfTextAtSize(test, fontSizePt); } catch (e) { w = 0; }
      if (w > maxWidthPt && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [''];
}

/**
 * Measure the height of wrapped text in pt.
 * @param {string} text
 * @param {import('pdf-lib').PDFFont} font
 * @param {number} fontSizePt
 * @param {number} maxWidthPt
 * @param {number} lineHeightPt  defaults to fontSizePt * 1.3
 * @returns {number} total height in pt
 */
function measureTextHeight(text, font, fontSizePt, maxWidthPt, lineHeightPt) {
  const lh    = lineHeightPt || fontSizePt * 1.3;
  const lines = wrapText(text, font, fontSizePt, maxWidthPt);
  return lines.length * lh;
}

module.exports = { px, parseColor, wrapText, measureTextHeight, SCALE, CANVAS_W, PDF_W };