import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navItems, navItemsInGroup, isActive, routeOf, pageTitle } from './navModel'

test('every nav item points at a route that exists today', () => {
  // The guard against a nav item that 404s: add the route here and to NAV_ITEMS in
  // the same commit. Anchors are stripped: Integrations and Team are sections of
  // /settings, not routes of their own.
  const builtRoutes = ['/dashboard', '/templates', '/settings']
  for (const item of navItems()) {
    assert.ok(
      builtRoutes.includes(routeOf(item.to)),
      `${item.label} → ${item.to} is not a built route`,
    )
  }
})

test('an anchored item lights up alone — not alongside its parent page', () => {
  // The bug this prevents: Integrations, Team and Settings all live at /settings,
  // so a naive path match would highlight all three at once.
  assert.equal(isActive('/settings#team', '/settings#team'), true, 'Team on #team')
  assert.equal(isActive('/settings', '/settings#team'), false, 'Settings NOT on #team')
  assert.equal(isActive('/settings#api', '/settings#team'), false, 'Integrations NOT on #team')
})

test('plain /settings lights up Settings alone', () => {
  assert.equal(isActive('/settings', '/settings'), true)
  assert.equal(isActive('/settings#team', '/settings'), false)
  assert.equal(isActive('/settings#api', '/settings'), false)
})

test('the header says which PAGE you are on, not which section', () => {
  assert.equal(pageTitle('/settings#team'), 'Settings')
  assert.equal(pageTitle('/settings'), 'Settings')
  assert.equal(pageTitle('/dashboard'), 'Dashboard')
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
