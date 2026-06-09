/**
 * src/pages/Pricing.tsx
 * Public pricing page. Renders the plan tiers from src/config/plans.ts and
 * lets a signed-in user switch plans via the dev /v1/plan endpoint (the
 * stand-in for Stripe checkout until billing is wired up).
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PLAN_ORDER, PLANS, type PlanId } from '../config/plans'
import { usePlan } from '../plan/PlanProvider'
import { setTeamPlan } from '../services/planService'
import { useAuth } from '../auth/AuthContext'
import '../App.css'

export default function Pricing() {
  const { plan: currentPlan, loading, refresh } = usePlan()
  const { session } = useAuth()
  const [busy, setBusy] = useState<PlanId | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async (planId: PlanId) => {
    setError(null)
    setBusy(planId)
    try {
      await setTeamPlan(planId)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="lp">
      <header className="topbar">
        <div className="topbar__inner">
          <Link to="/" className="brand">Mapdoc</Link>
          <nav className="topbar__nav">
            <Link to="/features" className="topbar__link">Features</Link>
            <Link to="/pricing" className="topbar__link" style={{ color: 'var(--blue)' }}>Pricing</Link>
            <Link to="/careers" className="topbar__link">Careers</Link>
          </nav>
          <Link to="/canvas" className="btn btn--primary btn--sm">Launch App</Link>
        </div>
      </header>

      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="wrap" style={{ textAlign: 'center' }}>
          <span className="eyebrow hero__eyebrow">✦ Pricing</span>
          <h1>Simple plans that grow with you.</h1>
          <p className="hero__sub" style={{ marginInline: 'auto' }}>
            Start free. Upgrade when you need clean exports, bulk generation, or API access.
          </p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="wrap">
          {error && (
            <div style={{
              maxWidth: 720, margin: '0 auto 24px', background: '#fef2f2', color: '#b91c1c',
              padding: '11px 14px', borderRadius: 10, fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div style={{
            display: 'grid', gap: 20, maxWidth: 1040, margin: '0 auto',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          }}>
            {PLAN_ORDER.map(id => {
              const p = PLANS[id]
              const isCurrent = session != null && currentPlan === id
              const highlight = id === 'pro'
              return (
                <article
                  key={id}
                  style={{
                    background: '#fff',
                    border: highlight ? '2px solid #4f46e5' : '1px solid #e9edf3',
                    borderRadius: 18, padding: 26, display: 'flex', flexDirection: 'column',
                    position: 'relative',
                  }}
                >
                  {highlight && (
                    <span style={{
                      position: 'absolute', top: -12, left: 26, background: '#4f46e5', color: '#fff',
                      fontSize: 11, fontWeight: 700, letterSpacing: .3, padding: '4px 10px', borderRadius: 999,
                    }}>
                      MOST POPULAR
                    </span>
                  )}
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{p.name}</h3>
                  <p style={{ margin: '4px 0 16px', fontSize: 13, color: '#64748b', minHeight: 34 }}>{p.tagline}</p>
                  <div style={{ marginBottom: 18 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: '#0f172a' }}>${p.price}</span>
                    <span style={{ fontSize: 14, color: '#94a3b8' }}>/mo</span>
                  </div>

                  <button
                    disabled={isCurrent || busy != null || loading}
                    onClick={() => choose(id)}
                    style={{
                      border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700,
                      cursor: isCurrent || busy != null ? 'default' : 'pointer', marginBottom: 22,
                      background: isCurrent ? '#eef2ff' : highlight ? '#4f46e5' : '#0f172a',
                      color: isCurrent ? '#4f46e5' : '#fff',
                      opacity: busy != null && busy !== id ? 0.6 : 1,
                    }}
                  >
                    {isCurrent ? 'Current plan'
                      : busy === id ? 'Switching…'
                      : p.price === 0 ? 'Get started'
                      : `Choose ${p.name}`}
                  </button>

                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ display: 'flex', gap: 9, fontSize: 13.5, color: '#334155', lineHeight: 1.4 }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                          <path d="m3.5 8.5 3 3 6-7" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}
          </div>

          {!session && (
            <p style={{ textAlign: 'center', marginTop: 28, fontSize: 13, color: '#94a3b8' }}>
              <Link to="/canvas" style={{ color: '#4f46e5', fontWeight: 600 }}>Sign in</Link> to choose a plan.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
