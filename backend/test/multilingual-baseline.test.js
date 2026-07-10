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
