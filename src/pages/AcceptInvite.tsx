/**
 * src/pages/AcceptInvite.tsx
 * Landing page for a team invite link (/invite?token=…).
 *
 * Shows who invited whom (via the public lookup), then:
 *   • signed out → bounce through /login and come back here, OR
 *   • signed in  → accept, join the team, make it active, head to the canvas.
 *
 * Accepting requires the signed-in user's email to match the invited email;
 * the backend enforces that and the seat cap.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { usePlan } from '../plan/PlanProvider'
import { lookupInvite, acceptInvite, type InviteInfo } from '../services/apiIntegration'
import { clearTeamCache } from '../services/teamService'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f6f8fb', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', border: '1px solid #e9edf3', borderRadius: 16, padding: 32, width: 'min(440px, 100%)', boxShadow: '0 20px 50px rgba(15,23,42,.08)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#0f172a', marginBottom: 18 }}>Mapdoc</div>
        {children}
      </div>
    </div>
  )
}

export default function AcceptInvite() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const { session, loading: authLoading } = useAuth()
  const { refresh } = usePlan()

  const [info, setInfo] = useState<InviteInfo | null>(null)
  // Derive the no-token state up front so the effect never sets state synchronously.
  const [loading, setLoading] = useState(!!token)
  const [err, setErr] = useState<string | null>(token ? null : 'This invite link is missing its token.')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) return
    lookupInvite(token)
      .then(setInfo)
      .catch(e => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [token])

  const goSignIn = useCallback(() => {
    // Come straight back here after auth (Login forwards to ?next=). mode=signup
    // ensures a first-time invitee actually receives a magic link.
    navigate(`/login?next=${encodeURIComponent(`/invite?token=${token}`)}&mode=signup`)
  }, [navigate, token])

  const accept = useCallback(async () => {
    setBusy(true); setErr(null)
    try {
      await acceptInvite(token)
      clearTeamCache()
      await refresh()
      setDone(true)
      setTimeout(() => navigate('/canvas', { replace: true }), 900)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e)); setBusy(false)
    }
  }, [token, refresh, navigate])

  if (loading || authLoading) {
    return <Shell><div style={{ color: '#64748b', fontSize: 14 }}>Loading invite…</div></Shell>
  }

  if (err && !info) {
    return (
      <Shell>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Invite unavailable</h1>
        <p style={{ fontSize: 14, color: '#475569', margin: '0 0 20px' }}>{err}</p>
        <button onClick={() => navigate('/')} style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: 9, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back to home</button>
      </Shell>
    )
  }

  const expired = info?.expired || info?.accepted

  return (
    <Shell>
      <h1 style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
        You're invited to <span style={{ color: '#4f46e5' }}>{info?.teamName}</span>
      </h1>
      <p style={{ fontSize: 14, color: '#475569', margin: '0 0 22px', lineHeight: 1.55 }}>
        {expired
          ? (info?.accepted ? 'This invite has already been used.' : 'This invite has expired — ask for a new one.')
          : <>Join as <strong>{info?.role}</strong> using <strong>{info?.email}</strong>. Members share the team's templates, usage and plan.</>}
      </p>

      {err && <p style={{ fontSize: 13, color: '#b91c1c', margin: '0 0 16px' }}>{err}</p>}

      {done ? (
        <p style={{ fontSize: 14, color: '#059669', fontWeight: 600 }}>Joined — taking you to the editor…</p>
      ) : expired ? (
        <button onClick={() => navigate('/')} style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#475569', borderRadius: 9, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Back to home</button>
      ) : session ? (
        <button disabled={busy} onClick={accept} style={{ border: 'none', background: '#4f46e5', color: '#fff', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
          {busy ? 'Joining…' : 'Accept invite'}
        </button>
      ) : (
        <button onClick={goSignIn} style={{ border: 'none', background: '#4f46e5', color: '#fff', borderRadius: 9, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Sign in to accept
        </button>
      )}
    </Shell>
  )
}
