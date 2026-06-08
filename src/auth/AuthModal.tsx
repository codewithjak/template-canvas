/**
 * src/auth/AuthModal.tsx
 * The sign-in gate shown when an unauthenticated user opens the app.
 * Google-only for now: one button handles both signup and login —
 * Supabase creates the account on first sign-in and the DB trigger
 * provisions the user's profile + personal team automatically.
 */
import { useState } from 'react'
import { useAuth } from './AuthContext'
import './AuthModal.css'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 0 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39 35.5 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  )
}

export default function AuthModal({
  redirectPath = '/canvas',
}: {
  redirectPath?: string
}) {
  const { signInWithGoogle } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogle = async () => {
    setLoading(true)
    setError(null)
    try {
      await signInWithGoogle(redirectPath)
      // On success the browser navigates to Google; code below won't run.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="authgate">
      <div
        className="authgate__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="authgate-title"
      >
        <div className="authgate__brand">Mapdoc</div>
        <h2 id="authgate-title" className="authgate__title">
          Sign in to continue
        </h2>
        <p className="authgate__sub">
          Continue with Google to sign in or create your workspace. New here?
          We&rsquo;ll set everything up automatically.
        </p>

        <button
          type="button"
          className="authgate__google"
          onClick={handleGoogle}
          disabled={loading}
        >
          <GoogleIcon />
          <span>{loading ? 'Redirecting…' : 'Continue with Google'}</span>
        </button>

        {error && <p className="authgate__error">{error}</p>}

        <p className="authgate__legal">
          By continuing you agree to Mapdoc&rsquo;s Terms and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
