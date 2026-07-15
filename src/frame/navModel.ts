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
 * Integrations, Team and Settings are three sibling routes, each owning one
 * concern (see docs/ACCOUNT_ROUTES_ARCHITECTURE.md):
 *   - /integrations — API key, webhooks, quickstart
 *   - /team         — members, invites, seats, team switcher
 *   - /settings     — plan, usage, future account config
 *
 * They were once hash anchors into a single `/settings` page; splitting them into
 * real routes removed the hash-matching machinery this model used to carry.
 */
const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', group: 'main' },
  { id: 'templates', label: 'Templates', to: '/templates', group: 'main' },
  { id: 'integrations', label: 'Integrations', to: '/integrations', group: 'main' },
  { id: 'team', label: 'Team', to: '/team', group: 'workspace' },
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
 * An exact match, or a prefix match so a nested route like `/settings/billing`
 * keeps its parent highlighted. The prefix must end at a segment boundary, or
 * `/team` would light up for `/teams-archive`.
 */
export function isActive(itemPath: string, currentPath: string): boolean {
  if (itemPath === currentPath) return true
  return currentPath.startsWith(itemPath.endsWith('/') ? itemPath : `${itemPath}/`)
}

/**
 * The title the frame's one header shows for a route. Kept as data next to the
 * nav so the two cannot drift; the TopBar renders it and decides nothing.
 */
/**
 * Titles for framed routes that are NOT nav destinations. The editor is reached by
 * action ("New template", or opening a template), so it has no nav item — but the
 * frame's one header still has to name it.
 */
const OFF_NAV_TITLES: Readonly<Record<string, string>> = {
  '/canvas': 'Editor',
}

/**
 * Should the sidebar start collapsed on this route?
 *
 * The editor, yes: the canvas is starved for width. An A4 page is 794px and the
 * chrome (sidebar 220 + tool rail 168 + right panel 300) leaves only ~689px at
 * 1440px, so the page does not fit. Collapsing the sidebar to 56px there recovers
 * 164px and an A4 page fits again (see relayout doc Amendment 8).
 *
 * Everywhere else, no: the Dashboard and Templates ARE navigation, and hiding the
 * nav on the pages built for navigating would be perverse.
 */
export function defaultSidebarCollapsed(currentPath: string): boolean {
  return routeOf(currentPath) === '/canvas'
}

export function pageTitle(currentPath: string): string {
  // Every nav item is now a distinct route, so the first one whose route matches
  // names the page. `routeOf` drops any incidental hash before matching.
  const route = routeOf(currentPath)
  const match = NAV_ITEMS.find((item) => isActive(item.to, route))
  return match?.label ?? OFF_NAV_TITLES[route] ?? ''
}
