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

const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', group: 'main' },
  { id: 'settings', label: 'Settings', to: '/settings', group: 'workspace' },
] as const

export function navItems(): readonly NavItem[] {
  return NAV_ITEMS
}

export function navItemsInGroup(group: NavGroup): readonly NavItem[] {
  return NAV_ITEMS.filter((item) => item.group === group)
}

/**
 * Is `item` the one the current route is on?
 *
 * Prefix match (not equality) so nested routes like `/settings/billing` keep the
 * parent highlighted. The prefix must end at a segment boundary, or `/team`
 * would light up for `/teams-archive`.
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
  const match = NAV_ITEMS.find((item) => isActive(item.to, currentPath))
  return match?.label ?? ''
}
