/**
 * src/admin/AdminPage.tsx  [ADMIN PANEL — isolated feature]
 *
 * Platform-admin members view: lists every account (newest first), with search,
 * a per-row plan control, a "grant by email" box, per-member activity, and
 * soft-delete / restore. Entirely self-contained under src/admin/.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchUsers, setUserPlan, fetchUserActivity, softDeleteUser, restoreUser,
  type AdminUser, type PlanId, type AdminActivity,
} from './adminApi'
import './AdminPage.css'

const PLAN_OPTIONS: PlanId[] = ['free', 'pro', 'business']
const EVENT_LABEL: Record<string, string> = {
  login: 'Logins', template_created: 'Templates created', pdf_exported: 'Exports', ai_build: 'AI builds',
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
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

  // Activity drawer (expanded row).
  const [activityId, setActivityId] = useState<string | null>(null)
  const [activity, setActivity] = useState<AdminActivity | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)

  // Soft-delete / restore.
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

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

  async function toggleActivity(user: AdminUser) {
    if (activityId === user.id) { setActivityId(null); setActivity(null); return }
    setActivityId(user.id)
    setActivity(null)
    setActivityLoading(true)
    try {
      setActivity(await fetchUserActivity(user.id))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load activity.')
      setActivityId(null)
    } finally {
      setActivityLoading(false)
    }
  }

  async function confirmDelete() {
    if (!confirmUser) return
    setBusyId(confirmUser.id)
    setErr(null); setNotice(null)
    try {
      const { deletedTeams } = await softDeleteUser(confirmUser.id)
      setNotice(`Deleted ${confirmUser.email}${deletedTeams.length ? ` · removed ${deletedTeams.length} shared team(s)` : ''}`)
      setConfirmUser(null); setConfirmText('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete member.')
    } finally {
      setBusyId(null)
    }
  }

  async function restore(user: AdminUser) {
    setBusyId(user.id)
    setErr(null); setNotice(null)
    try {
      await restoreUser(user.id)
      setNotice(`Restored ${user.email}`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not restore member.')
    } finally {
      setBusyId(null)
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
        <select className="admin__select" value={grantPlan} onChange={e => setGrantPlan(e.target.value as PlanId)}>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <Fragment key={u.id}>
                  <tr className={u.deleted ? 'admin__row--deleted' : undefined}>
                    <td>
                      {u.name || <span className="admin__muted">—</span>}
                      {u.deleted && <span className="admin__badge admin__badge--deleted">deleted</span>}
                    </td>
                    <td>{u.email}</td>
                    <td>{formatDate(u.createdAt)}</td>
                    <td>{u.teamName || <span className="admin__muted">—</span>}</td>
                    <td>
                      <select
                        className="admin__planselect"
                        value={PLAN_OPTIONS.includes(u.plan as PlanId) ? u.plan : 'free'}
                        disabled={savingId === u.id || !u.email || u.deleted}
                        onChange={e => changePlan(u, e.target.value as PlanId)}
                      >
                        {PLAN_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      {savingId === u.id && <span className="admin__saving">…</span>}
                    </td>
                    <td className="admin__actions">
                      <button className="admin__linkbtn" onClick={() => toggleActivity(u)}>
                        {activityId === u.id ? 'Hide' : 'Activity'}
                      </button>
                      {u.deleted ? (
                        <button className="admin__linkbtn" disabled={busyId === u.id} onClick={() => restore(u)}>Restore</button>
                      ) : (
                        <button className="admin__linkbtn admin__linkbtn--danger" disabled={busyId === u.id} onClick={() => { setConfirmUser(u); setConfirmText('') }}>Delete</button>
                      )}
                    </td>
                  </tr>
                  {activityId === u.id && (
                    <tr className="admin__drawerrow">
                      <td colSpan={6}>
                        {activityLoading || !activity ? (
                          <div className="admin__muted">Loading activity…</div>
                        ) : (
                          <div className="admin__drawer">
                            <div className="admin__chips">
                              <span className="admin__chip">Templates: <b>{activity.summary.templateCount}</b></span>
                              {Object.entries(activity.summary.counts).map(([t, n]) => (
                                <span className="admin__chip" key={t}>{EVENT_LABEL[t] || t}: <b>{n}</b></span>
                              ))}
                              <span className="admin__chip">Last active: <b>{activity.summary.lastActiveAt ? formatDateTime(activity.summary.lastActiveAt) : 'never'}</b></span>
                            </div>
                            <div className="admin__timeline">
                              {activity.events.length === 0 ? (
                                <div className="admin__muted">No recorded activity.</div>
                              ) : activity.events.map((ev, i) => (
                                <div className="admin__event" key={i}>
                                  <span className="admin__event-type">{EVENT_LABEL[ev.event_type] || ev.event_type}</span>
                                  <span className="admin__muted">{formatDateTime(ev.created_at)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="admin__empty">No accounts match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirmUser && (
        <div className="admin__overlay" onClick={() => setConfirmUser(null)}>
          <div className="admin__modal" onClick={e => e.stopPropagation()}>
            <h2 className="admin__modal-title">Delete member</h2>
            <p className="admin__modal-text">
              This soft-deletes <b>{confirmUser.email}</b> (record kept, account locked out) and
              <b> deletes any shared team they own</b>. Type their email to confirm.
            </p>
            <input
              className="admin__input"
              autoFocus
              placeholder={confirmUser.email}
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
            />
            <div className="admin__modal-actions">
              <button className="admin__btn admin__btn--ghost" onClick={() => setConfirmUser(null)}>Cancel</button>
              <button
                className="admin__btn admin__btn--danger"
                disabled={confirmText.trim().toLowerCase() !== confirmUser.email.toLowerCase() || busyId === confirmUser.id}
                onClick={confirmDelete}
              >
                {busyId === confirmUser.id ? 'Deleting…' : 'Delete member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
