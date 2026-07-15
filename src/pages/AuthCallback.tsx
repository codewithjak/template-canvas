/**
 * src/pages/AuthCallback.tsx
 * Landing route for the Google OAuth redirect (/auth/callback).
 *
 * The Supabase client (detectSessionInUrl + PKCE) exchanges the code in
 * the URL and fires onAuthStateChange, which AuthContext picks up. Once a
 * session exists we forward the user to wherever they were headed.
 */
import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth, POST_LOGIN_KEY } from '../auth/AuthContext'
import { logEvent } from '../services/analytics'
import '../auth/AuthModal.css'

export default function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const errorDescription = params.get('error_description')

  useEffect(() => {
    if (loading || errorDescription) return
    if (session) {
      // This route only mounts on the OAuth redirect, so this fires once
      // per genuine sign-in (unlike onAuthStateChange, which also fires on
      // tab focus and token refresh).
      void logEvent('login')
      // Same default as Login.tsx: the Dashboard, not an empty canvas (T2.4).
      const next = sessionStorage.getItem(POST_LOGIN_KEY) || '/dashboard'
      sessionStorage.removeItem(POST_LOGIN_KEY)
      navigate(next, { replace: true })
    }
  }, [loading, session, errorDescription, navigate])

  if (errorDescription) {
    return (
      <div className="authgate">
        <div className="authgate__card" role="dialog" aria-modal="true">
          <div className="authgate__brand">Mapdoc</div>
          <h2 className="authgate__title">Sign-in failed</h2>
          <p className="authgate__sub">{errorDescription}</p>
          <button
            type="button"
            className="authgate__google"
            onClick={() => navigate('/', { replace: true })}
          >
            <span>Back to home</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="authgate authgate--loading">
      <div className="authgate__spinner" />
    </div>
  )
}
