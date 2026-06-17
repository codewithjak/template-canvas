/**
 * backend/pdfImport/eval/roundtrip.ts  —  Phase 0 (producer + integration)
 *
 * Proves: real PDF bytes → extract (Phase 1) → deterministic pipeline
 * (Phases 2/4/5/6) → a valid, editable TemplateDocument. Framework-free.
 * Run: npx tsx backend/pdfImport/eval/roundtrip.ts
 *
 * Sited under backend/ so `pdf-lib`/`pdfjs-dist` resolve from backend/node_modules;
 * reaches into src/ for the TypeScript pipeline (tsx compiles it on the fly).
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extractPdf } from '../extract.js';
import { runDeterministicImport } from '../../../src/services/pdfImport/index';

const PX = 96 / 72;
const fails: string[] = [];
const check = (c: boolean, m: string) => { if (!c) fails.push(m); };
const approx = (a: number, b: number, tol = 3) => Math.abs(a - b) <= tol;

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4 pt
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText('Invoice', { x: 72, y: 750, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Total: $250', { x: 72, y: 700, size: 12 });
  return doc.save();
}

(async () => {
  const bytes = await makePdf();

  // Phase 1
  const extracted = await extractPdf(Buffer.from(bytes), 'invoice.pdf');
  check(extracted.pages.length === 1, `expected 1 extracted page, got ${extracted.pages.length}`);
  const texts = extracted.pages[0].primitives.filter((p) => p.kind === 'text');
  check(texts.length >= 2, `expected >=2 text primitives, got ${texts.length}`);

  // Phases 2/4/5/6
  const { document, report } = runDeterministicImport(extracted);

  check(document.version === '2.0', 'document should be v2.0');
  check(document.pages.length === 1, 'should produce 1 page');
  check(document.pageSize?.preset === 'a4', `page size should be A4, got ${document.pageSize?.preset}`);

  const els = document.pages[0].elements;
  const textEls = els.filter((e) => e.type === 'text') as Array<{ content: string; position: { x: number; y: number }; style: { fontFamily: string } }>;
  const contents = textEls.map((e) => e.content);

  check(contents.includes('Invoice'), `should contain "Invoice", got ${JSON.stringify(contents)}`);
  check(contents.some((c) => c.includes('Total') && c.includes('250')), `should contain the total line, got ${JSON.stringify(contents)}`);

  // Helvetica should map to the Arial house family (not Georgia — the sans-serif fix).
  const invoice = textEls.find((e) => e.content === 'Invoice')!;
  check(invoice.style.fontFamily === 'Arial', `Helvetica should map to Arial, got ${invoice.style.fontFamily}`);

  // Geometry: baseline 750, size 18 → canvas top = (841.89 - 768) * PX ; x = 72 * PX.
  check(approx(invoice.position.x, 72 * PX), `Invoice X wrong: ${invoice.position.x} (want ~${(72 * PX).toFixed(1)})`);
  check(approx(invoice.position.y, (841.89 - (750 + 18)) * PX), `Invoice Y wrong: ${invoice.position.y} (want ~${((841.89 - 768) * PX).toFixed(1)})`);

  // Nothing silently lost.
  check(report.coverage.mapped === els.length, 'all elements should be reported mapped');
  check(report.coverage.dropped === 0, `nothing should be dropped, got ${report.coverage.dropped}`);

  if (fails.length) {
    console.error('ROUNDTRIP FAILED:');
    fails.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('ROUNDTRIP PASSED');
  console.log(`  extracted text primitives: ${texts.length}`);
  console.log(`  elements: ${els.length}  texts: ${JSON.stringify(contents)}`);
  console.log(`  Invoice @ (${invoice.position.x}, ${invoice.position.y}) family=${invoice.style.fontFamily}`);
  console.log(`  pageSize=${document.pageSize?.preset}  coverage=`, report.coverage);
})().catch((e) => { console.error('ROUNDTRIP ERROR:', e); process.exit(1); });
