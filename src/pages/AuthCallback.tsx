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
import '../auth/AuthModal.css'

export default function AuthCallback() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const errorDescription = params.get('error_description')

  useEffect(() => {
    if (loading || errorDescription) return
    if (session) {
      const next = sessionStorage.getItem(POST_LOGIN_KEY) || '/canvas'
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
