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
import {
  normalize, runImport, signatureFromBlocks, buildCorpus, extractSlots, MATCH_STRONG,
} from '../../../src/services/pdfImport/index';
import { BUILTIN_TEMPLATES } from '../../../src/templates/registry';

// Pure pipeline only — the frontend service can't load under Node (Vite env).
const BASE = `http://localhost:${process.env.PORT || '3001'}`;

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

  // 2) match → exemplar (corpus is a NAMING hint only, never a replacement)
  const m = await post('/pdf-match', {
    extracted: { labels: signatureFromBlocks(normalized).labels },
    corpus: buildCorpus(BUILTIN_TEMPLATES),
  });
  console.log(`\n/pdf-match: ${m.status} →`, JSON.stringify(m.json));
  let exemplar = null;
  if (m.status === 200 && m.json.key && m.json.confidence >= MATCH_STRONG) {
    const hit = BUILTIN_TEMPLATES.find(t => t.id === m.json.key);
    if (hit) {
      const slots = extractSlots(hit.doc);
      exemplar = { fields: slots.fields, tables: slots.tables.map(t => ({ columns: t.columns })) };
      console.log(`  exemplar (naming hint) from "${hit.name}": ${exemplar.fields.slice(0, 5).map(f => f.token).join(', ')}…`);
    }
  }

  // 3) structure WITH the exemplar (LIVE Claude) — tokenizes THIS PDF, aligned names
  const s = await post('/pdf-structure', { pages: normalized.pages, exemplar: exemplar ?? undefined });
  console.log(`\n/pdf-structure: ${s.status}`);
  if (s.status !== 200) { console.log('  ', JSON.stringify(s.json), '\n(no key — cannot verify tokenization)'); return; }

  // 4) TEMPLATE mode → tokenized reusable template (the default, the fix)
  {
    const { document } = runImport(normalized, s.json, 'template');
    const json = JSON.stringify(document);
    const textEls = document.pages[0].elements.filter(e => e.type === 'text' || e.type === 'paragraph') as { content: string }[];
    const tbl = document.pages[0].elements.find(e => e.type === 'table') as
      { rows?: { cells: { content: { value: string } }[] }[]; binding?: { enabled?: boolean; collectionKey?: string } } | undefined;
    console.log('\n── TEMPLATE mode ──');
    console.log('  text contents:', JSON.stringify(textEls.map(e => e.content)));
    console.log('  has {{tokens}}?              ', /\{\{[^}]+\}\}/.test(json));
    console.log('  literal "INV-2026-014" gone? ', !json.includes('INV-2026-014'), '(should be a token)');
    // Proves it is THIS PDF tokenized, NOT the stock built-in (which has no such text).
    console.log('  built from THIS pdf?         ', /consulting services/i.test(json), '(PDF\'s own paragraph text present)');
    if (tbl) {
      console.log('  table rows:', JSON.stringify(tbl.rows?.map(r => r.cells.map(c => c.content.value))));
      console.log('  table bound?              ', tbl.binding?.enabled === true, '→', tbl.binding?.collectionKey);
    }
  }

  // 5) DOCUMENT mode → literal values (the opt-in)
  {
    const { document } = runImport(normalized, s.json, 'document');
    const json = JSON.stringify(document);
    console.log('\n── DOCUMENT mode ──');
    console.log('  literal "INV-2026-014" present?', json.includes('INV-2026-014'));
    console.log('  has {{tokens}}?               ', /\{\{[^}]+\}\}/.test(json), '(should be false)');
  }

  console.log('\nLIVE RUN COMPLETE');
})().catch((e) => { console.error('LIVE ERROR:', e); process.exit(1); });
