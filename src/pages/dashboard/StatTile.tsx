/**
 * StatTile.tsx — one usage tile (app-frame doc T2.2). Presentational: it renders
 * a `UsageTile` and computes nothing. Every rule about what may be shown lives in
 * `usageTiles.ts`, where it is unit-tested.
 */
import type { UsageTile } from './usageTiles'
import './dashboard.css'

function StatTile({ tile }: { tile: UsageTile }) {
  return (
    <div className="dash-stat">
      <div className="dash-stat__value">
        {tile.used.toLocaleString()}
        <span className="dash-stat__limit">
          {tile.limit === null ? ' / unlimited' : ` / ${tile.limit.toLocaleString()}`}
        </span>
      </div>
      <div className="dash-stat__label">{tile.label}</div>
      {tile.percent !== null && (
        <div className="dash-stat__bar">
          <i style={{ width: `${tile.percent}%` }} />
        </div>
      )}
    </div>
  )
}

export default StatTile
