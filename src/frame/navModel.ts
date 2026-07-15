/**
 * navModel.ts — the app frame's navigation, as data (app-frame doc T1.4).
 *
 * Pure and React-free so it is unit-testable: the Sidebar renders whatever this
 * returns and decides nothing itself.
 *
 * The list holds ONLY routes that exist today. Dashboard and Templates are not
 * here yet because their routes are not built (app-frame Phase 2 and
 * APP_SHELL_RELAYOUT Phase 3 respectively) — a nav item pointing at a 404 is
 * worse than no nav item. Adding one is a single entry in `NAV_ITEMS`.
 */

/** Sidebar grouping. 'workspace' items render under a "Workspace" heading. */
export type NavGroup = 'main' | 'workspace'

export interface NavItem {
  /** Stable key; also selects the icon in the Sidebar. */
  readonly id: string
  readonly label: string
  readonly to: string
  readonly group: NavGroup
}

/**
 * Integrations and Team are SECTIONS of the Settings page, not routes of their
 * own: `pages/Settings.tsx` already renders the Team card (members, invites,
 * seats) and the API access / Webhooks cards, and the canvas's old "Integrations"
 * button already pointed there. They are therefore anchors into `/settings`.
 *
 * That is why `to` may carry a hash. It also keeps the highlight honest: an item
 * is active only when the CURRENT hash matches, so landing on `/settings#team`
 * lights up Team alone, not Team *and* Settings.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', group: 'main' },
  { id: 'integrations', label: 'Integrations', to: '/settings#api', group: 'main' },
  { id: 'team', label: 'Team', to: '/settings#team', group: 'workspace' },
  { id: 'settings', label: 'Settings', to: '/settings', group: 'workspace' },
] as const

/** The route part of a nav target, without its `#section` anchor. */
export function routeOf(to: string): string {
  return to.split('#')[0]
}

export function navItems(): readonly NavItem[] {
  return NAV_ITEMS
}

export function navItemsInGroup(group: NavGroup): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.group === group)
}

/**
 * Is `item` the one the current location is on?
 *
 * `currentPath` is the pathname PLUS the hash (e.g. `/settings#team`), because
 * anchored items are distinguished only by their hash. Consequences, both wanted:
 *  - on `/settings#team`, Team is active and plain Settings is NOT (the hash makes
 *    the exact match fail, and `/settings#team` does not start with `/settings/`).
 *  - on `/settings`, Settings is active and the anchored items are not.
 *
 * Otherwise a prefix match, so a nested route like `/settings/billing` keeps its
 * parent highlighted. The prefix must end at a segment boundary, or `/team` would
 * light up for `/teams-archive`.
 */
export function isActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === currentPath) return true
  return currentPath.startsWith(itemPath.endsWith('/') ? itemPath : `${itemPath}/`)
}

/**
 * The title the frame's one header shows for a route. Kept as data next to the
 * nav so the two cannot drift; the TopBar renders it and decides nothing.
 */
export function pageTitle(currentPath: string): string {
  // Match on the ROUTE, not the anchor: /settings#team is still the Settings page,
  // and the header should say so rather than renaming the page per section.
  //
  // Only PAGE-level items (no anchor) may name a page. Without that filter,
  // /settings#team resolves to the first item whose route is /settings — which is
  // "Integrations" — and the header lies about which page you are on.
  const route = routeOf(currentPath)
  const match = NAV_ITEMS.filter((item) => !item.to.includes('#')).find((item) =>
    isActive(item.to, route),
  )
  return match?.label ?? ''
}
