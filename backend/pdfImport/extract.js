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
 * Extracts: text (getTextContent) + vector lines/rects + images
 * (getOperatorList with graphics-state tracking).
 */

let _pdfjs = null;
async function getPdfjs() {
  if (!_pdfjs) _pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return _pdfjs;
}

let _sharp = null;
function getSharp() {
  if (_sharp === null) { try { _sharp = require('sharp'); } catch { _sharp = false; } }
  return _sharp;
}

const RAD2DEG = 180 / Math.PI;
// 1x1 transparent PNG — placeholder when image pixels can't be decoded.
const PLACEHOLDER_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQDJ/EpoAAAAAElFTkSuQmCC';

const isBlank = (s) => !s || s.trim().length === 0;

// ── Matrix helpers (PDF row-vector convention; mirrors pdfjs Util.transform) ────

const IDENTITY = [1, 0, 0, 1, 0, 0];
/** Concatenate m onto ctm: result applies m first, then ctm. */
function mul(ctm, m) {
  return [
    ctm[0] * m[0] + ctm[2] * m[1],
    ctm[1] * m[0] + ctm[3] * m[1],
    ctm[0] * m[2] + ctm[2] * m[3],
    ctm[1] * m[2] + ctm[3] * m[3],
    ctm[0] * m[4] + ctm[2] * m[5] + ctm[4],
    ctm[1] * m[4] + ctm[3] * m[5] + ctm[5],
  ];
}
const applyPt = ([x, y], m) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/** Uniform scale magnitude of a matrix (for line widths). */
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

/** Device-space bbox of a set of points. */
function bboxOfPts(pts) {
  const xs = pts.map((p) => p[0]); const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// ── Text color (from operator-list fill state) ─────────────────────────────────

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const grayHex = (g) => { const v = hex2(g * 255); return `#${v}${v}${v}`; };
const cmykHex = (c, m, y, k) =>
  `#${hex2(255 * (1 - c) * (1 - k))}${hex2(255 * (1 - m) * (1 - k))}${hex2(255 * (1 - y) * (1 - k))}`;

/**
 * Walk the op list tracking the current fill color and text position; record a
 * (x, y, color) span at each text-show op. pdfjs gives fill RGB as a hex string,
 * gray as a number, CMYK as 4 numbers. (probe: setFillRGBColor → setTextMatrix → showText)
 */
function buildTextColorSpans(ops, OPS) {
  const show = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText]);
  const spans = [];
  let fill = '#000000';
  let tx = 0, ty = 0;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i];
    if (fn === OPS.setFillRGBColor) { if (typeof a[0] === 'string') fill = a[0]; }
    else if (fn === OPS.setFillGray) { if (typeof a[0] === 'number') fill = grayHex(a[0]); }
    else if (fn === OPS.setFillCMYKColor) { if (a.length >= 4) fill = cmykHex(a[0], a[1], a[2], a[3]); }
    else if (fn === OPS.setTextMatrix) { const m = a[0]; if (m) { tx = m[4]; ty = m[5]; } }
    else if (fn === OPS.moveText) { tx += a[0] ?? 0; ty += a[1] ?? 0; }
    else if (show.has(fn)) { spans.push({ x: tx, y: ty, color: fill }); }
  }
  return spans;
}

/** Nearest span's color to a text run's baseline (x,y); black if none close. */
function colorAt(spans, x, y) {
  let best = '#000000';
  let bestD = 6; // px tolerance — positions match exactly in practice
  for (const s of spans) {
    const d = Math.abs(s.x - x) + Math.abs(s.y - y);
    if (d < bestD) { bestD = d; best = s.color; }
  }
  return best;
}

// ── Text ────────────────────────────────────────────────────────────────────

function extractText(tc, colorSpans, nextId) {
  const out = [];
  for (const item of tc.items) {
    if (isBlank(item.str)) continue;
    const t = item.transform;
    const fontSizePt = Math.hypot(t[1], t[3]);
    if (!(fontSizePt > 0)) continue;
    out.push({
      id: nextId(), source: 'vector', confidence: 1, kind: 'text',
      text: item.str,
      fontName: tc.styles?.[item.fontName]?.fontFamily || 'sans-serif',
      fontSizePt,
      rotation: Math.round(Math.atan2(t[1], t[0]) * RAD2DEG * 100) / 100 || 0,
      color: colorAt(colorSpans, t[4], t[5]),
      rect: { x: t[4], y: t[5], width: item.width || item.str.length * fontSizePt * 0.5, height: fontSizePt },
    });
  }
  return out;
}

// ── Vector graphics + images (operator list) ──────────────────────────────────

async function extractOps(page, pdfjs, ops, pageNo, nextId) {
  const { OPS } = pdfjs;
  const STROKE = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke]);
  const FILL = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke]);

  const out = [];

  let ctm = IDENTITY;
  let fill = '#000000', stroke = '#000000', lineWidth = 1;
  const stack = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const a = ops.argsArray[i];
    switch (fn) {
      case OPS.save: stack.push([ctm, fill, stroke, lineWidth]); break;
      case OPS.restore: if (stack.length) [ctm, fill, stroke, lineWidth] = stack.pop(); break;
      case OPS.transform: ctm = mul(ctm, a); break;
      case OPS.setLineWidth: lineWidth = a[0]; break;
      case OPS.setStrokeRGBColor: if (typeof a[0] === 'string') stroke = a[0]; break;
      case OPS.setFillRGBColor: if (typeof a[0] === 'string') fill = a[0]; break;

      case OPS.constructPath: {
        const paintOp = a[0];
        const minMax = a[2]; // [minX, minY, maxX, maxY] in current user space
        if (!minMax || minMax.length < 4) break;
        const hasStroke = STROKE.has(paintOp);
        const hasFill = FILL.has(paintOp);
        if (!hasStroke && !hasFill) break; // clip / endPath — not painted

        // Transform the bbox corners to device (PDF-point) space.
        const corners = [
          applyPt([minMax[0], minMax[1]], ctm),
          applyPt([minMax[2], minMax[1]], ctm),
          applyPt([minMax[2], minMax[3]], ctm),
          applyPt([minMax[0], minMax[3]], ctm),
        ];
        const box = bboxOfPts(corners);
        const thickness = lineWidth * scaleOf(ctm);

        // Degenerate in one axis → line; otherwise a rectangle.
        if (Math.min(box.width, box.height) < 3) {
          out.push({
            id: nextId(), source: 'vector', confidence: 1, kind: 'line',
            thicknessPt: Math.max(0.5, thickness), color: hasStroke ? stroke : fill, rect: box,
          });
        } else {
          out.push({
            id: nextId(), source: 'vector', confidence: 1, kind: 'rect',
            strokeWidthPt: hasStroke ? Math.max(0.5, thickness) : 0,
            strokeColor: stroke,
            fillColor: hasFill ? fill : null,
            rect: box,
          });
        }
        break;
      }

      case OPS.paintImageXObject:
      case OPS.paintImageXObjectRepeat: {
        const objId = a[0];
        // Unit square (0,0)-(1,1) under the CTM gives the placement rect.
        const box = bboxOfPts([
          applyPt([0, 0], ctm), applyPt([1, 0], ctm), applyPt([1, 1], ctm), applyPt([0, 1], ctm),
        ]);
        if (box.width < 1 || box.height < 1) break;
        const { dataUrl, decoded } = await decodeImage(page, objId);
        out.push({
          id: nextId(), source: 'vector', confidence: decoded ? 1 : 0.5,
          kind: 'image', dataUrl, rect: box,
        });
        break;
      }
      default: break;
    }
  }
  return out;
}

/**
 * Resolve a pdfjs object. Image XObjects are NOT resolved synchronously after
 * getOperatorList (`objs.has` is false, sync `get` throws) — the callback form
 * resolves them. Guarded by a timeout so a never-resolving dependency can't hang.
 */
function resolveObj(page, objId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      if (page.objs.has(objId)) return finish(page.objs.get(objId));
      page.objs.get(objId, finish);
    } catch { return finish(null); }
    setTimeout(() => finish(null), 2000);
  });
}

/** Resolve a pdfjs image object and PNG-encode it via sharp; placeholder on failure. */
async function decodeImage(page, objId) {
  const placeholder = { dataUrl: PLACEHOLDER_PNG, decoded: false };
  try {
    const img = await resolveObj(page, objId);
    if (!img || !img.data) return placeholder;
    const sharp = getSharp();
    if (!sharp) return placeholder;

    // pdfjs ImageKind: 1=GRAYSCALE_1BPP, 2=RGB_24BPP, 3=RGBA_32BPP.
    const channels = img.kind === 3 ? 4 : img.kind === 2 ? 3 : 0;
    if (!channels) return placeholder;
    if (img.data.length < img.width * img.height * channels) return placeholder;

    const png = await sharp(Buffer.from(img.data), {
      raw: { width: img.width, height: img.height, channels },
    }).png().toBuffer();
    return { dataUrl: `data:image/png;base64,${png.toString('base64')}`, decoded: true };
  } catch {
    return placeholder;
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────

/**
 * @param {Buffer|Uint8Array} data
 * @param {string} [fileName]
 * @returns {Promise<import('./extract').ExtractedDocument>}
 */
async function extractPdf(data, fileName = 'upload.pdf') {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data), useSystemFonts: true, isEvalSupported: false }).promise;

  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const vp = page.getViewport({ scale: 1 });

    let counter = 0;
    const nextId = () => `p${pageNo}-${counter++}`;

    const ops = await page.getOperatorList();
    const colorSpans = buildTextColorSpans(ops, pdfjs.OPS);

    const tc = await page.getTextContent();
    const textPrims = extractText(tc, colorSpans, nextId);
    const opPrims = await extractOps(page, pdfjs, ops, pageNo, nextId);

    pages.push({ widthPt: vp.width, heightPt: vp.height, primitives: [...textPrims, ...opPrims] });
    page.cleanup();
  }

  await pdf.cleanup();
  return { fileName, pages };
}

module.exports = { extractPdf };
