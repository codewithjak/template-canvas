/**
 * src/pages/Settings.tsx
 * Account / team settings: Plan · Team · API access · Webhooks · Usage.
 *
 * This is the home for account-level configuration that is NOT part of
 * designing a document — kept off the canvas so the editor stays focused.
 * Styling lives in Settings.css and rides the app's design tokens (index.css).
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  issueApiKey,
  getApiKeyMeta,
  revokeApiKey,
  getUsage,
  getTeam,
  inviteMember,
  revokeTeamInvite,
  removeTeamMember,
  type ApiKeyMeta,
  type UsageSummary,
  type TeamSummary,
} from '../services/apiIntegration'
import { listMyTeams, setActiveTeam, getActiveTeamId } from '../services/teamService'
import WebhooksCard from './WebhooksCard'
import { API_BASE } from '../services/config'
import { usePlan } from '../plan/PlanProvider'
import { getPlan, minPlanFor } from '../config/plans'
import { confirm } from '../notify'
import './Settings.css'

/* ── Header icons ─────────────────────────────────────────────────────── */
const I = {
  plan: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 7l7-4 7 4-7 4-7-4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="M3 11l7 4 7-4" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
  ),
  team: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.6"/><path d="M2.5 16a4.5 4.5 0 0 1 9 0M13 5.2a2.5 2.5 0 0 1 0 4.6M14.5 16a4.5 4.5 0 0 0-2.2-3.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
  ),
  key: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><circle cx="7" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.6"/><path d="M9.5 10.5 16 4M13 4h3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  usage: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M4 16V9M10 16V4M16 16v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
  ),
  push: (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M10 16V5m0 0L6 9m4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const over = limit != null && used >= limit
  return (
    <div className="usage">
      <div className="usage__head">
        <span>{label}</span>
        <span className={`usage__value${over ? ' usage__value--over' : ''}`}>{used}{limit != null ? ` / ${limit}` : ' / ∞'}</span>
      </div>
      <div className="usage__track">
        <div className={`usage__fill${over ? ' usage__fill--over' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Card({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="scard">
      <div className="scard__head">
        <h2 className="scard__title">{icon && <span className="scard__icon">{icon}</span>}{title}</h2>
        {subtitle && <p className="scard__sub">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

const ROLE_OPTIONS = [
  { value: 'admin',  label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
]

/**
 * Team management: switcher + members + invites + seats. The switcher is shown
 * whenever the user belongs to more than one team. Member/invite management
 * only appears when the ACTIVE team is on a plan with the teams capability.
 */
function TeamCard() {
  const { can } = usePlan()
  const [data, setData] = useState<TeamSummary | null>(null)
  const [teams, setTeams] = useState<{ teamId: string; name: string; role: string }[]>([])
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [busy, setBusy] = useState(false)
  const [freshLink, setFreshLink] = useState<string | null>(null)
  const [emailedTo, setEmailedTo] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const canTeams = can('teams')

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [myTeams, active] = await Promise.all([listMyTeams(), getActiveTeamId()])
      setTeams(myTeams)
      setActiveId(active)
      setData(canTeams ? await getTeam() : null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [canTeams])

  useEffect(() => { void load() }, [load])

  // Switching changes the whole app's team scope (templates, usage, plan), so a
  // full reload is the simplest way to re-resolve everything cleanly.
  const switchTeam = async (teamId: string) => {
    if (teamId === activeId) return
    setBusy(true); setErr(null)
    try {
      await setActiveTeam(teamId)
      window.location.reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e)); setBusy(false)
    }
  }

  const invite = async () => {
    setBusy(true); setErr(null); setFreshLink(null); setEmailedTo(null)
    try {
      const target = email.trim()
      const { invite, emailed } = await inviteMember(target, role)
      setFreshLink(`${window.location.origin}/invite?token=${invite.token}`)
      setEmailedTo(emailed ? target : null)
      setEmail('')
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const revoke = async (id: string) => {
    if (!(await confirm({ message: 'invite.revokeConfirm', danger: true }))) return
    setBusy(true); setErr(null)
    try { await revokeTeamInvite(id); await load() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const remove = async (userId: string, name: string | null) => {
    if (!(await confirm({ message: { key: 'member.removeConfirm', vars: { name: name || 'this member' } }, danger: true }))) return
    setBusy(true); setErr(null)
    try { await removeTeamMember(userId); await load() }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const copyLink = async () => {
    if (!freshLink) return
    try {
      await navigator.clipboard.writeText(freshLink)
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — select manually */ }
  }

  if (loading) {
    return <Card title="Team" icon={I.team}><div className="settings__muted">Loading…</div></Card>
  }

  const manager = data ? (data.role === 'owner' || data.role === 'admin') : false
  const seats = data?.seats
  const atCap = !!seats && seats.limit != null && seats.used + seats.pending >= seats.limit

  return (
    <Card title="Team" subtitle="Members share this workspace's templates, usage and plan." icon={I.team}>
      {err && <div className="alert--danger">{err}</div>}

      {teams.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <label className="smeta" style={{ display: 'block', marginBottom: 6 }}>Active team</label>
          <select className="field" value={activeId} disabled={busy} onChange={e => switchTeam(e.target.value)} style={{ width: '100%' }}>
            {teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name} · {t.role}</option>)}
          </select>
        </div>
      )}

      {!canTeams ? (
        <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
          Team workspaces — invite up to 5 members who share this plan — are included in the <strong>Business</strong> plan.
        </div>
      ) : data ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>{seats!.used}</strong> of {seats!.limit ?? '∞'} seats used
            {seats!.pending > 0 && <span className="smeta"> · {seats!.pending} pending</span>}
          </div>

          <div style={{ marginBottom: 18 }}>
            {data.members.map(m => (
              <div key={m.user_id} className="list__row">
                <div>
                  <div className="list__name">{m.name || m.email || m.user_id}</div>
                  <div className="list__sub">{m.email ? `${m.email} · ` : ''}{m.role}</div>
                </div>
                {manager && m.user_id !== data.currentUserId && (
                  <button disabled={busy} onClick={() => remove(m.user_id, m.name)} className="btn btn--sm btn--danger">Remove</button>
                )}
              </div>
            ))}
          </div>

          {data.invites.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 8 }}>Pending invites</div>
              {data.invites.map(i => (
                <div key={i.id} className="srow" style={{ padding: '6px 0' }}>
                  <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{i.email}<span className="smeta"> · {i.role}</span></div>
                  {manager && <button disabled={busy} onClick={() => revoke(i.id)} className="btn btn--sm btn--ghost">Revoke</button>}
                </div>
              ))}
            </div>
          )}

          {freshLink && (
            <div className="notice notice--success">
              <div className="notice__label">
                {emailedTo
                  ? `Invitation emailed to ${emailedTo}. You can also share this link directly:`
                  : 'Invite created — share this link with your teammate:'}
              </div>
              <div className="copyrow">
                <code>{freshLink}</code>
                <button onClick={copyLink} className={`btn btn--sm ${copied ? 'btn--primary' : 'btn--ghost'}`}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          )}

          {manager && (
            atCap ? (
              <div className="smeta">All seats are in use. Remove a member or revoke a pending invite to add someone new.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="field field--grow" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com" />
                <select className="field" value={role} onChange={e => setRole(e.target.value)}>
                  {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button disabled={busy || !email.trim()} onClick={invite} className="btn btn--primary btn--sm">Invite</button>
              </div>
            )
          )}
        </>
      ) : null}
    </Card>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const { plan, can } = usePlan()
  const [meta, setMeta] = useState<ApiKeyMeta | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, u] = await Promise.all([getApiKeyMeta(), getUsage()])
      setMeta(m)
      setUsage(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleIssue = async () => {
    setBusy(true); setError(null)
    try {
      const { apiKey } = await issueApiKey()
      setFreshKey(apiKey)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const handleRevoke = async () => {
    if (!(await confirm({ message: 'apiKey.revokeConfirm', danger: true }))) return
    setBusy(true); setError(null)
    try {
      await revokeApiKey()
      setFreshKey(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  const copyKey = async () => {
    if (!freshKey) return
    try {
      await navigator.clipboard.writeText(freshKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — select manually */ }
  }

  const active = meta && !meta.revoked_at
  const sampleKey = freshKey || (meta ? `${meta.key_prefix}…` : 'tc_live_…')
  const curl =
    `curl -X POST ${API_BASE}/v1/ingest \\\n` +
    `  -H "X-API-Key: ${sampleKey}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"templateId":"<your-template-id>","data":{ ... }}'`

  return (
    <div className="settings">
      <header className="settings__bar">
        <button onClick={() => navigate('/canvas')} className="settings__back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to canvas
        </button>
        <h1 className="settings__title">Settings</h1>
      </header>

      <main className="settings__main">
        {loading ? (
          <div className="settings__muted">Loading…</div>
        ) : (
          <>
            {error && <div className="alert--danger">{error}</div>}

            <Card title="Plan" subtitle="Your current subscription." icon={I.plan}>
              <div className="srow">
                <div style={{ fontSize: 14 }}>
                  <strong>{getPlan(plan).name}</strong>
                  <span className="smeta"> · ${getPlan(plan).price}/mo</span>
                </div>
                <button onClick={() => navigate('/pricing')} className="btn btn--primary btn--sm">
                  {plan === 'business' ? 'Manage plan' : 'Upgrade'}
                </button>
              </div>
            </Card>

            <TeamCard />

            <Card title="API access" subtitle="Push data into your templates from any system using a team API key." icon={I.key}>
              {!can('api') ? (
                <div className="srow">
                  <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                    API access is included in the <strong>{minPlanFor('api')?.name}</strong> plan.
                  </div>
                  <button onClick={() => navigate('/pricing')} className="btn btn--primary btn--sm">Upgrade</button>
                </div>
              ) : (
                <>
                  {freshKey && (
                    <div className="notice notice--success">
                      <div className="notice__label">Copy your key now — it won’t be shown again.</div>
                      <div className="copyrow">
                        <code>{freshKey}</code>
                        <button onClick={copyKey} className={`btn btn--sm ${copied ? 'btn--primary' : 'btn--ghost'}`}>{copied ? 'Copied' : 'Copy'}</button>
                      </div>
                    </div>
                  )}

                  {active ? (
                    <div className="srow">
                      <div>
                        <code className="mono">{meta!.key_prefix}…</code>
                        <div className="smeta" style={{ marginTop: 3 }}>
                          Created {new Date(meta!.created_at).toLocaleDateString()}
                          {meta!.last_used_at ? ` · last used ${new Date(meta!.last_used_at).toLocaleDateString()}` : ' · never used'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button disabled={busy} onClick={handleIssue} className="btn btn--ghost">Rotate</button>
                        <button disabled={busy} onClick={handleRevoke} className="btn btn--danger">Revoke</button>
                      </div>
                    </div>
                  ) : (
                    <div className="srow">
                      <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{meta?.revoked_at ? 'Key revoked. Generate a new one to resume access.' : 'No API key yet.'}</div>
                      <button disabled={busy} onClick={handleIssue} className="btn btn--primary btn--sm">{busy ? 'Generating…' : 'Generate API key'}</button>
                    </div>
                  )}
                </>
              )}
            </Card>

            {can('api') && <WebhooksCard />}

            {usage && (
              <Card title={`Usage · ${usage.plan} plan`} icon={I.usage}>
                <UsageBar label="Templates" used={usage.templates.used} limit={usage.templates.limit} />
                <UsageBar label="PDF exports this month" used={usage.exportsThisMonth.used} limit={usage.exportsThisMonth.limit} />
              </Card>
            )}

            {can('api') && (
              <Card title="Push data" subtitle="Send JSON to a template; it’s normalized and stored, ready to map and export." icon={I.push}>
                <pre className="codeblock">{curl}</pre>
                <div className="smeta" style={{ marginTop: 10 }}>
                  Find <code className="mono" style={{ fontSize: 12 }}>templateId</code> in the template you want to fill.
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}
