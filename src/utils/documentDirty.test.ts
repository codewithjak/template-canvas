import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { PageSizeConfig } from '../types/canvas'
import { samePageSize, sameStringMap } from './documentDirty'

const A4 = (): PageSizeConfig => ({ preset: 'a4', canvasWidth: 794, canvasHeight: 1123, pdfWidth: 595.28, pdfHeight: 841.89 })
const LETTER = (): PageSizeConfig => ({ preset: 'letter', canvasWidth: 816, canvasHeight: 1056, pdfWidth: 612, pdfHeight: 792 })

test('samePageSize: re-picking the same preset (fresh object) is NOT a change', () => {
  const a = A4()
  const b = A4() // distinct reference, identical values
  assert.notEqual(a, b) // the bug premise: different references
  assert.equal(samePageSize(a, b), true)
})

test('samePageSize: a real size change is detected', () => {
  assert.equal(samePageSize(A4(), LETTER()), false)
})

test('samePageSize: custom-inch fields participate', () => {
  const a: PageSizeConfig = { ...A4(), preset: 'custom', widthInches: 5, heightInches: 7 }
  const b: PageSizeConfig = { ...A4(), preset: 'custom', widthInches: 5, heightInches: 8 }
  assert.equal(samePageSize(a, b), false)
})

test('sameStringMap: identical fields (fresh object) equal; changes detected', () => {
  assert.equal(sameStringMap({ company: 'Acme', vat: '1' }, { company: 'Acme', vat: '1' }), true)
  assert.equal(sameStringMap({ company: 'Acme', vat: '1' }, { company: 'Acme', vat: '2' }), false)
  assert.equal(sameStringMap({ company: 'Acme', vat: '1' }, { company: 'Acme' }), false)
  assert.equal(sameStringMap({}, {}), true)
})

test('sameStringMap: a renamed key with the same COUNT is a change (not just length)', () => {
  // The non-obvious branch: equal key counts but different keys. A length-only
  // check would wrongly report these equal.
  assert.equal(sameStringMap({ a: '1' }, { b: '1' }), false)
  assert.equal(sameStringMap({ a: '1', b: '2' }, { a: '1', c: '2' }), false)
})
