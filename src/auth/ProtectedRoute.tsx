/**
 * src/auth/ProtectedRoute.tsx
 * Gates a route behind authentication. While the session is hydrating we
 * show a spinner; if there's no session we redirect to the dedicated /login
 * page (remembering the attempted path via ?next=); otherwise we render the
 * page.
 *
 * Gating the destination (not just the "Launch App" button) means deep
 * links, refreshes, and bookmarks to /canvas all require sign-in too.
 */
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import './AuthModal.css'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="authgate authgate--loading">
        <div className="authgate__spinner" />
      </div>
    )
  }

  if (!session) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }

  return <>{children}</>
}
