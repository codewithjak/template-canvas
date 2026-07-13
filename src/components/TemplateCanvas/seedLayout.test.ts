import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CanonicalDocument } from '../../types/dataSource'
import { isLayoutTable } from '../../model/layoutTable'
import { seedStarterLayoutFromStructure } from './seedLayout'

const docWith = (columns: string[]): CanonicalDocument =>
  ({
    fields: {},
    collections: { orders: { columns, rows: [] } },
    source: { type: 'json', fileName: 'x', sheets: [], warnings: [] },
  }) as unknown as CanonicalDocument

test('returns a title text + a table bound to the first collection', () => {
  const els = seedStarterLayoutFromStructure(docWith(['id', 'customer', 'total']))
  assert.equal(els.length, 2)
  const [title, table] = els
  assert.equal(title.type, 'text')
  assert.ok(isLayoutTable(table))
  if (!isLayoutTable(table)) return
  assert.equal(table.binding?.enabled, true)
  assert.equal(table.binding?.collectionKey, 'orders')
})

test('columns match the detected fields; header is title-cased; cells are placeholders', () => {
  const [, table] = seedStarterLayoutFromStructure(docWith(['invoice_no', 'due.date']))
  if (!isLayoutTable(table)) throw new Error('expected a table')
  assert.equal(table.columns.length, 2)
  assert.deepEqual(table.headerRow?.cells.map((c) => c.content.value), ['Invoice No', 'Due Date'])
  assert.deepEqual(table.rows[0].cells.map((c) => c.content.value), ['{{invoice_no}}', '{{due.date}}'])
})

test('caps columns to what fits an A4 width (does not lay out an unreadable table)', () => {
  const many = Array.from({ length: 20 }, (_, i) => `c${i}`)
  const [, table] = seedStarterLayoutFromStructure(docWith(many))
  if (!isLayoutTable(table)) throw new Error('expected a table')
  assert.ok(table.columns.length >= 1 && table.columns.length <= 6, `capped, got ${table.columns.length}`)
})

test('empty structure seeds nothing (caller leaves the canvas as-is)', () => {
  assert.deepEqual(seedStarterLayoutFromStructure(docWith([])), [])
  const noColl = { fields: {}, collections: {}, source: {} } as unknown as CanonicalDocument
  assert.deepEqual(seedStarterLayoutFromStructure(noColl), [])
})
