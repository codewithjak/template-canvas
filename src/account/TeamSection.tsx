/**
 * src/account/TeamSection.tsx
 *
 * Team management: switcher + members + invites + seats. The switcher is shown
 * whenever the user belongs to more than one team. Member/invite management
 * only appears when the ACTIVE team is on a plan with the teams capability.
 *
 * Lifted verbatim from the old one-page Settings (`TeamCard`); it now owns the
 * `/team` route. Styling rides account.css / the app design tokens.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  getTeam,
  inviteMember,
  revokeTeamInvite,
  removeTeamMember,
  type TeamSummary,
} from '../services/apiIntegration'
import { listMyTeams, setActiveTeam, getActiveTeamId } from '../services/teamService'
import { usePlan } from '../plan/PlanProvider'
import { confirm } from '../notify'
import { SectionCard } from './SectionCard'
import { ICONS } from './sectionIcons'
import './account.css'

const ROLE_OPTIONS = [
  { value: 'admin',  label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
]

export default function TeamSection() {
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
    return <SectionCard id="team" title="Team" icon={ICONS.team}><div className="settings__muted">Loading…</div></SectionCard>
  }

  const manager = data ? (data.role === 'owner' || data.role === 'admin') : false
  const seats = data?.seats
  const atCap = !!seats && seats.limit != null && seats.used + seats.pending >= seats.limit

  return (
    <SectionCard id="team" title="Team" subtitle="Members share this workspace's templates, usage and plan." icon={ICONS.team}>
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
    </SectionCard>
  )
}
