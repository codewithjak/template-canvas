// ─────────────────────────────────────────────────────────────────────────────
// imageRenderer.js  —  PNG / JPEG emitter
//
// Image export is NOT a second renderer: it rasterizes the existing vector PDF
// (generatePdfBuffer) at a chosen DPI. This reuses 100% of the layout, placeholder
// resolution, table expansion, and multi-page logic — there is no separate drawing
// path to keep in sync, unlike the ZPL emitter.
//
//   template + ir ──> generatePdfBuffer ──> vector PDF ──> rasterize @ dpi ──> PNG/JPEG
//
// Crispness comes from sampling vectors at high density: text/shapes stay sharp at
// any DPI; only embedded raster images are bounded by their source resolution.
//
// Engine: pdf-to-img (pure-npm pdfjs wrapper that ships the Node canvas shims raw
// pdfjs lacks — see _spike + the image-export-engine note). Outputs PNG; JPEG is a
// transcode step (see transcodeToJpeg).
// ─────────────────────────────────────────────────────────────────────────────
const { generatePdfBuffer } = require('./pdfLibRenderer');

const PT_PER_INCH = 72;           // PDF user space: 1 point = 1/72 inch
const DEFAULT_DPI = 300;          // print-grade default
const DPI_MIN     = 72;
const DPI_MAX     = 600;          // guard rail: 600 DPI A4 ≈ 4961×7016px ≈ 100MB RGB

/**
 * Rasterize a vector PDF buffer into one image buffer per page.
 *
 * @param {Buffer} pdfBuffer
 * @param {number} dpi
 * @returns {Promise<Buffer[]>}  one PNG buffer per page, in order
 */
async function rasterizePdf(pdfBuffer, dpi) {
  // pdf-to-img is ESM-only; load it from this CommonJS module via dynamic import.
  const { pdf } = await import('pdf-to-img');
  const doc   = await pdf(pdfBuffer, { scale: dpi / PT_PER_INCH });
  const pages = [];
  for await (const pngBuffer of doc) pages.push(pngBuffer);   // doc is an async iterator of PNG buffers
  return pages;
}

/**
 * Transcode a PNG buffer to JPEG. JPEG has no alpha, so the page is flattened
 * onto white. Lazy-requires `sharp` so PNG export never pays for it.
 *
 * @param {Buffer} pngBuffer
 * @param {number} quality  0..1
 * @returns {Promise<Buffer>}
 */
async function transcodeToJpeg(pngBuffer, quality) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    throw new Error(
      "[imageRenderer] JPEG export needs the 'sharp' package (npm i sharp in backend/). " +
      "PNG export works without it."
    );
  }
  return sharp(pngBuffer)
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: Math.round(Math.max(0, Math.min(1, quality)) * 100) })
    .toBuffer();
}

/**
 * generateImageBuffers
 *
 * Same parameter bag as generatePdfBuffer, plus image options. Returns one entry
 * per page (a multi-page document yields multiple images — callers decide whether
 * to zip them).
 *
 * @param {{
 *   ir:                       object,
 *   templateElements?:        object[],
 *   fieldMapping?:            Record<string,string>,
 *   tableCollectionBindings?: Record<string,string>,
 *   collectionMappings?:      Record<string,Record<string,string>>,
 *   pageConfigs?:             object[],
 *   pageSize?:                object|null,
 *   imageFormat?:             'png'|'jpeg',
 *   dpi?:                     number,
 *   jpegQuality?:             number,   // 0..1, JPEG only
 * }} params
 * @returns {Promise<Array<{ buffer: Buffer, pageIndex: number, ext: string, contentType: string }>>}
 */
async function generateImageBuffers({
  imageFormat = 'png',
  dpi         = DEFAULT_DPI,
  jpegQuality = 0.92,
  ...pdfParams
}) {
  const format = String(imageFormat).toLowerCase() === 'jpeg' || String(imageFormat).toLowerCase() === 'jpg'
    ? 'jpeg' : 'png';
  const safeDpi = Math.max(DPI_MIN, Math.min(DPI_MAX, Math.round(Number(dpi) || DEFAULT_DPI)));

  // 1. Vector PDF — reuse the entire existing pipeline.
  const pdfBuffer = await generatePdfBuffer(pdfParams);

  // 2. Rasterize every page at the requested density.
  const pngPages = await rasterizePdf(pdfBuffer, safeDpi);

  // 3. Optional transcode + tag each page with its mime/extension.
  const ext         = format === 'jpeg' ? 'jpg' : 'png';
  const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const out = [];
  for (let i = 0; i < pngPages.length; i++) {
    const buffer = format === 'jpeg' ? await transcodeToJpeg(pngPages[i], jpegQuality) : pngPages[i];
    out.push({ buffer, pageIndex: i, ext, contentType });
  }
  return out;
}

module.exports = { generateImageBuffers };
