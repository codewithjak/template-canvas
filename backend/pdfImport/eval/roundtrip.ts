/**
 * backend/pdfImport/eval/roundtrip.ts  —  Phase 0 (producer + integration)
 *
 * Proves: real PDF bytes (text + line + rect + image) → extract (Phase 1) →
 * deterministic pipeline (Phases 2/4/5/6) → a valid, editable TemplateDocument.
 * Framework-free. Run: npx tsx backend/pdfImport/eval/roundtrip.ts
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { extractPdf } from '../extract.js';
import { runDeterministicImport } from '../../../src/services/pdfImport/index';

const PX = 96 / 72;
const fails: string[] = [];
const check = (c: boolean, m: string) => { if (!c) fails.push(m); };
const approx = (a: number, b: number, tol = 4) => Math.abs(a - b) <= tol;

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 pt
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText('Invoice', { x: 72, y: 750, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Total: $250', { x: 72, y: 700, size: 12 });
  page.drawLine({ start: { x: 72, y: 690 }, end: { x: 523, y: 690 }, thickness: 2, color: rgb(0.8, 0.1, 0.1) });
  page.drawRectangle({ x: 72, y: 100, width: 200, height: 80, color: rgb(0.94, 0.94, 0.94), borderColor: rgb(0, 0, 0), borderWidth: 1 });
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  const img = await doc.embedPng(png);
  page.drawImage(img, { x: 400, y: 700, width: 60, height: 40 });
  return doc.save();
}

(async () => {
  const bytes = await makePdf();

  // Phase 1
  const extracted = await extractPdf(Buffer.from(bytes), 'invoice.pdf');
  const prims = extracted.pages[0].primitives;
  const kinds = (k: string) => prims.filter((p) => p.kind === k);
  check(kinds('text').length >= 2, `expected >=2 text prims, got ${kinds('text').length}`);
  check(kinds('line').length >= 1, `expected >=1 line prim, got ${kinds('line').length}`);
  check(kinds('rect').length >= 1, `expected >=1 rect prim, got ${kinds('rect').length}`);
  check(kinds('image').length >= 1, `expected >=1 image prim, got ${kinds('image').length}`);

  const imgPrim = kinds('image')[0] as { confidence: number } | undefined;
  check(!!imgPrim && imgPrim.confidence === 1, `image should decode (confidence 1), got ${imgPrim?.confidence}`);

  // Phases 2/4/5/6
  const { document, report } = runDeterministicImport(extracted);
  const els = document.pages[0].elements;
  const byType = (t: string) => els.filter((e) => e.type === t);

  check(document.pageSize?.preset === 'a4', `page size should be A4, got ${document.pageSize?.preset}`);
  check(byType('text').length >= 2, `expected >=2 text els, got ${byType('text').length}`);
  check(byType('line').length === 1, `expected 1 line el, got ${byType('line').length}`);
  check(byType('box').length === 1, `expected 1 box el, got ${byType('box').length}`);
  check(byType('image').length === 1, `expected 1 image el, got ${byType('image').length}`);

  // Box geometry: PDF (72,100) size 200x80 → canvas (96, (841.89-180)*PX), 266x107.
  const box = byType('box')[0] as { position: { x: number; y: number }; style: { width: number; height: number; backgroundColor: string } };
  check(approx(box.position.x, 72 * PX), `box X wrong: ${box.position.x}`);
  check(approx(box.position.y, (841.89 - 180) * PX), `box Y wrong: ${box.position.y}`);
  check(approx(box.style.width, 200 * PX), `box width wrong: ${box.style.width}`);
  check(approx(box.style.height, 80 * PX), `box height wrong: ${box.style.height}`);

  // Image element placed at PDF (400,700) size 60x40.
  const imgEl = byType('image')[0] as { position: { x: number; y: number }; src: string; style: { width: number } };
  check(approx(imgEl.position.x, 400 * PX), `image X wrong: ${imgEl.position.x}`);
  check(imgEl.src.startsWith('data:image/png'), 'image src should be a PNG data URL');
  check(approx(imgEl.style.width, 60 * PX), `image width wrong: ${imgEl.style.width}`);

  if (fails.length) {
    console.error('ROUNDTRIP FAILED:');
    fails.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('ROUNDTRIP PASSED');
  console.log(`  prims: ${kinds('text').length} text, ${kinds('line').length} line, ${kinds('rect').length} rect, ${kinds('image').length} image`);
  console.log(`  elements: ${els.length} (${byType('text').length} text, ${byType('line').length} line, ${byType('box').length} box, ${byType('image').length} image)`);
  console.log(`  box @ (${box.position.x},${box.position.y}) ${box.style.width}x${box.style.height} bg=${box.style.backgroundColor}`);
  console.log(`  image decoded=${imgPrim?.confidence === 1}  src=${imgEl.src.slice(0, 24)}…`);
  console.log(`  coverage=`, report.coverage);
})().catch((e) => { console.error('ROUNDTRIP ERROR:', e); process.exit(1); });
