import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  navItems,
  navItemsInGroup,
  isActive,
  routeOf,
  pageTitle,
  defaultSidebarCollapsed,
} from './navModel'

test('every nav item points at a route that exists today', () => {
  // The guard against a nav item that 404s: add the route here and to NAV_ITEMS in
  // the same commit. Integrations, Team and Settings are now three real routes.
  const builtRoutes = ['/dashboard', '/templates', '/integrations', '/team', '/settings']
  for (const item of navItems()) {
    assert.ok(
      builtRoutes.includes(routeOf(item.to)),
      `${item.label} → ${item.to} is not a built route`,
    )
  }
})

test('each account route lights up its own nav item alone', () => {
  // Integrations, Team and Settings are distinct routes now, so each highlights
  // exactly one item and none of the others.
  assert.equal(isActive('/integrations', '/integrations'), true, 'Integrations on /integrations')
  assert.equal(isActive('/team', '/integrations'), false, 'Team NOT on /integrations')
  assert.equal(isActive('/settings', '/integrations'), false, 'Settings NOT on /integrations')

  assert.equal(isActive('/team', '/team'), true, 'Team on /team')
  assert.equal(isActive('/settings', '/team'), false, 'Settings NOT on /team')

  assert.equal(isActive('/settings', '/settings'), true, 'Settings on /settings')
  assert.equal(isActive('/team', '/settings'), false, 'Team NOT on /settings')
  assert.equal(isActive('/integrations', '/settings'), false, 'Integrations NOT on /settings')
})

test('the sidebar starts collapsed in the editor, and only there', () => {
  // The canvas is starved for width: an A4 page is 794px and the chrome leaves
  // ~689px at 1440px. Collapsing the sidebar there is what makes a page fit.
  assert.equal(defaultSidebarCollapsed('/canvas'), true)

  // ...but the Dashboard and Templates ARE navigation. Hiding the nav on the pages
  // built for navigating would be perverse.
  assert.equal(defaultSidebarCollapsed('/dashboard'), false)
  assert.equal(defaultSidebarCollapsed('/templates'), false)
  assert.equal(defaultSidebarCollapsed('/settings'), false)
  assert.equal(defaultSidebarCollapsed('/integrations'), false)
  assert.equal(defaultSidebarCollapsed('/team'), false)
})

test('the editor is named in the header even though it has no nav item', () => {
  // /canvas is reached by action (New template / opening a template), so it is
  // deliberately not a nav destination — but the frame's one header must still
  // name it, or the editor renders under a blank title.
  assert.equal(pageTitle('/canvas'), 'Editor')
})

test('the header names each account route on its own', () => {
  assert.equal(pageTitle('/integrations'), 'Integrations')
  assert.equal(pageTitle('/team'), 'Team')
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
