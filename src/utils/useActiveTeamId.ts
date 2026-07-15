/**
 * useActiveTeamId — the signed-in user's active team, resolved once.
 *
 * Extracted from TemplateCanvas, which had the only copy, because the Dashboard's
 * draft-restore card needs the same value to withhold another team's draft.
 *
 * `loading` is the important part. `getActiveTeamId()` is async, so on the first
 * render the id is null — and null is ALSO the legitimate "no team / lookup
 * failed" answer. A caller that cannot tell those apart will compare a draft's
 * team against null and silently withhold a draft it should have offered. So the
 * two states are reported separately: gate on `loading` first, then on `teamId`.
 */
import { useEffect, useState } from 'react'
import { getActiveTeamId } from '../services/teamService'

export interface ActiveTeam {
  /** null once resolved means: no team, or the lookup failed. */
  readonly teamId: string | null
  /** True until the lookup settles. `teamId` is meaningless while this is true. */
  readonly loading: boolean
}

export function useActiveTeamId(): ActiveTeam {
  const [team, setTeam] = useState<ActiveTeam>({ teamId: null, loading: true })

  useEffect(() => {
    let cancelled = false
    getActiveTeamId()
      .then((teamId) => {
        if (!cancelled) setTeam({ teamId, loading: false })
      })
      .catch(() => {
        if (!cancelled) setTeam({ teamId: null, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return team
}
