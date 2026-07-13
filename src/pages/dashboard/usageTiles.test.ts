import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { UsageSummary } from '../../services/apiIntegration'
import { usageTiles } from './usageTiles'

const usage = (over: Partial<UsageSummary> = {}): UsageSummary =>
  ({
    plan: 'pro',
    templates: { used: 2, limit: 8 },
    exportsThisMonth: { used: 412, limit: 2000 },
    ...over,
  }) as UsageSummary

test('no usage yet (loading, or the call failed) → no tiles, never zeros', () => {
  assert.deepEqual(usageTiles(null), [])
  assert.deepEqual(usageTiles(undefined), [])
})

test('omits the AI tile on servers that do not report aiBuildsThisMonth', () => {
  // The field is optional. Rendering it anyway is how "undefined / undefined"
  // reaches a user.
  const tiles = usageTiles(usage())
  assert.deepEqual(tiles.map((t) => t.id), ['templates', 'exports'])
})

test('includes the AI tile when the server does report it', () => {
  const tiles = usageTiles(usage({ aiBuildsThisMonth: { used: 7, limit: 100 } }))
  assert.deepEqual(tiles.map((t) => t.id), ['templates', 'exports', 'aiBuilds'])
  assert.equal(tiles[2].percent, 7)
})

test('limit: null means unlimited — a count, and no bar to fill', () => {
  const tiles = usageTiles(usage({ templates: { used: 120, limit: null } }))
  const templates = tiles[0]
  assert.equal(templates.limit, null)
  assert.equal(templates.percent, null, 'used / null would be Infinity in a bar')
})

test('percent is a rounded 0-100 and never overflows the bar', () => {
  assert.equal(usageTiles(usage({ templates: { used: 2, limit: 8 } }))[0].percent, 25)
  // Over quota (the server allows it, e.g. a plan downgrade) must clamp, not
  // render a bar wider than its track.
  assert.equal(usageTiles(usage({ templates: { used: 99, limit: 8 } }))[0].percent, 100)
})

test('a zero limit does not divide by zero', () => {
  assert.equal(usageTiles(usage({ templates: { used: 0, limit: 0 } }))[0].percent, null)
})
