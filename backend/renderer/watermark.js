'use strict';

/**
 * backend/renderer/watermark.js
 *
 * Stamps a diagonal "Made with Mapdoc" watermark across every page of a PDF
 * buffer. Used to brand free-tier exports server-side, where it cannot be
 * stripped by editing the client (unlike a canvas element the user could just
 * delete). Applied only when the plan lacks the `cleanExport` capability.
 *
 * Re-loads the finished PDF rather than touching the renderer internals, so it
 * stays a pure post-processing step with zero coupling to pdfLibRenderer.
 */

const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

const WATERMARK_TEXT = 'Made with Mapdoc · map-doc.com';

/**
 * @param {Buffer|Uint8Array} pdfBuffer  A rendered PDF.
 * @returns {Promise<Buffer>}            The same PDF with a watermark on each page.
 */
async function stampWatermark(pdfBuffer) {
  try {
    const pdf  = await PDFDocument.load(pdfBuffer);
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      // Scale text to the page diagonal so it spans the sheet at any size.
      const diagonal = Math.sqrt(width * width + height * height);
      const fontSize = Math.max(18, diagonal * 0.045);
      const textW    = font.widthOfTextAtSize(WATERMARK_TEXT, fontSize);

      // Centre the rotated baseline. 45° → offset by half the text width
      // along the diagonal so the label sits across the middle of the page.
      const angle = 45;
      const rad   = (angle * Math.PI) / 180;
      const x     = width / 2 - (textW / 2) * Math.cos(rad);
      const y     = height / 2 - (textW / 2) * Math.sin(rad);

      page.drawText(WATERMARK_TEXT, {
        x,
        y,
        size:     fontSize,
        font,
        color:    rgb(0.45, 0.5, 0.6),
        opacity:  0.18,
        rotate:   degrees(angle),
      });
    }

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  } catch (err) {
    // Never let watermarking break a download — fall back to the clean buffer.
    console.warn('[watermark] failed, returning unstamped PDF:', err.message);
    return Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  }
}

module.exports = { stampWatermark, WATERMARK_TEXT };
