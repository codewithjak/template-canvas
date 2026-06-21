/**
 * src/pages/Settings.tsx
 * Account / team settings. Currently: API access + usage.
 *
 * This is the home for account-level configuration that is NOT part of
 * designing a document — kept off the canvas so the editor stays focused.
 * Future sections (Team, Billing) belong here too.
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
import { API_BASE } from '../services/config'
import { usePlan } from '../plan/PlanProvider'
import { getPlan, minPlanFor } from '../config/plans'
import { confirm } from '../notify'

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const over = limit != null && used >= limit
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: over ? '#dc2626' : '#0f172a' }}>
          {used}{limit != null ? ` / ${limit}` : ' / ∞'}
        </span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: '#eef1f6', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: over ? '#dc2626' : '#2563eb', transition: 'width .2s' }} />
      </div>
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e9edf3', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 18px' }}>{subtitle}</p>}
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
 * whenever the user belongs to more than one team (e.g. their personal team + a
 * Business team they were invited to). Member/invite management only appears
 * when the ACTIVE team is on a plan with the teams capability.
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
    return <Card title="Team"><div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div></Card>
  }

  const manager = data ? (data.role === 'owner' || data.role === 'admin') : false
  const seats = data?.seats
  const atCap = !!seats && seats.limit != null && seats.used + seats.pending >= seats.limit
  const selectStyle = { border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#0f172a', background: '#fff' }

  return (
    <Card title="Team" subtitle="Members share this workspace's templates, usage and plan.">
      {err && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '9px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      {teams.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 6 }}>Active team</label>
          <select value={activeId} disabled={busy} onChange={e => switchTeam(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            {teams.map(t => <option key={t.teamId} value={t.teamId}>{t.name} · {t.role}</option>)}
          </select>
        </div>
      )}

      {!canTeams ? (
        <div style={{ fontSize: 14, color: '#64748b' }}>
          Team workspaces — invite up to 5 members who share this plan — are included in the <strong>Business</strong> plan.
        </div>
      ) : data ? (
        <>
          <div style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>
            <strong style={{ color: '#0f172a' }}>{seats!.used}</strong> of {seats!.limit ?? '∞'} seats used
            {seats!.pending > 0 && <span style={{ color: '#94a3b8' }}> · {seats!.pending} pending</span>}
          </div>

          <div style={{ marginBottom: 18 }}>
            {data.members.map(m => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div>
                  <div style={{ fontSize: 14, color: '#0f172a' }}>{m.name || m.email || m.user_id}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8' }}>{m.email ? `${m.email} · ` : ''}{m.role}</div>
                </div>
                {manager && m.user_id !== data.currentUserId && (
                  <button disabled={busy} onClick={() => remove(m.user_id, m.name)} style={{ border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Remove</button>
                )}
              </div>
            ))}
          </div>

          {data.invites.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Pending invites</div>
              {data.invites.map(i => (
                <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <div style={{ fontSize: 13, color: '#475569' }}>{i.email}<span style={{ color: '#94a3b8' }}> · {i.role}</span></div>
                  {manager && (
                    <button disabled={busy} onClick={() => revoke(i.id)} style={{ border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Revoke</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {freshLink && (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>
                {emailedTo
                  ? `Invitation emailed to ${emailedTo}. You can also share this link directly:`
                  : 'Invite created — share this link with your teammate:'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <code style={{ flex: 1, fontSize: 12, background: '#fff', border: '1px solid #d1fae5', borderRadius: 6, padding: '8px 10px', wordBreak: 'break-all' }}>{freshLink}</code>
                <button onClick={copyLink} style={{ border: '1px solid #10b981', background: copied ? '#10b981' : '#fff', color: copied ? '#fff' : '#059669', borderRadius: 6, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            </div>
          )}

          {manager && (
            atCap ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>All seats are in use. Remove a member or revoke a pending invite to add someone new.</div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 12px', fontSize: 13 }}
                />
                <select value={role} onChange={e => setRole(e.target.value)} style={selectStyle}>
                  {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button disabled={busy || !email.trim()} onClick={invite} style={{ border: 'none', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: busy || !email.trim() ? 'default' : 'pointer', opacity: busy || !email.trim() ? 0.6 : 1 }}>Invite</button>
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
    <div style={{ minHeight: '100vh', background: '#f6f8fb' }}>
      {/* Top bar */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 24px', background: '#fff', borderBottom: '1px solid #e9edf3' }}>
        <button
          onClick={() => navigate('/canvas')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e9f1', background: '#fff', borderRadius: 8, padding: '7px 12px', fontSize: 13, color: '#334155', cursor: 'pointer' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to editor
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Settings</h1>
      </header>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px 60px' }}>
        {loading ? (
          <div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div>
        ) : (
          <>
            {error && (
              <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '11px 14px', borderRadius: 10, fontSize: 13, marginBottom: 20 }}>{error}</div>
            )}

            <Card title="Plan" subtitle="Your current subscription.">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 14, color: '#0f172a' }}>
                  <strong>{getPlan(plan).name}</strong>
                  <span style={{ color: '#94a3b8' }}> · ${getPlan(plan).price}/mo</span>
                </div>
                <button onClick={() => navigate('/pricing')} style={{ border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4f46e5', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  {plan === 'business' ? 'Manage plan' : 'Upgrade'}
                </button>
              </div>
            </Card>

            <TeamCard />

            <Card title="API access" subtitle="Push data into your templates from any system using a team API key.">
              {!can('api') ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 14, color: '#64748b' }}>
                    API access is included in the <strong>{minPlanFor('api')?.name}</strong> plan.
                  </div>
                  <button onClick={() => navigate('/pricing')} style={{ border: 'none', background: '#4f46e5', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Upgrade</button>
                </div>
              ) : (
              <>
              {freshKey && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>Copy your key now — it won’t be shown again.</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <code style={{ flex: 1, fontSize: 12, background: '#fff', border: '1px solid #d1fae5', borderRadius: 6, padding: '8px 10px', wordBreak: 'break-all' }}>{freshKey}</code>
                    <button onClick={copyKey} style={{ border: '1px solid #10b981', background: copied ? '#10b981' : '#fff', color: copied ? '#fff' : '#059669', borderRadius: 6, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                </div>
              )}

              {active ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <code style={{ fontSize: 14, color: '#0f172a' }}>{meta!.key_prefix}…</code>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                      Created {new Date(meta!.created_at).toLocaleDateString()}
                      {meta!.last_used_at ? ` · last used ${new Date(meta!.last_used_at).toLocaleDateString()}` : ' · never used'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button disabled={busy} onClick={handleIssue} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Rotate</button>
                    <button disabled={busy} onClick={handleRevoke} style={{ border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Revoke</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 14, color: '#64748b' }}>{meta?.revoked_at ? 'Key revoked. Generate a new one to resume access.' : 'No API key yet.'}</div>
                  <button disabled={busy} onClick={handleIssue} style={{ border: 'none', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Generating…' : 'Generate API key'}</button>
                </div>
              )}
              </>
              )}
            </Card>

            {usage && (
              <Card title={`Usage · ${usage.plan} plan`}>
                <UsageBar label="Templates" used={usage.templates.used} limit={usage.templates.limit} />
                <UsageBar label="PDF exports this month" used={usage.exportsThisMonth.used} limit={usage.exportsThisMonth.limit} />
              </Card>
            )}

            {can('api') && (
              <Card title="Push data" subtitle="Send JSON to a template; it’s normalized and stored, ready to map and export.">
                <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 10, padding: 16, fontSize: 12, lineHeight: 1.6, overflowX: 'auto', margin: 0 }}>{curl}</pre>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
                  Find <code>templateId</code> in the template you want to fill.
                </div>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  )
}
