/**
 * usageTiles.ts — turns a `UsageSummary` into the Dashboard's stat tiles
 * (app-frame doc T2.1). Pure, so the rules below are testable without React.
 *
 * Every rule here exists because a wrong number is worse than no number:
 *
 *  - `aiBuildsThisMonth` is OPTIONAL (`apiIntegration.ts:40` — "present on
 *    servers running the metered-AI build"). Against an older server it is
 *    undefined, so the tile is OMITTED rather than rendered as "undefined" or a
 *    0-of-0 bar. Two honest tiles beat three with one lying.
 *  - `limit: null` means UNLIMITED, not zero. `used / null` is Infinity in a
 *    progress bar, so unlimited tiles carry no bar at all.
 *  - `usage` is null while `GET /v1/usage` is in flight, and stays null if it
 *    fails. That yields NO tiles — the caller shows a skeleton or an error. A
 *    zero is a claim, and it would be a false one.
 */
import type { UsageSummary } from '../../services/apiIntegration'

export type UsageTileId = 'templates' | 'exports' | 'aiBuilds'

export interface UsageTile {
  readonly id: UsageTileId
  readonly label: string
  readonly used: number
  /** null = unlimited on this plan. Render the count, not a bar. */
  readonly limit: number | null
  /** 0-100, or null when there is no limit to fill. */
  readonly percent: number | null
}

function tile(id: UsageTileId, label: string, quota: { used: number; limit: number | null }): UsageTile {
  const { used, limit } = quota
  const percent =
    limit === null || limit <= 0 ? null : Math.min(100, Math.round((used / limit) * 100))
  return { id, label, used, limit, percent }
}

export function usageTiles(usage: UsageSummary | null | undefined): readonly UsageTile[] {
  if (!usage) return []

  const tiles: UsageTile[] = [
    tile('templates', 'Templates used', usage.templates),
    tile('exports', 'Exports this month', usage.exportsThisMonth),
  ]

  // Only when the server actually reports it (see the header).
  if (usage.aiBuildsThisMonth) {
    tiles.push(tile('aiBuilds', 'AI rebuilds this month', usage.aiBuildsThisMonth))
  }

  return tiles
}
