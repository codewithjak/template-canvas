/**
 * backend/pdfImport/eval/materialize.ts  —  Phase 4 (deterministic half)
 *
 * Verifies the structure-plan materializer WITHOUT a live LLM, using a mock
 * plan: paragraph merge, role mapping, zone inference, geometry-from-blocks,
 * and the no-plan fallback. (The live Claude call in structurer.js is wired but
 * needs an API key to exercise — see the import flow.)
 * Run: npx tsx backend/pdfImport/eval/materialize.ts
 */

import { runImport } from '../../../src/services/pdfImport/index';
import type { NormalizedDocument, StructurePlan } from '../../../src/services/pdfImport/types';

const fails: string[] = [];
const check = (c: boolean, m: string) => { if (!c) fails.push(m); };
const approx = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

const text = (id: string, x: number, y: number, w: number, h: number, t: string) => ({
  id, sourceIds: [id], source: 'vector' as const, confidence: 1, kind: 'text' as const,
  rect: { x, y, width: w, height: h }, text: t,
  fontFamily: 'Arial', fontSizePx: h, fontWeight: 'normal', color: '#000000', rotation: 0,
});

const normalized: NormalizedDocument = {
  fileName: 'doc.pdf',
  pages: [{
    widthPx: 794, heightPx: 1123, // A4
    blocks: [
      text('b-title', 96, 40, 120, 24, 'Invoice'),
      text('b-l1', 96, 100, 400, 14, 'Line one'),
      text('b-l2', 96, 120, 400, 14, 'Line two'),
      text('b-foot', 96, 1080, 120, 12, 'Page 1'),
      { id: 'b-line', sourceIds: ['b-line'], source: 'vector', confidence: 1, kind: 'line',
        rect: { x: 96, y: 80, width: 600, height: 1 }, direction: 'horizontal', thicknessPx: 1, color: '#ccc' },
    ],
  }],
};

const plan: StructurePlan = {
  pages: [{
    groups: [
      { blockIds: ['b-title'], type: 'text', role: 'title', content: 'Invoice' },
      { blockIds: ['b-l1', 'b-l2'], type: 'paragraph', role: 'none', content: 'Line one\nLine two' },
      { blockIds: ['b-foot'], type: 'text', role: 'none', content: 'Page {{page}} of {{pages}}' },
    ],
    tables: [],
    headerBlockIds: [],
    footerBlockIds: ['b-foot'],
  }],
};

// ── Template mode: tokenized content from the plan ───────────────────────────
{
  const { document, report } = runImport(normalized, plan); // default mode = 'template'
  const els = document.pages[0].elements;
  const byType = (t: string) => els.filter(e => e.type === t);

  const para = byType('paragraph')[0] as { content: string; position: { x: number; y: number } } | undefined;
  check(!!para && para.content === 'Line one\nLine two', `paragraph uses plan content, got "${para?.content}"`);
  check(!!para && para.position.x === 96 && para.position.y === 100, `paragraph geometry from blocks, got ${JSON.stringify(para?.position)}`);

  const title = byType('text').find(e => (e as { content: string }).content === 'Invoice');
  check(!!title, 'title text element should exist');

  const foot = byType('text').find(e => (e as { content: string }).content.includes('{{page}}'));
  check(!!foot, 'footer text element should exist with tokenized content');

  check(byType('line').length === 1, `line should pass through, got ${byType('line').length}`);
  check(els.length === 4, `expected 4 elements (title, paragraph, footer-text, line), got ${els.length}`);

  const footerCfg = document.pages[0].footer;
  check(footerCfg.enabled === true, 'footer zone should be enabled');
  check(approx(footerCfg.boundaryY, 1080 - 8), `footer boundaryY ~= block top - 8, got ${footerCfg.boundaryY}`);

  check(report.coverage.mapped === 4 && report.coverage.dropped === 0, `coverage mapped 4/dropped 0, got ${JSON.stringify(report.coverage)}`);
}

// ── Without a plan (fallback floor) ──────────────────────────────────────────
{
  const { document } = runImport(normalized);
  const els = document.pages[0].elements;
  check(els.length === 5, `fallback pass-through should keep all 5 blocks, got ${els.length}`);
  check(document.pages[0].footer.enabled === false, 'fallback should not enable zones');
  check(els.filter(e => e.type === 'paragraph').length === 0, 'fallback should not merge paragraphs');
}

// ── Table detection (4b) ─────────────────────────────────────────────────────
{
  const tdoc: NormalizedDocument = {
    fileName: 'invoice.pdf',
    pages: [{
      widthPx: 794, heightPx: 1123,
      blocks: [
        text('h0', 96, 200, 40, 14, 'Qty'),
        text('h1', 200, 200, 200, 14, 'Item'),
        text('c00', 96, 220, 20, 14, '2'),
        text('c01', 200, 220, 120, 14, 'Widget'),
        text('c10', 96, 240, 20, 14, '5'),
        text('c11', 200, 240, 120, 14, 'Gadget'),
      ],
    }],
  };
  const tplan: StructurePlan = {
    pages: [{
      groups: [],
      tables: [{ headerBlockIds: ['h0', 'h1'], rows: [['c00', 'c01'], ['c10', 'c11']],
        columnTokens: ['qty', 'item'], collectionKey: 'line_items' }],
      headerBlockIds: [],
      footerBlockIds: [],
    }],
  };

  type Tbl = {
    type: 'table'; position: { x: number; y: number }; columns: { width: number }[];
    headerRow?: { cells: { content: { value: string } }[] };
    rows: { cells: { content: { value: string } }[] }[];
    binding?: { enabled?: boolean; collectionKey?: string; itemAlias?: string };
  };

  // Template mode (default): header labels static, ONE token row, bound.
  {
    const { document } = runImport(tdoc, tplan);
    const tbl = document.pages[0].elements[0] as Tbl;
    check(tbl.type === 'table', 'template: produces a table');
    check(tbl.columns.length === 2, `template: 2 columns, got ${tbl.columns.length}`);
    check(tbl.position.x === 96 && tbl.columns[0].width === 104, 'template: geometry from blocks (x=96, col0=104)');
    check(tbl.headerRow?.cells.map(c => c.content.value).join('|') === 'Qty|Item', 'template: header labels kept');
    check(tbl.rows.length === 1, `template: ONE token row, got ${tbl.rows.length}`);
    check(tbl.rows[0].cells.map(c => c.content.value).join('|') === '{{qty}}|{{item}}', `template: tokenized cells, got ${tbl.rows[0].cells.map(c => c.content.value).join('|')}`);
    check(tbl.binding?.enabled === true && tbl.binding?.collectionKey === 'line_items', 'template: bound to line_items');
  }

  // Document mode: the PDF's literal rows, no binding.
  {
    const { document } = runImport(tdoc, tplan, 'document');
    const tbl = document.pages[0].elements[0] as Tbl;
    check(tbl.rows.length === 2, `document: 2 literal rows, got ${tbl.rows.length}`);
    check(tbl.rows[0].cells.map(c => c.content.value).join('|') === '2|Widget', `document: literal values, got ${tbl.rows[0].cells.map(c => c.content.value).join('|')}`);
    check(!tbl.binding || tbl.binding.enabled !== true, 'document: not bound');
  }
}

if (fails.length) {
  console.error('MATERIALIZE FAILED:');
  fails.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log('MATERIALIZE PASSED');
console.log('  template mode: tokenized content + footer zone; table → header labels + {{qty}}|{{item}} + bound to line_items');
console.log('  document mode: table → literal rows 2|Widget / 5|Gadget, not bound');
console.log('  no plan:       5 pass-through elements, no zones, no merge');
