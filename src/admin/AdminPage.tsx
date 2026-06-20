/**
 * src/admin/AdminPage.tsx  [ADMIN PANEL — isolated feature]
 *
 * Platform-admin members view: lists every account (newest first), with search
 * and a per-row plan control, plus a quick "grant by email" box. Entirely
 * self-contained under src/admin/.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchUsers, setUserPlan, type AdminUser, type PlanId } from './adminApi'
import './AdminPage.css'

const PLAN_OPTIONS: PlanId[] = ['free', 'pro', 'business']

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Quick grant-by-email box.
  const [grantEmail, setGrantEmail] = useState('')
  const [grantPlan, setGrantPlan] = useState<PlanId>('business')
  const [granting, setGranting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      setUsers(await fetchUsers())
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.name || '').toLowerCase().includes(q) ||
      (u.teamName || '').toLowerCase().includes(q),
    )
  }, [users, query])

  async function changePlan(user: AdminUser, plan: PlanId) {
    if (plan === user.plan) return
    setSavingId(user.id)
    setErr(null)
    setNotice(null)
    try {
      await setUserPlan(user.email, plan)
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, plan } : u)))
      setNotice(`${user.email} → ${plan}`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not set plan.')
    } finally {
      setSavingId(null)
    }
  }

  async function grantByEmail(e: React.FormEvent) {
    e.preventDefault()
    const email = grantEmail.trim()
    if (!email) return
    setGranting(true)
    setErr(null)
    setNotice(null)
    try {
      await setUserPlan(email, grantPlan)
      setNotice(`${email} → ${grantPlan}`)
      setGrantEmail('')
      await load()
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Could not set plan.')
    } finally {
      setGranting(false)
    }
  }

  return (
    <div className="admin">
      <header className="admin__header">
        <div>
          <h1 className="admin__title">Admin · Members</h1>
          <p className="admin__subtitle">{users.length} account{users.length === 1 ? '' : 's'}</p>
        </div>
        <Link to="/canvas" className="admin__back">← Back to app</Link>
      </header>

      <form className="admin__grant" onSubmit={grantByEmail}>
        <input
          className="admin__input"
          type="email"
          placeholder="Grant a plan by email…"
          value={grantEmail}
          onChange={e => setGrantEmail(e.target.value)}
        />
        <select
          className="admin__select"
          value={grantPlan}
          onChange={e => setGrantPlan(e.target.value as PlanId)}
        >
          {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button className="admin__btn" type="submit" disabled={granting || !grantEmail.trim()}>
          {granting ? 'Granting…' : 'Grant'}
        </button>
      </form>

      <input
        className="admin__search"
        type="search"
        placeholder="Search name, email or team…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      {notice && <div className="admin__notice">✓ {notice}</div>}
      {err && <div className="admin__error">{err}</div>}

      {loading ? (
        <div className="admin__loading">Loading…</div>
      ) : (
        <div className="admin__tablewrap">
          <table className="admin__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Signed up</th>
                <th>Team</th>
                <th>Plan</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id}>
                  <td>{u.name || <span className="admin__muted">—</span>}</td>
                  <td>{u.email}</td>
                  <td>{formatDate(u.createdAt)}</td>
                  <td>{u.teamName || <span className="admin__muted">—</span>}</td>
                  <td>
                    <select
                      className="admin__planselect"
                      value={PLAN_OPTIONS.includes(u.plan as PlanId) ? u.plan : 'free'}
                      disabled={savingId === u.id || !u.email}
                      onChange={e => changePlan(u, e.target.value as PlanId)}
                    >
                      {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {savingId === u.id && <span className="admin__saving">…</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="admin__empty">No accounts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
