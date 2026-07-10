'use strict';

/**
 * Shared fixtures for the multilingual-export golden tests
 * (MULTILINGUAL_EXPORT_ARCHITECTURE.md §7).
 *
 * Two Latin templates lock today's output (any diff = regression), and one
 * CJK/Arabic template exercises every failure mode from §1 of the doc:
 *   F2 silent blank (left-aligned non-Latin text)
 *   F3 hard 500     (center/right-aligned non-Latin text)
 *   F4 hard 500     (chart title/labels)
 *   F5 zero-width wrapping (non-Latin paragraph)
 *
 * Each fixture is a full generatePdfBuffer() parameter bag.
 */

const emptyIr = () => ({
  fields:      {},
  collections: {},
  source:      { type: 'json', fileName: 'fixture', sheets: [], warnings: [] },
});

const text = (id, content, x, y, style = {}) => ({
  id, type: 'text', content,
  position: { x, y },
  style: { fontSize: 14, fontWeight: 'normal', color: '#111111', fontFamily: 'Arial, sans-serif', width: 300, ...style },
});

const paragraph = (id, content, x, y, style = {}) => ({
  id, type: 'paragraph', content,
  position: { x, y },
  style: { fontSize: 12, fontWeight: 'normal', color: '#333333', fontFamily: 'Arial, sans-serif', width: 400, ...style },
});

const chart = (id, title, data, x, y) => ({
  id, type: 'chart',
  position: { x, y },
  style: { width: 320, height: 180 },
  chart: {
    kind: 'bar', title, data,
    palette: ['#4f46e5', '#06b6d4', '#22c55e'],
    showValues: true,
  },
});

const tableV2 = (id, headers, rows, x, y) => ({
  id, type: 'table', schemaVersion: 2,
  position: { x, y },
  style: { fontSize: 11, borderColor: '#214883', borderWidth: 1 },
  columns: headers.map((_, i) => ({ id: `${id}-col${i}`, width: 150, alignment: i === headers.length - 1 ? 'right' : 'left' })),
  headerRow: { id: `${id}-hdr`, cells: headers.map((h, i) => ({ id: `${id}-h${i}`, content: { type: 'text', value: h } })) },
  rows: rows.map((cells, ri) => ({
    id: `${id}-r${ri}`,
    cells: cells.map((v, ci) => ({ id: `${id}-r${ri}c${ci}`, content: { type: 'text', value: v } })),
  })),
});

/** Latin fixture 1 — plain text in every alignment, plus paragraph and box. */
function latinTextParams() {
  return {
    ir: emptyIr(),
    templateElements: [
      text('t-left',   'Invoice #10023 — Acme GmbH', 40, 60),
      text('t-center', 'Página centrada: ñ á é ü ¿?', 240, 120, { textAlign: 'center' }),
      text('t-right',  'Total: €1,234.56', 440, 180, { textAlign: 'right' }),
      paragraph('p-1', 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.', 40, 240),
      { id: 'b-1', type: 'box', position: { x: 40, y: 380 }, style: { width: 200, height: 80, borderWidth: 2, borderColor: '#214883', borderStyle: 'solid', backgroundColor: '#eef2ff' } },
    ],
  };
}

/** Latin fixture 2 — v2 table bound to a collection + bar chart. */
function latinTableChartParams() {
  return {
    ir: {
      ...emptyIr(),
      collections: {
        items: {
          columns: ['name', 'qty', 'price'],
          rows: [
            { name: 'Widget A', qty: '2', price: '10.00' },
            { name: 'Widget B', qty: '5', price: '4.50' },
            { name: 'Widget C', qty: '1', price: '99.99' },
          ],
        },
      },
    },
    templateElements: [
      tableV2('tbl', ['Item', 'Qty', 'Price'], [['Widget', '1', '10.00']], 40, 60),
      chart('ch', 'Quarterly Sales', [
        { label: 'Q1', value: 40 }, { label: 'Q2', value: 65 }, { label: 'Q3', value: 30 },
      ], 40, 320),
    ],
    tableCollectionBindings: { tbl: 'items' },
  };
}

/** Non-Latin fixture — one element per failure mode F2..F5. */
function cjkArabicParams() {
  return {
    ir: emptyIr(),
    templateElements: [
      text('cjk-left',    '你好世界 — 发票编号 10023', 40, 60),                              // F2
      text('cjk-center',  '居中文本测试', 240, 120, { textAlign: 'center' }),                 // F3
      text('ar-right',    'المجموع: ١٢٣٤', 440, 180, { textAlign: 'right' }),               // F3
      paragraph('ar-para', 'مرحبا بالعالم. هذا نص عربي طويل يجب أن يلتف عبر عدة أسطر عند التصدير إلى ملف PDF حتى نتحقق من حساب الارتفاع.', 40, 240),  // F5
      text('mixed',       'Order رقم 42 — Widget 零件', 40, 340),                            // mixed-script line
      chart('cjk-chart',  '季度销售', [
        { label: '一月', value: 40 }, { label: '二月', value: 65 }, { label: '三月', value: 30 },
      ], 40, 400),                                                                           // F4
    ],
  };
}

/**
 * Phase 3 fixture — direction intent.
 *  - one Arabic text element with NO explicit textAlign: 'auto' direction
 *    must right-align it by default.
 *  - one RTL table (style.direction: 'rtl') with Latin cell text so the
 *    mirrored draw order is assertable from the content stream.
 */
function rtlLayoutParams() {
  return {
    ir: emptyIr(),
    templateElements: [
      text('ar-auto', 'مرحبا', 40, 60),                       // auto → right-aligned
      { ...tableV2('rtltbl', ['Item', 'Qty', 'Total'], [['Widget', '1', '10.00']], 40, 160),
        style: { fontSize: 11, borderColor: '#214883', borderWidth: 1, direction: 'rtl' } },
    ],
  };
}

module.exports = { latinTextParams, latinTableChartParams, cjkArabicParams, rtlLayoutParams };
