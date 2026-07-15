/**
 * Sidebar.tsx — the app frame's left rail (app-frame doc T1.2).
 *
 * Presentational: it renders `navModel`'s items and the plan card, and owns no
 * domain state. The only thing it reads is `usePlan()`, which is already the
 * app-wide source for plan + usage — no new fetch, no new endpoint.
 *
 * There is deliberately NO "Editor" nav item: the editor is reached by action
 * ("New template", or opening a template), so a nav item would duplicate the
 * button below the brand.
 */
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { usePlan } from '../plan/PlanProvider'
import { navItemsInGroup, isActive, type NavItem } from './navModel'
import './frame.css'

/** Icons are view concerns, so they live here and not in the pure nav model. */
const ICONS: Record<string, ReactNode> = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  templates: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  integrations: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V3M9 21v-4M15 21v-4M12 12v9" />
    </svg>
  ),
  team: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 6a3 3 0 0 1 0 6M17 14c2.4.5 4 2.5 4 5" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  ),
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const active = isActive(item.to, pathname)
  return (
    <button
      type="button"
      className={`frame-nav${active ? ' frame-nav--active' : ''}`}
      aria-current={active ? 'page' : undefined}
      // Collapsed, the icon is the only thing left, so it has to carry the name —
      // both for a mouse (tooltip) and for a screen reader.
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      onClick={() => navigate(item.to)}
    >
      <span className="frame-nav__icon">{ICONS[item.id]}</span>
      {!collapsed && item.label}
    </button>
  )
}

/**
 * Plan + usage. `limit === null` means unlimited on this plan — show the count
 * with no bar rather than dividing by null (which renders an Infinity-wide bar).
 */
function PlanCard() {
  const { plan, usage, loading } = usePlan()
  if (loading || !usage) return null

  const { used, limit } = usage.templates
  const unlimited = limit === null
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100))

  return (
    <div className="frame-plan">
      <div className="frame-plan__head">
        <b>{plan} plan</b>
      </div>
      {!unlimited && (
        <div className="frame-plan__bar">
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
      {/* "unlimited", not "∞" — the Dashboard tiles say "unlimited", and one fact
          should not have two vocabularies across two surfaces. */}
      <small>
        {used} / {unlimited ? 'unlimited' : limit.toLocaleString()} templates
      </small>
    </div>
  )
}

interface Props {
  collapsed: boolean
  onToggle: () => void
}

function Sidebar({ collapsed, onToggle }: Props) {
  const navigate = useNavigate()
  const main = navItemsInGroup('main')
  const workspace = navItemsInGroup('workspace')

  return (
    <aside className={`frame-side${collapsed ? ' frame-side--collapsed' : ''}`}>
      <div className="frame-brand">
        <span className="frame-brand__mark" aria-hidden="true" />
        {!collapsed && (
          <b>
            map<i>doc</i>
          </b>
        )}
        <button
          type="button"
          className="frame-collapse"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <button
        type="button"
        className="frame-new"
        onClick={() => navigate('/canvas')}
        title={collapsed ? 'New template' : undefined}
        aria-label={collapsed ? 'New template' : undefined}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        {!collapsed && 'New template'}
      </button>

      <nav className="frame-navlist" aria-label="Main">
        {main.map((item) => (
          <NavLink key={item.id} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {workspace.length > 0 && (
        <>
          {!collapsed && <div className="frame-navlbl">Workspace</div>}
          <nav className="frame-navlist" aria-label="Workspace">
            {workspace.map((item) => (
              <NavLink key={item.id} item={item} collapsed={collapsed} />
            ))}
          </nav>
        </>
      )}

      <div className="frame-side__spacer" />
      {/* The plan card is a paragraph of text; there is nowhere for it to go at 56px,
          and a truncated usage bar tells no one anything. It hides. */}
      {!collapsed && <PlanCard />}
    </aside>
  )
}

export default Sidebar
