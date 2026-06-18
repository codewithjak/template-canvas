/**
 * backend/pdfImport/eval/colorcheck.ts  —  text color extraction
 *
 * Generates a PDF with red/black/blue text and asserts the extractor reads each
 * run's fill color from the operator list (not the old hardcoded black).
 * Run: npx tsx backend/pdfImport/eval/colorcheck.ts
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extractPdf } from '../extract.js';

const fails: string[] = [];
const check = (c: boolean, m: string) => { if (!c) fails.push(m); };

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('RedTitle', { x: 72, y: 750, size: 18, font: f, color: rgb(0.85, 0.1, 0.1) });
  page.drawText('BlackBody', { x: 72, y: 700, size: 12, font: f, color: rgb(0, 0, 0) });
  page.drawText('BlueNote', { x: 72, y: 650, size: 12, font: f, color: rgb(0.1, 0.2, 0.8) });
  return doc.save();
}

(async () => {
  const extracted = await extractPdf(Buffer.from(await makePdf()), 'colors.pdf');
  const texts = extracted.pages[0].primitives.filter((p) => p.kind === 'text') as Array<{ text: string; color: string }>;
  const colorOf = (t: string) => texts.find((x) => x.text === t)?.color;

  check(colorOf('RedTitle') === '#d91a1a', `RedTitle should be red, got ${colorOf('RedTitle')}`);
  check(colorOf('BlackBody') === '#000000', `BlackBody should be black, got ${colorOf('BlackBody')}`);
  check(colorOf('BlueNote') === '#1a33cc', `BlueNote should be blue, got ${colorOf('BlueNote')}`);

  if (fails.length) {
    console.error('COLORCHECK FAILED:');
    fails.forEach((f) => console.error('  ✗ ' + f));
    process.exit(1);
  }
  console.log('COLORCHECK PASSED');
  console.log('  ' + texts.map((t) => `${t.text}=${t.color}`).join('  '));
})().catch((e) => { console.error('COLORCHECK ERROR:', e); process.exit(1); });
