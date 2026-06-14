/* eslint-disable */
/**
 * THROWAWAY SPIKE — DELETE WHEN DONE.
 *
 * Proves: vector PDF -> crisp PNG at a chosen DPI, in Node.
 *
 * FINDING: raw pdfjs-dist + a Node canvas backend does NOT render text:
 *   - node-canvas has no Path2D  -> glyph fills silently no-op (text invisible)
 *   - @napi-rs/canvas has Path2D  -> pdfjs paintChar throws a signature mismatch
 * Shapes render either way; only TEXT breaks. The fix is to use a wrapper that
 * ships the correct Node shims (pdf-to-img), or the poppler binary. Both verified.
 *
 * Usage:
 *   node rasterize.js                  # generates a sample A4 PDF, then rasterizes it
 *   node rasterize.js /path/to.pdf     # rasterize YOUR real exported brochure (the real test)
 *   node rasterize.js /path/to.pdf 600 # override DPI (default 300)
 *
 * Output: out-p1.png, out-p2.png, ... — open and compare against the source PDF.
 */
const fs   = require('fs');
const path = require('path');

const DEFAULT_DPI = 300;
const PT_PER_INCH = 72; // PDFs measure in points; 1pt = 1/72 inch

async function makeSamplePdf(file) {
  const { PDFDocument, rgb } = require('pdf-lib');
  const fontkit = require('@pdf-lib/fontkit');
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const page = doc.addPage([595.28, 841.89]); // A4 in points
  // Embed real glyphs (pdf-lib StandardFonts are non-embedded; embedding mirrors real PDFs).
  const bold = await doc.embedFont(fs.readFileSync('/usr/share/fonts/truetype/freefont/FreeSansBold.ttf'));
  const body = await doc.embedFont(fs.readFileSync('/usr/share/fonts/truetype/freefont/FreeSans.ttf'));

  page.drawRectangle({ x: 0, y: 741, width: 595.28, height: 100.89, color: rgb(0.10, 0.22, 0.37) });
  page.drawText('LAKESIDE RESIDENCE', { x: 40, y: 788, size: 30, font: bold, color: rgb(1, 1, 1) });
  page.drawText('A crispness test for vector -> raster', { x: 40, y: 760, size: 12, font: body, color: rgb(0.85, 0.9, 0.95) });
  page.drawText('The quick brown fox jumps over the lazy dog. 0123456789', { x: 40, y: 700, size: 11, font: body, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('6pt fine print: registered office details and disclaimers go here.', { x: 40, y: 670, size: 6, font: body, color: rgb(0.2, 0.2, 0.2) });
  for (let i = 0; i < 8; i++) {
    page.drawLine({ start: { x: 40, y: 640 - i * 4 }, end: { x: 555, y: 640 - i * 4 }, thickness: 0.25 + i * 0.1, color: rgb(0, 0, 0) });
  }
  fs.writeFileSync(file, await doc.save());
}

async function main() {
  const arg = process.argv[2];
  const dpi = Number(process.argv[3]) || DEFAULT_DPI;

  let src = arg;
  if (!src) { src = path.join(__dirname, 'sample.pdf'); await makeSamplePdf(src); }
  console.log(`Source: ${src}  |  DPI: ${dpi}  |  scale: ${(dpi / PT_PER_INCH).toFixed(4)}`);

  // pdf-to-img wraps pdfjs with the Node shims raw pdfjs lacks. scale = dpi/72.
  const { pdf } = await import('pdf-to-img');
  const doc = await pdf(src, { scale: dpi / PT_PER_INCH });

  let n = 0;
  for await (const png of doc) {
    n++;
    const out = path.join(__dirname, `out-p${n}.png`);
    fs.writeFileSync(out, png);
    console.log(`  page ${n}: ${(png.length / 1e6).toFixed(2)} MB  ->  ${out}`);
  }
  console.log(`\nDone (${n} page${n === 1 ? '' : 's'}). Open out-p*.png and compare against the source PDF.`);
}

main().catch((e) => { console.error('SPIKE FAILED:', e); process.exit(1); });
