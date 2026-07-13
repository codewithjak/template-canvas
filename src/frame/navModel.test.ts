import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navItems, navItemsInGroup, isActive } from './navModel'

test('every nav item points at a route that exists today', () => {
  // The guard against a nav item that 404s. When Dashboard/Templates ship,
  // add them here and to NAV_ITEMS in the same commit.
  const builtRoutes = ['/settings']
  for (const item of navItems()) {
    assert.ok(builtRoutes.includes(item.to), `${item.label} → ${item.to} is not a built route`)
  }
})

test('groups partition the items (nothing is dropped or duplicated)', () => {
  const grouped = [...navItemsInGroup('main'), ...navItemsInGroup('workspace')]
  assert.equal(grouped.length, navItems().length)
})

test('isActive: exact match', () => {
  assert.equal(isActive('/settings', '/settings'), true)
  assert.equal(isActive('/settings', '/canvas'), false)
})

test('isActive: nested route keeps the parent highlighted', () => {
  assert.equal(isActive('/settings', '/settings/billing'), true)
})

test('isActive: matches only on a segment boundary', () => {
  // '/team' must not light up for '/teams-archive' — the bug a bare
  // startsWith() would ship.
  assert.equal(isActive('/team', '/teams-archive'), false)
  assert.equal(isActive('/team', '/team/members'), true)
})
