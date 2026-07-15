/**
 * src/pages/Login.tsx
 * Premium split sign-in: a layered product showcase on the left, a refined
 * auth form on the right. Auth is email magic link (passwordless, handles
 * both sign in and sign up) plus Continue with Google. Already-authenticated
 * visitors are bounced straight to their destination.
 */
import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import '../App.css'
import './Login.css'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8a12 12 0 0 1 0-24c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 1 0 24 44c11 0 20-9 20-20 0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8A12 12 0 0 1 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7A20 20 0 0 0 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 12.7 28l-6.6 5.1A20 20 0 0 0 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C39 35.5 44 30.5 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* ── Layered product showcase (left panel) ─────────────────────────────── */
function Showcase() {
  return (
    <aside className="auth__showcase" aria-hidden="true">
      <div className="auth__noise" />
      <div className="auth__orb auth__orb--1" />
      <div className="auth__orb auth__orb--2" />

      <div className="auth__showcase-top">
        <Link to="/" className="brand auth__brand" tabIndex={-1}>Mapdoc</Link>
      </div>

      <div className="auth__stage">
        {/* Back card — live data source */}
        <div className="pcard pcard--data">
          <div className="pcard__chip">
            <span className="pcard__pulse" /> Live data · 1,248 rows
          </div>
          <div className="pcard__rows">
            <div className="pcard__row pcard__row--head">
              <span>Client</span><span>Amount</span><span>Status</span>
            </div>
            <div className="pcard__row"><span>Acme Inc.</span><span>$2,400</span><span className="pcard__ok">Paid</span></div>
            <div className="pcard__row"><span>Northwind</span><span>$1,180</span><span className="pcard__ok">Paid</span></div>
            <div className="pcard__row"><span>Globex</span><span>$960</span><span className="pcard__due">Due</span></div>
          </div>
        </div>

        {/* Front card — generated invoice */}
        <div className="pcard pcard--doc">
          <div className="pcard__doc-head">
            <div>
              <div className="pcard__eyebrow">INVOICE</div>
              <div className="pcard__muted pcard__muted--w60" />
            </div>
            <div className="pcard__logo" />
          </div>
          <div className="pcard__meta">
            <div className="pcard__muted" /><div className="pcard__muted" />
            <div className="pcard__muted pcard__muted--w40" /><div className="pcard__muted pcard__muted--w40" />
          </div>
          <div className="pcard__table">
            <div className="pcard__tr pcard__tr--head"><span>Description</span><span>Qty</span><span>Amount</span></div>
            <div className="pcard__tr"><span>Template design</span><span>1</span><span>$240</span></div>
            <div className="pcard__tr"><span>Data mapping</span><span>3</span><span>$180</span></div>
            <div className="pcard__tr"><span>Export setup</span><span>1</span><span>$80</span></div>
          </div>
          <div className="pcard__total">Total&nbsp; <strong>$500</strong></div>
        </div>

        {/* Floating toast */}
        <div className="ptoast">
          <span className="ptoast__check">✓</span> 1,248 PDFs exported
        </div>
      </div>

      <div className="auth__showcase-copy">
        <h2 className="auth__headline">
          Turn raw data into <em>beautiful documents.</em>
        </h2>
        <p className="auth__subline">
          Design a template once, bind it to your data, and export thousands of
          polished, on-brand documents in a single click.
        </p>
        <div className="auth__trust">
          <div className="auth__stat"><strong>3×</strong><span>Faster setup</span></div>
          <div className="auth__divline" />
          <div className="auth__stat"><strong>1-click</strong><span>Bulk export</span></div>
          <div className="auth__divline" />
          <div className="auth__stat"><strong>100%</strong><span>On-brand</span></div>
        </div>
      </div>
    </aside>
  )
}

export default function Login() {
  const { session, loading: authLoading, signInWithGoogle, signInWithEmail } =
    useAuth()
  const [params] = useSearchParams()
  // Signing in with no explicit destination lands on the Dashboard, not straight
  // into an empty canvas (app-frame doc T2.4). `?next=` still wins, so a deep link
  // into /canvas or /settings survives the login round-trip.
  const next = params.get('next') || '/dashboard'

  // Invite links arrive with ?mode=signup so a brand-new invitee gets a
  // magic link (shouldCreateUser:true) instead of a silent "user not found".
  const [mode, setMode] = useState<'signin' | 'signup'>(
    params.get('mode') === 'signup' ? 'signup' : 'signin',
  )
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const isSignup = mode === 'signup'

  if (!authLoading && session) {
    return <Navigate to={next} replace />
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.')
      setGoogleLoading(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await signInWithEmail(trimmed, next, isSignup)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'))
    setError(null)
  }

  return (
    <div className="auth">
      <Showcase />

      <main className="auth__panel">
        <div className="auth__form">
          <Link to="/" className="brand auth__form-brand">Mapdoc</Link>

          {sent ? (
            <div className="auth__sent">
              <div className="auth__sent-icon">✦</div>
              <h1 className="auth__title">Check your inbox</h1>
              <p className="auth__lead">
                We sent a secure sign-in link to <strong>{email.trim()}</strong>.
                Open it on this device to continue.
              </p>
              <button
                type="button"
                className="auth__linkbtn"
                onClick={() => { setSent(false); setError(null) }}
              >
                ← Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="auth__title">
                {isSignup ? 'Create your account' : 'Welcome back'}
              </h1>
              <p className="auth__lead">
                {isSignup
                  ? 'Start building documents in minutes — no password required.'
                  : 'Sign in to keep building. We’ll email you a secure link.'}
              </p>

              <form className="auth__fields" onSubmit={handleEmail}>
                <label className="auth__label" htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  className="auth__input"
                  placeholder="you@company.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
                <button type="submit" className="auth__primary" disabled={loading}>
                  {loading ? 'Sending link…' : 'Continue with email'}
                </button>
              </form>

              <div className="auth__or"><span>or</span></div>

              <button
                type="button"
                className="auth__oauth"
                onClick={handleGoogle}
                disabled={googleLoading}
              >
                <GoogleIcon />
                <span>{googleLoading ? 'Redirecting…' : 'Continue with Google'}</span>
              </button>

              <p className="auth__switch">
                {isSignup ? 'Already have an account?' : 'New to Mapdoc?'}{' '}
                <button type="button" className="auth__switchbtn" onClick={toggleMode}>
                  {isSignup ? 'Sign in' : 'Create an account'}
                </button>
              </p>
            </>
          )}

          {error && <p className="auth__error">{error}</p>}

          <p className="auth__legal">
            By continuing you agree to our <a href="/terms">Terms</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>
      </main>
    </div>
  )
}
