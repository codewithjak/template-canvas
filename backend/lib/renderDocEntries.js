'use strict';

/**
 * renderDocEntries.js
 *
 * Renders one document into the file(s) that should go into a bulk zip:
 *   - pdf / zpl  -> one file
 *   - png / jpeg -> one file PER PAGE (the PDF is watermarked FIRST, then turned
 *                   into images, so free-tier branding is baked into the pixels)
 *
 * Returns an array of { buffer, ext, pageIndex, multi } ready to append to the
 * archive.
 */

const { generatePdfBuffer } = require('../renderer/pdfLibRenderer');
const { generateZplBuffer } = require('../renderer/zplRenderer');
const { rasterizePdfBuffer, isImageFormat } = require('../renderer/imageRenderer');
const { stampWatermark } = require('../renderer/watermark');
const { extForFormat } = require('./fileNames');

async function renderDocEntries({ format, genArgs, gate, dpi, jpegQuality }) {
  if (isImageFormat(format)) {
    let pdf = await generatePdfBuffer(genArgs);
    if (gate.watermark) pdf = await stampWatermark(pdf);
    const pages = await rasterizePdfBuffer(pdf, { imageFormat: format, dpi, jpegQuality });
    const multi = pages.length > 1;
    return pages.map(p => ({ buffer: p.buffer, ext: `.${p.ext}`, pageIndex: p.pageIndex, multi }));
  }
  const raw    = await (format === 'zpl' ? generateZplBuffer : generatePdfBuffer)(genArgs);
  const buffer = (gate.watermark && format !== 'zpl') ? await stampWatermark(raw) : raw;
  return [{ buffer, ext: extForFormat(format), pageIndex: 0, multi: false }];
}

module.exports = { renderDocEntries };
