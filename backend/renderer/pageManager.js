/**
 * pageManager.js
 *
 * Tracks the current page and Y cursor as elements are drawn.
 * All coordinates are in PDF points (pt).
 *
 * A4 dimensions:
 *   width  = 595.28 pt
 *   height = 841.89 pt
 *
 * Margins (matching canvas visual margins):
 *   top    = 20 pt
 *   bottom = 20 pt
 *   left   = 0  pt  (canvas elements already have x positions baked in)
 *   right  = 0  pt
 *
 * The usable content area per page is:
 *   contentHeight = 841.89 - 20 - 20 = 801.89 pt
 */

const A4_W  = 595.28;
const A4_H  = 841.89;
const MT    = 20;   // margin top (pt)
const MB    = 20;   // margin bottom (pt)

class PageManager {
  /**
   * @param {import('pdf-lib').PDFDocument} pdfDoc
   * @param {object} [opts]
   */
  constructor(pdfDoc, opts = {}) {
    this.doc         = pdfDoc;
    this.pageWidth   = opts.width  || A4_W;
    this.pageHeight  = opts.height || A4_H;
    this.marginTop   = opts.marginTop ?? MT;
    this.marginBot   = opts.marginBottom ?? MB;
    this.contentH    = this.pageHeight - this.marginTop - this.marginBot;

    // Add the first page
    this.page        = pdfDoc.addPage([this.pageWidth, this.pageHeight]);
    this.pageIndex   = 0;

    // Y cursor starts at top of content area.
    // pdf-lib uses bottom-left origin, so top = pageHeight - marginTop.
    this.y           = this.pageHeight - this.marginTop;
  }

  /**
   * Whether `height` pts fit between current y and the bottom margin.
   */
  fits(height) {
    return (this.y - height) >= this.marginBot;
  }

  /**
   * Move to a new page, reset Y to top of content area.
   * Returns the new page object.
   */
  newPage() {
    this.page      = this.doc.addPage([this.pageWidth, this.pageHeight]);
    this.pageIndex += 1;
    this.y         = this.pageHeight - this.marginTop;
    return this.page;
  }

  /**
   * Move the Y cursor down by `height` pts.
   */
  advance(height) {
    this.y -= height;
  }

  /**
   * Current page's top Y in pt (for drawing headers on continuation pages).
   */
  get topY() {
    return this.pageHeight - this.marginTop;
  }
}

module.exports = { PageManager, A4_W, A4_H, MT, MB };