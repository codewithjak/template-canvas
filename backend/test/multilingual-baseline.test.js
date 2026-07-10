'use strict';

/**
 * Golden baseline for the multilingual export work
 * (MULTILINGUAL_EXPORT_ARCHITECTURE.md, Phase 0 task 0.7).
 *
 * Locks two invariants:
 *
 *  1. LATIN OUTPUT IS FROZEN — the two Latin fixtures must render
 *     byte-identical to the committed sha256 golden hashes. The clock is
 *     frozen so pdf-lib's CreationDate/ModDate are constant and the PDF is
 *     fully deterministic. Any hash diff means a phase changed existing
 *     Latin exports, which §4 of the doc forbids. To intentionally accept a
 *     new baseline (reviewed!): UPDATE_GOLDEN=1 node --test test/
 *
 *  2. NON-LATIN NEVER CRASHES OR SILENTLY VANISHES — the CJK/Arabic fixture
 *     must export (charts used to hard-500), its unsupported characters must
 *     degrade to visible '?' (they used to be deleted), and the PNG image
 *     path must rasterize it.
 *
 * Run:  node --test test/
 */

// Freeze the clock BEFORE requiring the renderer so every pdf-lib date is
// constant. Scoped to this file: node --test runs each test file in its own
// process.
const FIXED_MS = new Date('2026-01-01T00:00:00Z').getTime();
const RealDate = global.Date;
class FrozenDate extends RealDate {
  constructor(...args) { args.length ? super(...args) : super(FIXED_MS); }
  static now() { return FIXED_MS; }
}
global.Date = FrozenDate;

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { generatePdfBuffer } = require('../renderer/pdfLibRenderer');
const { rasterizePdfBuffer } = require('../renderer/imageRenderer');
const { toWinAnsiSafe } = require('../utils/resolver');
const fixtures = require('./fixtures/multilingualFixtures');

const GOLDEN_PATH = path.join(__dirname, 'fixtures', 'multilingual-golden.json');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Inflate every content stream of a PDF buffer into one string. */
function inflatedStreams(buf) {
  const s = buf.toString('latin1');
  let out = '';
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m;
  while ((m = re.exec(s))) {
    try { out += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* non-flate stream */ }
  }
  return out;
}

// ── 1. Latin output is byte-frozen ───────────────────────────────────────────

test('Latin fixtures render byte-identical to the golden hashes', async () => {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));
  const actual = {
    'latin-text':        sha256(await generatePdfBuffer(fixtures.latinTextParams())),
    'latin-table-chart': sha256(await generatePdfBuffer(fixtures.latinTableChartParams())),
  };

  if (process.env.UPDATE_GOLDEN === '1') {
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify({ comment: golden.comment, ...actual }, null, 2) + '\n');
    return;
  }

  for (const name of Object.keys(actual)) {
    assert.strictEqual(
      actual[name], golden[name],
      `${name}.pdf changed byte-for-byte — Latin exports must stay identical ` +
      '(MULTILINGUAL_EXPORT_ARCHITECTURE.md §4). If this change is intentional ' +
      'and reviewed, refresh with UPDATE_GOLDEN=1.'
    );
  }
});

// ── 2. Non-Latin exports succeed, visibly degraded ───────────────────────────

test('CJK/Arabic fixture exports real glyphs on embedded subset fonts (Phase 1)', async () => {
  const buf = await generatePdfBuffer(fixtures.cjkArabicParams());
  assert.ok(buf.length > 500, 'produced a non-trivial PDF');

  const content = inflatedStreams(buf);
  // Phase 1: CJK and Arabic draw on subset-embedded Noto fonts instead of
  // degrading to '?'. The CJK-only center element used to appear as
  // '<3F3F3F3F3F3F>' (six '?'); it must not any more.
  assert.match(content, /\/BaseFont \/NotoSansCJKsc-Regular-/, 'CJK subset font embedded');
  assert.match(content, /\/BaseFont \/NotoNaskhArabic-Regular-/, 'Arabic subset font embedded');
  assert.ok(!content.includes('<3F3F3F3F3F3F>'), 'CJK text no longer degrades to "?" placeholders');
  // Latin digits inside mixed-script text still draw on Helvetica: '10023'.
  assert.ok(content.includes('3130303233'), 'Latin digits in mixed-script text are preserved');
});

test('a pure-Latin document embeds no Unicode fonts (lazy embedding)', async () => {
  const buf = await generatePdfBuffer(fixtures.latinTextParams());
  assert.ok(!inflatedStreams(buf).includes('Noto'), 'no Noto font embedded for WinAnsi-only content');
});

test('CJK/Arabic fixture rasterizes through the PNG image path', async () => {
  const buf = await generatePdfBuffer(fixtures.cjkArabicParams());
  const pages = await rasterizePdfBuffer(buf, { imageFormat: 'png', dpi: 96 });
  assert.ok(pages.length >= 1, 'at least one page rasterized');
  const png = pages[0].buffer;
  assert.deepStrictEqual([...png.subarray(1, 4)], [0x50, 0x4E, 0x47], 'PNG magic bytes');
});

// ── 3. The sanitizer degrades visibly and keeps its safe behaviors ───────────

test('toWinAnsiSafe substitutes "?" instead of deleting, and keeps WinAnsi/symbol behavior', () => {
  assert.strictEqual(toWinAnsiSafe('你好'), '??', 'CJK degrades to visible "?" per char');
  assert.strictEqual(toWinAnsiSafe('مرحبا'), '?????', 'Arabic degrades to visible "?" per char');
  assert.strictEqual(toWinAnsiSafe('Café €99 — ñ'), 'Café €99 — ñ', 'WinAnsi text passes through untouched');
  assert.strictEqual(toWinAnsiSafe('a ≤ b → c⁹'), 'a <= b -> c^9', 'symbol map still transliterates');
  assert.strictEqual(toWinAnsiSafe('Ω'), '?', 'decomposition that yields nothing degrades to "?", not ""');
  assert.strictEqual(toWinAnsiSafe('報告書', ''), '', 'explicit "" fallback drops unmappable chars');
});

// ── 4. Phase 1: resolution is raw; script segmentation routes fonts ─────────

test('replacePlaceholders returns original Unicode (sanitization is per-emitter now)', () => {
  const { replacePlaceholders } = require('../utils/resolver');
  assert.strictEqual(replacePlaceholders('你好 {{name}}', { name: 'مرحبا' }), '你好 مرحبا');
});

// ── 5. Phase 2: bidi — visual run order with fontkit-compensating hand-off ──

test('visualSegments orders RTL lines visually and keeps digit sequences readable', () => {
  const { visualSegments, hasRtl } = require('../renderer/textLayout');

  // RTL line with Arabic-Indic digits: visual (left→right) order is
  // [digits] [colon] [word], digits pre-flipped so fontkit's blind reversal
  // nets out to the correct ١٢٣٤.
  assert.deepStrictEqual(visualSegments('المجموع: ١٢٣٤'), [
    { text: '٤٣٢١', script: 'arabic' },   // pre-flipped; fontkit re-reverses
    { text: ': ',   script: 'winansi' },
    { text: 'المجموع', script: 'arabic' }, // logical order; fontkit shapes+reverses
  ]);

  // LTR base with an embedded Arabic phrase: matches UAX#9 (what the editor
  // DOM shows): the number attaches to the Arabic phrase RTL-style.
  assert.deepStrictEqual(
    visualSegments('Order رقم 42').map(s => s.text),
    ['Order 42', ' ', 'رقم']
  );

  // Pure LTR line: single winansi segment, untouched.
  assert.deepStrictEqual(visualSegments('Invoice #10023'), [
    { text: 'Invoice #10023', script: 'winansi' },
  ]);

  assert.strictEqual(hasRtl('Invoice €99'), false);
  assert.strictEqual(hasRtl('فاتورة'), true);

  // UAX#9 L4: brackets at an RTL embedding level use their mirrored form,
  // so the drawn (left-to-right) sequence opens with '(' and closes with ')'
  // around the Arabic — never the swapped ")شهري(".
  assert.deepStrictEqual(visualSegments('(شهري)'), [
    { text: '(',    script: 'winansi' },
    { text: 'شهري', script: 'arabic' },
    { text: ')',    script: 'winansi' },
  ]);
});

// ── 7. Phase 4: CSV encoding detection ───────────────────────────────────────

test('legacy-encoded CSVs are transcoded; UTF-8 CSVs are untouched', () => {
  const iconv = require('iconv-lite');
  const { parseSheet } = require('../parsers/sheetParser');
  const firstCollection = (ir) => ir.collections[Object.keys(ir.collections)[0]];

  // Realistic size: statistical detection needs more than a couple of lines
  // (a 3-line sample scores ~10 and correctly falls back to the old path).
  const arWords = ['مرحبا بالعالم', 'فاتورة ضريبية', 'شركة الاختبار للتجارة'];
  const arRows  = Array.from({ length: 40 }, (_, i) => `${arWords[i % 3]},${i},${arWords[(i + 1) % 3]}`);
  const arCsv   = `name,qty,desc\n${arRows.join('\n')}\n`;

  // Windows-1256 (Arabic ANSI) — the classic mojibake case.
  const ir1256 = parseSheet(iconv.encode(arCsv, 'windows-1256'), { fileName: 'orders.csv' });
  assert.strictEqual(firstCollection(ir1256).rows[0].name, 'مرحبا بالعالم', 'windows-1256 transcoded');
  assert.ok(ir1256.source.warnings.some((w) => w.includes('auto-detected')), 'transcode is surfaced as a warning');

  // GBK (Chinese ANSI).
  const gbCsv = `name,qty,desc\n${Array.from({ length: 30 }, () => '高质量测试零件,7,产品描述文字').join('\n')}\n`;
  const irGbk = parseSheet(iconv.encode(gbCsv, 'gbk'), { fileName: 'parts.csv' });
  assert.strictEqual(firstCollection(irGbk).rows[0].name, '高质量测试零件', 'GBK transcoded');

  // Valid UTF-8 stays on the pre-existing path — no warning, correct values.
  const irUtf8 = parseSheet(Buffer.from(arCsv, 'utf8'), { fileName: 'orders.csv' });
  assert.strictEqual(firstCollection(irUtf8).rows[0].name, 'مرحبا بالعالم', 'UTF-8 reads as before');
  assert.ok(!(irUtf8.source.warnings || []).some((w) => w.includes('auto-detected')), 'UTF-8 is never transcoded');

  // Tiny ambiguous non-UTF-8 CSVs fall back to the old path (low confidence).
  const irTiny = parseSheet(iconv.encode('name,qty,desc\nمرحبا,3,x\n', 'windows-1256'), { fileName: 't.csv' });
  assert.ok(irTiny, 'low-confidence sample still parses via the old path');
});

// ── 6. Phase 3: direction intent — RTL defaults and mirrored tables ─────────

test('baseDirection: first strong character decides; neutrals are skipped', () => {
  const { baseDirection } = require('../renderer/textLayout');
  assert.strictEqual(baseDirection('مرحبا'), 'rtl');
  assert.strictEqual(baseDirection('123 مرحبا'), 'rtl', 'leading digits are neutral');
  assert.strictEqual(baseDirection('Hello مرحبا'), 'ltr');
  assert.strictEqual(baseDirection('12345'), 'ltr', 'no strong char → ltr');
  assert.strictEqual(baseDirection(''), 'ltr');
});

test('auto direction right-aligns Arabic text; rtl table mirrors column order', async () => {
  const buf = await generatePdfBuffer(fixtures.rtlLayoutParams());
  const content = inflatedStreams(buf);

  // The Arabic element sits at x=40px (≈29.99pt) with width 300px (≈224.9pt)
  // and no explicit textAlign. Right-aligned means its text matrix x is well
  // to the right of the element's left edge.
  const tm = content.match(/\/NotoNaskhArabic[^\n]*Tf\n[^\n]*\n1 0 0 1 ([\d.]+) /);
  assert.ok(tm, 'Arabic run drawn with the Naskh font');
  assert.ok(Number(tm[1]) > 30 + 50, `auto-direction Arabic is right-aligned (Tm x = ${tm[1]})`);

  // RTL table: the LAST logical column ('Total') must be drawn before the
  // FIRST one ('Item') — hex-encoded Helvetica text in stream order.
  const hex = (t) => [...t].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
  const iTotal = content.indexOf(hex('Total'));
  const iItem  = content.indexOf(hex('Item'));
  assert.ok(iTotal !== -1 && iItem !== -1, 'both header cells drawn');
  assert.ok(iTotal < iItem, 'rtl table draws mirrored column order');
});

test('segmentRuns: pure-WinAnsi text is exactly one winansi run; mixed text splits per script', () => {
  const { segmentRuns, detectScript } = require('../renderer/textLayout');
  assert.deepStrictEqual(segmentRuns('Invoice #1 — €99'), [{ text: 'Invoice #1 — €99', script: 'winansi' }]);
  assert.deepStrictEqual(
    segmentRuns('Order رقم 42').map(r => r.script),
    ['winansi', 'arabic', 'winansi']
  );
  assert.strictEqual(detectScript('好'.codePointAt(0)), 'cjk');
  assert.strictEqual(detectScript('ג'.codePointAt(0)), 'hebrew');
  assert.strictEqual(detectScript('Д'.codePointAt(0)), 'cyrillic-greek');
  assert.strictEqual(detectScript('≋'.codePointAt(0)), 'other');
});
