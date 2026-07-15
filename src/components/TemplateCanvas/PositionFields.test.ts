import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergePosition } from './positionPatch'

test('setting X keeps Y', () => {
  assert.deepEqual(mergePosition({ x: 10, y: 20 }, { x: 55 }), { x: 55, y: 20 })
})

test('setting Y keeps X', () => {
  assert.deepEqual(mergePosition({ x: 10, y: 20 }, { y: 88 }), { x: 10, y: 88 })
})

test('sibling fields (radio/checkbox relativeOffset) survive an axis edit', () => {
  // The bug this prevents: patching position must not drop relativeOffset, which
  // is edited by a separate control on the element bar.
  assert.deepEqual(
    mergePosition({ x: 10, y: 20, relativeOffset: 8 }, { x: 0 }),
    { x: 0, y: 20, relativeOffset: 8 },
  )
})
