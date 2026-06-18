/**
 * backend/pdfImport/eval/live.ts  —  LIVE end-to-end (requires ANTHROPIC_API_KEY + running server)
 *
 * Builds a realistic invoice PDF, then hits the live endpoints:
 *   /pdf-import (extract) → normalize → /pdf-structure (Claude) → /pdf-match (Claude)
 * and prints what the AI actually produced. Run with the backend up:
 *   PORT=3195 node index.js     (in backend/, key from .env)
 *   PORT=3195 npx tsx backend/pdfImport/eval/live.ts
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { normalize, runImport, signatureFromBlocks, buildCorpus } from '../../../src/services/pdfImport/index';
import { BUILTIN_TEMPLATES } from '../../../src/templates/registry';

const BASE = `http://localhost:${process.env.PORT || '3195'}`;

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText('ACME Corp — Invoice', { x: 72, y: 760, size: 20, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText('Invoice No: INV-2026-014', { x: 72, y: 730, size: 11, font: reg });
  // wrapped paragraph (two lines, should group)
  page.drawText('This invoice covers consulting services rendered', { x: 72, y: 700, size: 11, font: reg });
  page.drawText('during the month of June 2026 as agreed.', { x: 72, y: 686, size: 11, font: reg });
  // table: header + 2 rows, 3 columns
  const cols = [72, 150, 420];
  const head = ['Qty', 'Description', 'Amount'];
  head.forEach((h, i) => page.drawText(h, { x: cols[i], y: 640, size: 11, font: bold }));
  const rows = [['2', 'Consulting', '$500'], ['1', 'Setup fee', '$100']];
  rows.forEach((r, ri) => r.forEach((c, ci) => page.drawText(c, { x: cols[ci], y: 620 - ri * 18, size: 11, font: reg })));
  page.drawText('Page 1 of 1', { x: 270, y: 50, size: 9, font: reg });
  return doc.save();
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, json: res.ok ? await res.json() : await res.json().catch(() => ({})) };
}

(async () => {
  const bytes = await makePdf();

  // 1) extract (multipart)
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'invoice.pdf');
  const er = await fetch(`${BASE}/pdf-import`, { method: 'POST', body: form });
  const extracted = await er.json();
  console.log(`extract: ${er.status}  pages=${extracted.pages?.length}  prims=${extracted.pages?.[0]?.primitives?.length}`);

  const normalized = normalize(extracted);
  console.log(`normalize: ${normalized.pages[0].blocks.length} blocks`);

  // 2) structure (LIVE Claude)
  const s = await post('/pdf-structure', { pages: normalized.pages });
  console.log(`\n/pdf-structure: ${s.status}`);
  if (s.status === 200) {
    const p = s.json.pages[0];
    console.log('  groups:', JSON.stringify(p.groups));
    console.log('  tables:', JSON.stringify(p.tables));
    console.log('  headerBlockIds:', JSON.stringify(p.headerBlockIds), ' footerBlockIds:', JSON.stringify(p.footerBlockIds));
  } else { console.log('  ', JSON.stringify(s.json)); }

  // 3) match (LIVE Claude)
  const corpus = buildCorpus(BUILTIN_TEMPLATES);
  const m = await post('/pdf-match', { extracted: { labels: signatureFromBlocks(normalized).labels }, corpus });
  console.log(`\n/pdf-match: ${m.status}`);
  console.log('  ', JSON.stringify(m.json));

  // 4) assemble with the live plan
  if (s.status === 200) {
    const { document } = runImport(normalized, s.json);
    const types: Record<string, number> = {};
    document.pages[0].elements.forEach((e) => { types[e.type] = (types[e.type] || 0) + 1; });
    console.log('\nfinal document element types:', JSON.stringify(types));
    console.log('footer zone enabled:', document.pages[0].footer.enabled);
  }
  console.log('\nLIVE RUN COMPLETE');
})().catch((e) => { console.error('LIVE ERROR:', e); process.exit(1); });
