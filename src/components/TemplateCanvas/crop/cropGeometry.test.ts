import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampNormRect, toPixelRect, aspectHeight, shapePolygon } from './cropGeometry'

test('clampNormRect keeps a normal rect unchanged', () => {
  assert.deepEqual(clampNormRect({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.4 })
})

test('clampNormRect slides a rect back inside the unit square', () => {
  // Dragged past the right/bottom edge: origin pulls in so w/h are preserved.
  assert.deepEqual(clampNormRect({ x: 0.8, y: 0.9, w: 0.5, h: 0.4 }), { x: 0.5, y: 0.6, w: 0.5, h: 0.4 })
})

test('clampNormRect enforces a minimum size instead of collapsing', () => {
  const r = clampNormRect({ x: 0.5, y: 0.5, w: 0, h: -1 })
  assert.ok(r.w >= 0.02 && r.h >= 0.02, 'width and height clamped to the floor')
})

test('toPixelRect projects onto natural pixels and rounds', () => {
  assert.deepEqual(toPixelRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 400, 200), { x: 100, y: 100, w: 200, h: 50 })
})

test('toPixelRect never returns a zero-area region', () => {
  const p = toPixelRect({ x: 0, y: 0, w: 0.0001, h: 0.0001 }, 10, 10)
  assert.ok(p.w >= 1 && p.h >= 1)
})

test('aspectHeight matches the box width to the crop aspect', () => {
  // A 200x50 crop at box width 400 → height 100 (same 4:1 aspect).
  assert.equal(aspectHeight(400, { x: 0, y: 0, w: 200, h: 50 }), 100)
})

test('shapePolygon: triangle is apex-top, base-bottom', () => {
  assert.deepEqual(shapePolygon('triangle', 100, 60), [[50, 0], [100, 60], [0, 60]])
})

test('shapePolygon: rect is the four corners', () => {
  assert.deepEqual(shapePolygon('rect', 100, 60), [[0, 0], [100, 0], [100, 60], [0, 60]])
})

test('shapePolygon: ellipse has no polygon (drawn via canvas ellipse)', () => {
  assert.equal(shapePolygon('ellipse', 100, 60), null)
})
