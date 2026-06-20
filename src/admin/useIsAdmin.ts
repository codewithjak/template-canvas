/**
 * src/admin/useIsAdmin.ts  [ADMIN PANEL — isolated feature]
 *
 * Probes the backend for platform-admin status. Cosmetic only — every admin
 * API route re-checks server-side, so this just decides what UI to show.
 *
 * The no-session / still-loading cases are derived during render; the effect
 * only ever calls setState from inside the async fetch callback (avoids the
 * cascading-render lint and keeps a single source of truth keyed to the user).
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { fetchIsAdmin } from './adminApi'

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { session, loading: authLoading } = useAuth()
  const uid = session?.user?.id ?? null
  const [fetched, setFetched] = useState<{ uid: string; isAdmin: boolean } | null>(null)

  useEffect(() => {
    if (authLoading || !uid) return
    let cancelled = false
    fetchIsAdmin()
      .then(ok => { if (!cancelled) setFetched({ uid, isAdmin: ok }) })
      .catch(() => { if (!cancelled) setFetched({ uid, isAdmin: false }) })
    return () => { cancelled = true }
  }, [uid, authLoading])

  if (authLoading) return { isAdmin: false, loading: true }
  if (!uid) return { isAdmin: false, loading: false }
  // Result not in yet, or it's stale from a previous user → still loading.
  if (!fetched || fetched.uid !== uid) return { isAdmin: false, loading: true }
  return { isAdmin: fetched.isAdmin, loading: false }
}
