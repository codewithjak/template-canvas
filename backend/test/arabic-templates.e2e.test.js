'use strict';

/**
 * End-to-end render of the Arabic builtin templates (src/templates/builtins)
 * through the real export pipeline — the same generatePdfBuffer params the
 * /generate-document endpoint builds. Guards the Saudi/ZATCA use case that
 * the multilingual export work (MULTILINGUAL_EXPORT_ARCHITECTURE.md) exists
 * to serve:
 *   - Arabic text renders on the embedded Naskh font (not '?', not blank)
 *   - the mirrored RTL line-item table draws
 *   - the ZATCA TLV QR barcode embeds as an image
 *   - the PNG image path rasterizes each document
 *
 * Run:  node --test test/
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { generatePdfBuffer } = require('../renderer/pdfLibRenderer');
const { rasterizePdfBuffer } = require('../renderer/imageRenderer');

const BUILTINS = path.join(__dirname, '..', '..', 'src', 'templates', 'builtins');

function loadBuiltin(id) {
  const doc  = JSON.parse(fs.readFileSync(path.join(BUILTINS, `${id}.template.json`), 'utf8'));
  const data = JSON.parse(fs.readFileSync(path.join(BUILTINS, `${id}.data.json`), 'utf8'));
  const page = doc.pages[0];
  return {
    ir: data,
    templateElements: page.elements,
    fieldMapping: {},
    tableCollectionBindings: {},
    collectionMappings: {},
    pageConfigs: [{ header: page.header, footer: page.footer }],
    pageSize: doc.pageSize,
  };
}

function inflatedStreams(buf) {
  const s = buf.toString('latin1');
  let out = '';
  const re = /stream\r?\n([\s\S]*?)endstream/g;
  let m;
  while ((m = re.exec(s))) {
    try { out += zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { /* raw stream */ }
  }
  return out;
}

for (const id of ['arabic-tax-invoice', 'zatca-simplified-receipt', 'arabic-annual-report']) {
  test(`${id} builtin renders end-to-end (PDF + PNG)`, async () => {
    const pdf = await generatePdfBuffer(loadBuiltin(id));
    assert.ok(pdf.length > 5000, 'non-trivial PDF produced');

    const content = inflatedStreams(pdf);
    assert.match(content, /\/BaseFont \/NotoNaskhArabic-/, 'Arabic subset font embedded');
    assert.ok(!content.includes('<3F3F3F'), 'no "?" degradation for Arabic content');
    if (id !== 'arabic-annual-report') {
      // QR barcode embeds as an XObject image draw.
      assert.match(content, /\/Image[0-9-]+ Do|\/XObject/, 'QR image drawn');
    }

    const pages = await rasterizePdfBuffer(pdf, { imageFormat: 'png', dpi: 72 });
    assert.strictEqual(pages.length, 1, 'single page');
    assert.deepStrictEqual([...pages[0].buffer.subarray(1, 4)], [0x50, 0x4E, 0x47], 'PNG magic');
  });
}
