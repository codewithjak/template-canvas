import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CanvasPage } from '../../types/canvas'
import { shouldShowStartLayer, isCanvasPristine } from './startLayer'

const emptyPage = (id = 'p1'): CanvasPage =>
  ({ pageId: id, label: 'P', repeatHeader: false, headerElementIds: [], elements: [], header: {}, footer: {} }) as unknown as CanvasPage

const pageWith = (n: number): CanvasPage => {
  const p = emptyPage()
  p.elements = Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) as unknown as CanvasPage['elements']
  return p
}

test('shows on a pristine single empty page, not dismissed', () => {
  assert.equal(shouldShowStartLayer([emptyPage()], false), true)
})

test('hidden once dismissed', () => {
  assert.equal(shouldShowStartLayer([emptyPage()], true), false)
})

test('hidden when the page has any element (insertion hides it)', () => {
  assert.equal(shouldShowStartLayer([pageWith(1)], false), false)
})

test('hidden with more than one page (a loaded/multi-page doc)', () => {
  assert.equal(shouldShowStartLayer([emptyPage('p1'), emptyPage('p2')], false), false)
})

test('isCanvasPristine ignores dismissal (seeding post-condition must survive "Start blank")', () => {
  // Dismissed but still one empty page → layer hidden, but pristine is TRUE,
  // so a data upload still seeds a layout.
  assert.equal(shouldShowStartLayer([emptyPage()], true), false)
  assert.equal(isCanvasPristine([emptyPage()]), true)
  assert.equal(isCanvasPristine([pageWith(1)]), false)
})
