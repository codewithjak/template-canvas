/**
 * src/pages/WebhooksCard.tsx
 *
 * Settings card for configuring outbound webhooks to no-code tools (Zapier,
 * n8n, Make) or any custom endpoint. JWT-authed via the backend's requireTeam;
 * rendered only when the team has the `api` capability.
 *
 * Lets a user: register an endpoint (URL + events), see/copy the signing secret
 * once, test (ping), pause/resume, rotate the secret, delete, and inspect recent
 * deliveries with a redeliver action.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  listWebhooks,
  createWebhook,
  deleteWebhook,
  setWebhookActive,
  rotateWebhookSecret,
  pingWebhook,
  listWebhookDeliveries,
  redeliverWebhook,
  WEBHOOK_EVENTS,
  type WebhookEndpoint,
  type WebhookDelivery,
} from '../services/apiIntegration'
import { confirm, notify } from '../notify'

const SYSTEMS = [
  { id: 'custom', label: 'Custom', placeholder: 'https://your-service.example.com/webhook', hint: 'Any HTTPS URL that should receive events.' },
  { id: 'zapier', label: 'Zapier', placeholder: 'https://hooks.zapier.com/hooks/catch/…/…/', hint: 'In Zapier: Webhooks by Zapier → Catch Hook → copy the custom URL.' },
  { id: 'n8n',    label: 'n8n',    placeholder: 'https://<workspace>.app.n8n.cloud/webhook/mapdoc', hint: 'In n8n: add a Webhook node → copy its Production URL.' },
  { id: 'make',   label: 'Make',   placeholder: 'https://hook.eu2.make.com/…', hint: 'In Make: add a Custom webhook module → copy the address.' },
] as const

const S = {
  section: { background: '#fff', border: '1px solid #e9edf3', borderRadius: 16, padding: 24, marginBottom: 20 } as const,
  h2:      { fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 } as const,
  sub:     { fontSize: 13, color: '#64748b', margin: '4px 0 16px' } as const,
  input:   { flex: 1, border: '1px solid #cbd5e1', borderRadius: 8, padding: '9px 11px', fontSize: 13, color: '#0f172a' } as const,
  primary: { border: 'none', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const,
  ghost:   { border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as const,
  danger:  { border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as const,
  muted:   { fontSize: 12, color: '#94a3b8' } as const,
  chip:    { fontSize: 11, fontWeight: 600, color: '#475569', background: '#f1f5f9', borderRadius: 999, padding: '2px 8px' } as const,
}

const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  success: { bg: '#ecfdf5', fg: '#059669' },
  failed:  { bg: '#fffbeb', fg: '#b45309' },
  dead:    { bg: '#fef2f2', fg: '#dc2626' },
  pending: { bg: '#f1f5f9', fg: '#475569' },
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <code style={{ flex: 1, fontSize: 12, background: '#fff', border: '1px solid #d1fae5', borderRadius: 6, padding: '8px 10px', wordBreak: 'break-all' }}>{value}</code>
        <button onClick={copy} style={{ border: '1px solid #10b981', background: copied ? '#10b981' : '#fff', color: copied ? '#fff' : '#059669', borderRadius: 6, padding: '0 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  )
}

function Deliveries({ endpointId }: { endpointId: string }) {
  const [rows, setRows] = useState<WebhookDelivery[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setRows(await listWebhookDeliveries({ endpointId, limit: 20 })) }
    catch (e) { notify.error(e instanceof Error ? e.message : String(e)) }
  }, [endpointId])

  useEffect(() => { void load() }, [load])

  const redeliver = async (id: string) => {
    setBusyId(id)
    try { await redeliverWebhook(id); notify.success('Re-delivery queued'); await load() }
    catch (e) { notify.error(e instanceof Error ? e.message : String(e)) }
    finally { setBusyId(null) }
  }

  if (!rows) return <div style={{ ...S.muted, padding: '8px 0' }}>Loading deliveries…</div>
  if (rows.length === 0) return <div style={{ ...S.muted, padding: '8px 0' }}>No deliveries yet.</div>

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed #e5e9f1', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((d) => {
        const c = STATUS_COLOR[d.status] || STATUS_COLOR.pending
        return (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            <span style={{ ...S.chip, background: c.bg, color: c.fg }}>{d.status}</span>
            <span style={{ color: '#334155' }}>{d.event}</span>
            <span style={S.muted}>· {d.attempts} attempt{d.attempts === 1 ? '' : 's'}{d.response_code ? ` · ${d.response_code}` : ''}</span>
            <span style={{ ...S.muted, marginLeft: 'auto' }}>{new Date(d.created_at).toLocaleString()}</span>
            {(d.status === 'failed' || d.status === 'dead') && (
              <button disabled={busyId === d.id} onClick={() => redeliver(d.id)} style={{ ...S.ghost, padding: '4px 10px' }}>{busyId === d.id ? '…' : 'Redeliver'}</button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function WebhooksCard() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [system, setSystem] = useState<typeof SYSTEMS[number]['id']>('custom')
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['bulk.completed'])
  const [creating, setCreating] = useState(false)
  const [freshSecret, setFreshSecret] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const preset = SYSTEMS.find((s) => s.id === system)!

  const load = useCallback(async () => {
    setLoading(true)
    try { setEndpoints(await listWebhooks()) }
    catch (e) { notify.error(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggleEvent = (ev: string) =>
    setEvents((cur) => (cur.includes(ev) ? cur.filter((e) => e !== ev) : [...cur, ev]))

  const add = async () => {
    if (!url.trim()) { notify.error('Enter the destination URL'); return }
    if (events.length === 0) { notify.error('Pick at least one event'); return }
    setCreating(true)
    try {
      const created = await createWebhook(url.trim(), events)
      setFreshSecret(created.secret)
      setUrl('')
      await load()
      notify.success('Webhook added')
    } catch (e) {
      notify.error(e instanceof Error ? e.message : String(e))
    } finally { setCreating(false) }
  }

  const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id)
    try { await fn(); notify.success(ok); await load() }
    catch (e) { notify.error(e instanceof Error ? e.message : String(e)) }
    finally { setBusyId(null) }
  }

  const onRotate = async (id: string) => {
    if (!(await confirm({ message: 'Rotate the signing secret? The current secret stops working immediately.', danger: true }))) return
    setBusyId(id)
    try { const { secret } = await rotateWebhookSecret(id); setFreshSecret(secret); notify.success('Secret rotated') }
    catch (e) { notify.error(e instanceof Error ? e.message : String(e)) }
    finally { setBusyId(null) }
  }

  const onDelete = async (id: string) => {
    if (!(await confirm({ message: 'Delete this webhook endpoint? Events will stop being delivered to it.', danger: true }))) return
    await act(id, () => deleteWebhook(id), 'Webhook deleted')
  }

  return (
    <section style={S.section}>
      <h2 style={S.h2}>Webhooks</h2>
      <p style={S.sub}>Notify Zapier, n8n, Make or any service when documents are generated — connect MapDoc to no-code automations.</p>

      {freshSecret && <CopyRow label="Signing secret — copy it now, it won’t be shown again." value={freshSecret} />}

      {/* Add endpoint */}
      <div style={{ border: '1px solid #eef2f7', borderRadius: 12, padding: 16, marginBottom: 18, background: '#fafbfc' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {SYSTEMS.map((s) => (
            <button key={s.id} onClick={() => setSystem(s.id)}
              style={{ ...S.ghost, ...(system === s.id ? { borderColor: '#2563eb', color: '#2563eb', background: '#eff6ff' } : {}) }}>
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input style={S.input} placeholder={preset.placeholder} value={url} onChange={(e) => setUrl(e.target.value)} />
          <button disabled={creating} onClick={add} style={{ ...S.primary, opacity: creating ? 0.7 : 1 }}>{creating ? 'Adding…' : 'Add'}</button>
        </div>
        <div style={{ ...S.muted, marginBottom: 12 }}>{preset.hint}</div>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} />
              <code style={{ fontSize: 12 }}>{ev}</code>
            </label>
          ))}
        </div>
      </div>

      {/* Endpoint list */}
      {loading ? (
        <div style={S.muted}>Loading…</div>
      ) : endpoints.length === 0 ? (
        <div style={S.muted}>No webhooks yet. Add one above to start receiving events.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {endpoints.map((ep) => (
            <div key={ep.id} style={{ border: '1px solid #e9edf3', borderRadius: 12, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ fontSize: 13, color: '#0f172a', wordBreak: 'break-all' }}>{ep.url}</code>
                    <span style={{ ...S.chip, background: ep.active ? '#ecfdf5' : '#f1f5f9', color: ep.active ? '#059669' : '#64748b' }}>{ep.active ? 'active' : 'paused'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {ep.events.map((ev) => <span key={ev} style={S.chip}>{ev}</span>)}
                  </div>
                  <div style={{ ...S.muted, marginTop: 6 }}>Added {new Date(ep.created_at).toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <button disabled={busyId === ep.id} onClick={() => act(ep.id, () => pingWebhook(ep.id), 'Test event sent')} style={S.ghost}>Test</button>
                <button disabled={busyId === ep.id} onClick={() => act(ep.id, () => setWebhookActive(ep.id, !ep.active), ep.active ? 'Paused' : 'Resumed')} style={S.ghost}>{ep.active ? 'Pause' : 'Resume'}</button>
                <button disabled={busyId === ep.id} onClick={() => onRotate(ep.id)} style={S.ghost}>Rotate secret</button>
                <button onClick={() => setOpenId(openId === ep.id ? null : ep.id)} style={S.ghost}>{openId === ep.id ? 'Hide deliveries' : 'Deliveries'}</button>
                <button disabled={busyId === ep.id} onClick={() => onDelete(ep.id)} style={{ ...S.danger, marginLeft: 'auto' }}>Delete</button>
              </div>

              {openId === ep.id && <Deliveries endpointId={ep.id} />}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
