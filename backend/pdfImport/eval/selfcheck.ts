/**
 * backend/pdfImport/eval/selfcheck.ts
 *
 * Framework-free smoke test for the deterministic pipeline using synthetic
 * primitives (no PDF needed). Complements roundtrip.ts (which uses real PDF
 * bytes). Run: npx tsx backend/pdfImport/eval/selfcheck.ts
 *
 * Lives under backend/ (not src/) because it uses Node `process` and is dev
 * tooling, not app code — keeps it out of the frontend build.
 */

import { runDeterministicImport } from '../../../src/services/pdfImport/index';
import { diffTemplates } from '../../../src/services/pdfImport/eval/diff';
import type { ExtractedDocument } from '../../../src/services/pdfImport/types';

const A4 = { widthPt: 595.28, heightPt: 841.89 };
const PX = 96 / 72;

const fails: string[] = [];
function check(cond: boolean, msg: string) { if (!cond) fails.push(msg); }
const approx = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= tol;

const extracted: ExtractedDocument = {
  fileName: 'synthetic.pdf',
  pages: [{
    ...A4,
    primitives: [
      { id: 'p1', source: 'vector', confidence: 1, kind: 'text',
        text: 'Invoice', fontName: 'Helvetica-Bold', fontSizePt: 18, rotation: 0, color: '#111111',
        rect: { x: 72, y: 800, width: 120, height: 18 } },
      { id: 'p2', source: 'vector', confidence: 1, kind: 'text',
        text: 'Total:', fontName: 'Helvetica', fontSizePt: 12, rotation: 0, color: '#000000',
        rect: { x: 72, y: 700, width: 40, height: 12 } },
      { id: 'p3', source: 'vector', confidence: 1, kind: 'text',
        text: '$250', fontName: 'Helvetica', fontSizePt: 12, rotation: 0, color: '#000000',
        rect: { x: 130, y: 700, width: 40, height: 12 } },
      { id: 'p4', source: 'vector', confidence: 1, kind: 'line',
        thicknessPt: 1, color: '#cccccc', rect: { x: 72, y: 690, width: 451, height: 1 } },
      { id: 'p5', source: 'vector', confidence: 1, kind: 'rect',
        strokeWidthPt: 1, strokeColor: '#000000', fillColor: '#f0f0f0',
        rect: { x: 72, y: 100, width: 200, height: 80 } },
    ],
  }],
};

const { document, report } = runDeterministicImport(extracted);

check(document.version === '2.0', 'document version should be 2.0');
check(document.pages.length === 1, 'should produce 1 page');
check(document.pageSize?.preset === 'a4', `page size should match A4 preset, got ${document.pageSize?.preset}`);

const els = document.pages[0].elements;
const byType = (t: string) => els.filter(e => e.type === t);

check(byType('text').length === 2, `expected 2 text elements (one merged), got ${byType('text').length}`);
check(byType('line').length === 1, `expected 1 line, got ${byType('line').length}`);
check(byType('box').length === 1, `expected 1 box, got ${byType('box').length}`);

const merged = byType('text').find(e => (e as { content: string }).content.includes('Total'));
check(!!merged && (merged as { content: string }).content === 'Total: $250',
  `runs should merge to "Total: $250", got "${(merged as { content?: string })?.content}"`);

const title = byType('text').find(e => (e as { content: string }).content === 'Invoice')!;
check(approx(title.position.y, (A4.heightPt - 818) * PX), `title Y transform wrong: ${title.position.y}`);
check(approx(title.position.x, 72 * PX), `title X transform wrong: ${title.position.x}`);

const box = byType('box')[0];
check(approx(box.position.y, (A4.heightPt - 180) * PX), `box Y transform wrong: ${box.position.y}`);

check(report.coverage.mapped === els.length, 'all surviving elements should be reported mapped');
check(report.coverage.dropped === 0, 'nothing should be dropped in this clean input');

const score = diffTemplates(document, document);
check(score.f1 === 1, `self-diff F1 should be 1, got ${score.f1}`);
check(score.meanIoU > 0.99, `self-diff IoU should be ~1, got ${score.meanIoU}`);
check(score.textMatchRate === 1, `self-diff text match should be 1, got ${score.textMatchRate}`);

if (fails.length) {
  console.error('SELFCHECK FAILED:');
  for (const f of fails) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('SELFCHECK PASSED');
console.log(`  elements: ${els.length} (${byType('text').length} text, ${byType('line').length} line, ${byType('box').length} box)`);
console.log(`  pageSize: ${document.pageSize?.preset}  coverage:`, report.coverage);
console.log(`  self-diff: f1=${score.f1} iou=${score.meanIoU.toFixed(3)} text=${score.textMatchRate}`);
