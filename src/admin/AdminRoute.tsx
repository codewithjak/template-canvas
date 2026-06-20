/**
 * src/admin/AdminRoute.tsx  [ADMIN PANEL — isolated feature]
 *
 * Route guard for /admin. Requires a session AND platform-admin status.
 * Non-admins are bounced to /canvas. This is cosmetic gating — the backend
 * enforces admin access on every request regardless.
 */
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useIsAdmin } from './useIsAdmin'

export default function AdminRoute({ children }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const { isAdmin, loading: adminLoading } = useIsAdmin()
  const location = useLocation()

  if (authLoading || adminLoading) {
    return (
      <div className="admin-gate">
        <div className="admin-gate__spinner" />
      </div>
    )
  }

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  if (!isAdmin) return <Navigate to="/canvas" replace />

  return <>{children}</>
}
