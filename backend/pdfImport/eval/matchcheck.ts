/**
 * backend/pdfImport/eval/matchcheck.ts  —  retrieval (deterministic half)
 *
 * Verifies signatures, corpus building from the real 26 built-ins, and the
 * alignment-exemplar slot extraction — WITHOUT a live Claude call (the /pdf-match
 * decision needs an API key). Run: npx tsx backend/pdfImport/eval/matchcheck.ts
 */

import {
  signatureFromTemplate, signatureFromBlocks, buildCorpus, extractSlots,
} from '../../../src/services/pdfImport/index';
import { createPage, createTemplateDocument, type TemplateDocument } from '../../../src/types/canvas';
import type { NormalizedDocument } from '../../../src/services/pdfImport/types';
import { BUILTIN_TEMPLATES } from '../../../src/templates/registry';

const fails: string[] = [];
const check = (c: boolean, m: string) => { if (!c) fails.push(m); };

// A small invoice-ish template (label text + a token + a table header).
const doc: TemplateDocument = createTemplateDocument(
  [createPage({
    pageId: 'p1',
    elements: [
      { id: 'a', type: 'text', content: 'Invoice Number', position: { x: 0, y: 0 },
        style: { fontSize: 12, fontWeight: 'normal', color: '#000', fontFamily: 'Arial' } },
      { id: 'tbl', type: 'table', schemaVersion: 2, position: { x: 0, y: 0 },
        columns: [{ id: 'c', width: 10 }],
        headerRow: { id: 'h', cells: [{ id: 'hc', content: { type: 'text', value: 'Qty' } }] },
        rows: [{ id: 'r', cells: [{ id: 'rc', content: { type: 'text', value: '{{qty}}' } }] }],
        style: { fontSize: 10, fontWeight: 'normal', color: '#000', fontFamily: 'Arial' } },
    ],
  })],
  'Invoice',
);

// ── signatureFromTemplate ────────────────────────────────────────────────────
const sig = signatureFromTemplate(doc);
check(sig.name === 'Invoice', `template name in signature, got ${sig.name}`);
check(sig.labels.includes('invoice number'), `labels should include the text label, got ${JSON.stringify(sig.labels)}`);
check(sig.labels.includes('qty'), 'labels should include the column header');
check(sig.labels.includes('qty') && sig.labels.filter(l => l === 'qty').length === 1, 'token field-name deduped with header');

// ── signatureFromBlocks ──────────────────────────────────────────────────────
const nd: NormalizedDocument = {
  fileName: 'x.pdf',
  pages: [{ widthPx: 794, heightPx: 1123, blocks: [
    { id: 'b1', sourceIds: ['b1'], source: 'vector', confidence: 1, kind: 'text',
      rect: { x: 0, y: 0, width: 100, height: 12 }, text: 'Invoice Number', fontFamily: 'Arial', fontSizePx: 12, fontWeight: 'normal', color: '#000', rotation: 0 },
  ] }],
};
check(signatureFromBlocks(nd).labels.includes('invoice number'), 'block signature picks up text');

// ── buildCorpus over the real 26 built-ins ───────────────────────────────────
const corpus = buildCorpus(BUILTIN_TEMPLATES);
check(corpus.length === BUILTIN_TEMPLATES.length, `corpus size = builtins, got ${corpus.length}`);
check(corpus.every(c => c.key && c.name), 'every corpus entry has key+name');
check(corpus.filter(c => c.labels.length > 0).length >= corpus.length - 2, 'almost all builtins yield labels');

// ── extractSlots — the geometry-stripped alignment exemplar ──────────────────
const slots = extractSlots(doc);
check(slots.tables.length === 1 && slots.tables[0].columns.length === 1 && slots.tables[0].columns[0].token === 'qty',
  `exemplar table column token, got ${JSON.stringify(slots.tables)}`);
check(slots.tables[0].columns[0].header === 'Qty', 'exemplar keeps the column header label');

if (fails.length) {
  console.error('MATCHCHECK FAILED:');
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('MATCHCHECK PASSED');
console.log(`  signature: name="${sig.name}" labels=${JSON.stringify(sig.labels)}`);
console.log(`  corpus: ${corpus.length} built-ins, e.g. ${corpus[0].name} → ${corpus[0].labels.slice(0, 4).join(', ')}…`);
console.log(`  exemplar slots: cols=${slots.tables[0]?.columns.map(c => c.token).join(',')}`);
