'use strict';
/**
 * backend/pdfImport/extract.js  —  Phase 1 (extraction)
 *
 * Server-side PDF extraction using pdfjs-dist (already present via pd-to-img).
 * Deterministic ground truth for all downstream geometry — the inverse of the
 * existing pdfLibRenderer export. Produces the `ExtractedDocument` JSON contract
 * defined in src/services/pdfImport/types.ts (RawPrimitive in PDF points,
 * bottom-left origin). See AI_PDF_REBUILD_ARCHITECTURE.md Phase 1.
 *
 * SCOPE (this increment): TEXT extraction only. Vector ops (lines/rects via the
 * operator list + graphics-state tracking) and image XObjects are the next
 * increment — the Phase 0 round-trip diff quantifies exactly what's missing.
 */

let _pdfjs = null;
/** Lazy-load the ESM legacy build once (Node-friendly: no DOM/canvas, no worker). */
async function getPdfjs() {
  if (!_pdfjs) _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}

const RAD2DEG = 180 / Math.PI;

/** True for items pdfjs emits that carry no visible glyphs. */
function isBlank(str) {
  return !str || str.trim().length === 0;
}

/**
 * @param {Buffer|Uint8Array} data  raw PDF bytes
 * @param {string} [fileName]
 * @returns {Promise<import('./extract').ExtractedDocument>}
 */
async function extractPdf(data, fileName = 'upload.pdf') {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();

    const primitives = [];
    let i = 0;
    for (const item of tc.items) {
      if (isBlank(item.str)) continue;
      const t = item.transform; // [a, b, c, d, e, f]
      const x = t[4];
      const baselineY = t[5];
      const fontSizePt = Math.hypot(t[1], t[3]); // vertical scale of the text matrix
      if (!(fontSizePt > 0)) continue;
      const rotation = Math.round(Math.atan2(t[1], t[0]) * RAD2DEG * 100) / 100 || 0;
      const family = tc.styles?.[item.fontName]?.fontFamily || 'sans-serif';

      primitives.push({
        id: `p${pageNo}-${i++}`,
        source: 'vector',
        confidence: 1,
        kind: 'text',
        text: item.str,
        fontName: family,
        fontSizePt,
        rotation,
        color: '#000000', // TODO: derive from operator-list fill color (next increment)
        // rect: PDF points, lower-left origin. y = baseline; height ≈ font size.
        rect: {
          x,
          y: baselineY,
          width: item.width || item.str.length * fontSizePt * 0.5,
          height: fontSizePt,
        },
      });
    }

    pages.push({ widthPt: vp.width, heightPt: vp.height, primitives });
    page.cleanup();
  }

  await pdf.cleanup();
  return { fileName, pages };
}

module.exports = { extractPdf };
