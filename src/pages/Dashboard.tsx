/**
 * Dashboard.tsx — the signed-in landing page (app-frame doc T2.4).
 *
 * Composes only data that already exists: `usePlan()` for the tiles and
 * `listTemplates()` for the recent list. There is deliberately NO activity feed,
 * no "documents generated" count and no average batch time — the mockup shows all
 * three and the codebase has none of them (`analytics_events` is write-only from
 * the frontend). Building them would mean a new backend read path, which is out of
 * scope for this document.
 */
import { usePlan } from '../plan/PlanProvider'
import { usageTiles } from './dashboard/usageTiles'
import StatTile from './dashboard/StatTile'
import RecentProjects from './dashboard/RecentProjects'
import './dashboard/dashboard.css'

/**
 * Tiles render only when usage has actually arrived. While it is loading — or if
 * the call failed — we say so rather than render zeros: a zero is a claim, and it
 * would be a false one (see usageTiles.ts).
 */
function UsageStats() {
  const { usage, loading } = usePlan()
  const tiles = usageTiles(usage)

  if (loading) {
    return (
      <div className="dash-stats">
        {[0, 1].map((i) => (
          <div key={i} className="dash-stat dash-stat--skeleton" aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (tiles.length === 0) {
    return <div className="dash-muted">Usage is unavailable right now.</div>
  }

  return (
    <div className="dash-stats">
      {tiles.map((tile) => (
        <StatTile key={tile.id} tile={tile} />
      ))}
    </div>
  )
}

function Dashboard() {
  return (
    <div className="dash">
      <UsageStats />

      <section className="dash-section">
        <h2 className="dash-section__title">Jump back in</h2>
        <RecentProjects />
      </section>
    </div>
  )
}

export default Dashboard
