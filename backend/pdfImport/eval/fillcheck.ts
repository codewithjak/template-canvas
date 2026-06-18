/**
 * backend/pdfImport/eval/fillcheck.ts  —  match-and-diff v2 (deterministic half)
 *
 * Verifies slot extraction + value application WITHOUT a live LLM, using a mock
 * fill: scalar token substitution, table expansion to concrete rows, binding
 * disabled, and partial-fill safety. Run: npx tsx backend/pdfImport/eval/fillcheck.ts
 */

import { extractSlots, applyFill, toFillValues, type RawFill } from '../../../src/services/pdfImport/index';
import { createPage, createTemplateDocument, type TemplateDocument } from '../../../src/types/canvas';

const fails: string[] = [];
const check = (c: boolean, m: string) => { if (!c) fails.push(m); };

const doc: TemplateDocument = createTemplateDocument(
  [createPage({
    pageId: 'p1',
    elements: [
      { id: 'no', type: 'text', content: 'Invoice No: {{invoiceNo}}', position: { x: 0, y: 0 },
        style: { fontSize: 12, fontWeight: 'normal', color: '#000', fontFamily: 'Arial' } },
      { id: 'tbl1', type: 'table', schemaVersion: 2, position: { x: 0, y: 0 },
        columns: [{ id: 'c1', width: 40 }, { id: 'c2', width: 120 }],
        headerRow: { id: 'h', cells: [
          { id: 'h1', content: { type: 'text', value: 'Qty' } },
          { id: 'h2', content: { type: 'text', value: 'Item' } } ] },
        rows: [{ id: 'tr', cells: [
          { id: 'rc1', content: { type: 'text', value: '{{qty}}' } },
          { id: 'rc2', content: { type: 'text', value: '{{item}}' } } ] }],
        binding: { enabled: true, collectionKey: 'items', itemAlias: 'item' },
        style: { fontSize: 10, fontWeight: 'normal', color: '#000', fontFamily: 'Arial' } },
    ],
  })],
  'Invoice',
);

// ── extractSlots ─────────────────────────────────────────────────────────────
const slots = extractSlots(doc);
check(slots.fields.some(f => f.token === 'invoiceNo' && f.label === 'Invoice No:'), `field slot with label, got ${JSON.stringify(slots.fields)}`);
check(slots.tables.length === 1 && slots.tables[0].elementId === 'tbl1', 'table slot with elementId');
check(slots.tables[0].columns.map(c => `${c.token}:${c.header}`).join('|') === 'qty:Qty|item:Item', `columns, got ${JSON.stringify(slots.tables[0].columns)}`);

// ── applyFill (mock LLM output → pairs → records) ────────────────────────────
const raw: RawFill = {
  fields: [{ token: 'invoiceNo', value: 'INV-9' }],
  tables: [{ elementId: 'tbl1', rows: [
    [{ token: 'qty', value: '2' }, { token: 'item', value: 'Widget' }],
    [{ token: 'qty', value: '5' }, { token: 'item', value: 'Gadget' }],
  ] }],
};
applyFill(doc, toFillValues(raw));

const textEl = doc.pages[0].elements.find(e => e.id === 'no') as { content: string };
check(textEl.content === 'Invoice No: INV-9', `scalar substituted, got "${textEl.content}"`);

const tbl = doc.pages[0].elements.find(e => e.id === 'tbl1') as {
  rows: { cells: { content: { value: string } }[] }[]; binding?: { enabled?: boolean };
};
check(tbl.rows.length === 2, `table expanded to 2 rows, got ${tbl.rows.length}`);
check(tbl.rows[0].cells.map(c => c.content.value).join('|') === '2|Widget', `row0 values, got ${tbl.rows[0].cells.map(c => c.content.value).join('|')}`);
check(tbl.rows[1].cells.map(c => c.content.value).join('|') === '5|Gadget', 'row1 values');
check(tbl.binding?.enabled === false, 'binding disabled on filled instance');

// ── partial-fill safety: unknown token keeps its placeholder ──────────────────
const doc2 = createTemplateDocument([createPage({ pageId: 'p1', elements: [
  { id: 't', type: 'text', content: 'Hi {{missing}}', position: { x: 0, y: 0 },
    style: { fontSize: 12, fontWeight: 'normal', color: '#000', fontFamily: 'Arial' } },
] })], 'X');
applyFill(doc2, { fields: {}, tables: [] });
check((doc2.pages[0].elements[0] as { content: string }).content === 'Hi {{missing}}', 'unfilled token preserved');

if (fails.length) {
  console.error('FILLCHECK FAILED:');
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('FILLCHECK PASSED');
console.log('  slots: invoiceNo (label) + table[qty,item]');
console.log('  applied: "Invoice No: INV-9" · table → 2|Widget / 5|Gadget · binding off · unknown token kept');
