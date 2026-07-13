import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BuiltinTemplate } from './registry'
import { BUILTIN_TEMPLATES } from './registry'
import { categoriesOf, filterByCategory, ALL_CATEGORIES } from './filterByCategory'

const tpl = (id: string, category: string): BuiltinTemplate =>
  ({ id, name: id, description: '', category, sizeLabel: 'A4' }) as unknown as BuiltinTemplate

test('All returns everything, untouched', () => {
  const list = [tpl('a', 'Healthcare'), tpl('b', 'Insurance')]
  assert.equal(filterByCategory(list, ALL_CATEGORIES), list)
})

test('a category returns only its templates', () => {
  const list = [tpl('a', 'Healthcare'), tpl('b', 'Insurance'), tpl('c', 'Healthcare')]
  assert.deepEqual(
    filterByCategory(list, 'Healthcare' as BuiltinTemplate['category']).map((t) => t.id),
    ['a', 'c'],
  )
})

test('categories are derived from the templates, All first, no duplicates', () => {
  const list = [tpl('a', 'Healthcare'), tpl('b', 'Insurance'), tpl('c', 'Healthcare')]
  assert.deepEqual(categoriesOf(list), ['All', 'Healthcare', 'Insurance'])
})

test('every chip on the real registry filters to at least one template', () => {
  // The bug this prevents: a chip that leads to an empty page. Categories are
  // derived from the templates, so this holds by construction — pinned here so a
  // future hard-coded chip list cannot quietly break it.
  for (const category of categoriesOf(BUILTIN_TEMPLATES)) {
    const hits = filterByCategory(BUILTIN_TEMPLATES, category)
    assert.ok(hits.length > 0, `chip "${category}" filters to nothing`)
  }
})

test('All is the only chip that shows every template', () => {
  const all = filterByCategory(BUILTIN_TEMPLATES, ALL_CATEGORIES)
  assert.equal(all.length, BUILTIN_TEMPLATES.length)
  assert.ok(BUILTIN_TEMPLATES.length > 0, 'the registry is not empty')
})
