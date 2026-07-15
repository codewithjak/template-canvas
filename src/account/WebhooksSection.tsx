/**
 * src/account/WebhooksSection.tsx
 *
 * Integrations section for configuring outbound webhooks to no-code tools (Zapier,
 * n8n, Make) or any custom endpoint. JWT-authed via the backend's requireTeam;
 * rendered only when the team has the `api` capability. Styling rides
 * account.css / the app design tokens.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
import './account.css'

const SYSTEMS = [
  { id: 'custom', label: 'Custom', placeholder: 'https://your-service.example.com/webhook', hint: 'Any HTTPS URL that should receive events.' },
  { id: 'zapier', label: 'Zapier', placeholder: 'https://hooks.zapier.com/hooks/catch/…/…/', hint: 'In Zapier: Webhooks by Zapier → Catch Hook → copy the custom URL.' },
  { id: 'n8n',    label: 'n8n',    placeholder: 'https://<workspace>.app.n8n.cloud/webhook/mapdoc', hint: 'In n8n: add a Webhook node → copy its Production URL.' },
  { id: 'make',   label: 'Make',   placeholder: 'https://hook.eu2.make.com/…', hint: 'In Make: add a Custom webhook module → copy the address.' },
] as const

const STATUS_BADGE: Record<string, string> = {
  success: 'badge badge--success',
  failed:  'badge badge--warn',
  dead:    'badge badge--danger',
  pending: 'badge badge--muted',
}

const EVENT_DESC: Record<string, string> = {
  'document.generated': 'A single document was generated via the API.',
  'bulk.completed':     'A bulk export finished — the payload includes a download URL for the files.',
  'bulk.failed':        'A bulk export failed — the payload includes the error reason.',
}

/** Click "?" info popover — tappable (mobile-safe), closes on outside-click / Esc. */
function Help({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  return (
    <span className="help" ref={ref}>
      <button type="button" className="help__btn" aria-label="More info" onClick={() => setOpen((o) => !o)}>?</button>
      {open && <span className="help__pop" role="tooltip">{children}</span>}
    </span>
  )
}

const HEAD_ICON = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
    <circle cx="5" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.6"/>
    <circle cx="15" cy="5" r="2.2" stroke="currentColor" strokeWidth="1.6"/>
    <circle cx="10" cy="15" r="2.2" stroke="currentColor" strokeWidth="1.6"/>
    <path d="M6.7 6.6 9 13M13.3 6.6 11 13M7.2 5h5.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

function CopyRow({ label, value }: { label: ReactNode; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="notice notice--success">
      <div className="notice__label">{label}</div>
      <div className="copyrow">
        <code>{value}</code>
        <button onClick={copy} className={`btn btn--sm ${copied ? 'btn--primary' : 'btn--ghost'}`}>{copied ? 'Copied' : 'Copy'}</button>
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

  if (!rows) return <div className="smeta" style={{ padding: '8px 0' }}>Loading deliveries…</div>
  if (rows.length === 0) return <div className="smeta" style={{ padding: '8px 0' }}>No deliveries yet.</div>

  return (
    <div className="wh-deliveries">
      <div className="smeta" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
        Recent deliveries
        <Help>
          <strong>success</strong> — delivered (2xx).<br />
          <strong>failed</strong> — will retry automatically with backoff.<br />
          <strong>dead</strong> — gave up after retries; use <strong>Redeliver</strong>.<br />
          <strong>pending</strong> — in progress.
        </Help>
      </div>
      {rows.map((d) => (
        <div key={d.id} className="wh-delivery">
          <span className={STATUS_BADGE[d.status] || STATUS_BADGE.pending}>{d.status}</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>{d.event}</span>
          <span className="smeta">· {d.attempts} attempt{d.attempts === 1 ? '' : 's'}{d.response_code ? ` · ${d.response_code}` : ''}</span>
          <span className="smeta" style={{ marginLeft: 'auto' }}>{new Date(d.created_at).toLocaleString()}</span>
          {(d.status === 'failed' || d.status === 'dead') && (
            <button disabled={busyId === d.id} onClick={() => redeliver(d.id)} className="btn btn--sm btn--ghost">{busyId === d.id ? '…' : 'Redeliver'}</button>
          )}
        </div>
      ))}
    </div>
  )
}

export default function WebhooksSection() {
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
    <section className="scard">
      <div className="scard__head">
        <h2 className="scard__title"><span className="scard__icon">{HEAD_ICON}</span>Webhooks</h2>
        <p className="scard__sub">Notify Zapier, n8n, Make or any service when documents are generated — connect MapDoc to no-code automations.</p>
      </div>

      {/* How it works */}
      <details className="wh-guide">
        <summary>How webhooks work</summary>
        <div className="wh-guide__body">
          <ol className="wh-steps">
            <li><span className="n">1</span><div>Pick your tool below (Zapier, n8n, Make, or Custom) and paste the destination URL it gives you.</div></li>
            <li><span className="n">2</span><div>Choose which events to send. <code className="mono">bulk.completed</code> carries a download URL for the generated files.</div></li>
            <li><span className="n">3</span><div>MapDoc POSTs a <strong>signed</strong> JSON event whenever it happens — copy the signing secret once to verify it.</div></li>
            <li><span className="n">4</span><div>Use <strong>Test</strong> to send a sample event, and <strong>Deliveries</strong> to see what was sent and re-send failures.</div></li>
          </ol>
        </div>
      </details>

      {freshSecret && (
        <CopyRow
          value={freshSecret}
          label={
            <>
              Signing secret — copy it now, it won’t be shown again.{' '}
              <Help>
                Verify the <code>X-MapDoc-Signature</code> header: HMAC-SHA256 over <code>{'<timestamp>.<body>'}</code> using this secret. It proves the request came from MapDoc. Lost it? Rotate to get a new one.
              </Help>
            </>
          }
        />
      )}

      {/* Add endpoint */}
      <div className="wh-form">
        <div className="seg" style={{ marginBottom: 12 }}>
          {SYSTEMS.map((s) => (
            <button key={s.id} onClick={() => setSystem(s.id)} className={`seg__btn${system === s.id ? ' seg__btn--active' : ''}`}>{s.label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input className="field field--grow" placeholder={preset.placeholder} value={url} onChange={(e) => setUrl(e.target.value)} />
          <button disabled={creating} onClick={add} className="btn btn--primary btn--sm">{creating ? 'Adding…' : 'Add'}</button>
        </div>
        <div className="smeta" style={{ marginBottom: 12 }}>{preset.hint}</div>

        <div className="smeta" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 8 }}>
          Events to send
          <Help>Which things should notify this URL. You can change them later by removing and re-adding the endpoint.</Help>
        </div>
        <div className="wh-events">
          {WEBHOOK_EVENTS.map((ev) => (
            <label key={ev} className="wh-event">
              <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} />
              <div>
                <code className="mono" style={{ fontSize: 12 }}>{ev}</code>
                <div className="wh-event__desc">{EVENT_DESC[ev]}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Endpoint list */}
      {loading ? (
        <div className="smeta">Loading…</div>
      ) : endpoints.length === 0 ? (
        <div className="wh-empty">
          <div className="wh-empty__title">No webhooks yet — here’s how to connect one:</div>
          <ol className="wh-steps">
            <li><span className="n">1</span><div>In your tool, create an incoming webhook and copy its URL (Zapier <em>Catch Hook</em>, n8n <em>Webhook</em> node, Make <em>Custom webhook</em>, or your own endpoint).</div></li>
            <li><span className="n">2</span><div>Pick that tool above, paste the URL, choose your events, and <strong>Add</strong>.</div></li>
            <li><span className="n">3</span><div>Hit <strong>Test</strong> to fire a sample event and confirm it arrives.</div></li>
          </ol>
        </div>
      ) : (
        <div>
          {endpoints.map((ep) => (
            <div key={ep.id} className="wh-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <code className="mono" style={{ wordBreak: 'break-all' }}>{ep.url}</code>
                <span className={`badge ${ep.active ? 'badge--success' : 'badge--muted'}`}>{ep.active ? 'active' : 'paused'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {ep.events.map((ev) => <span key={ev} className="chip">{ev}</span>)}
              </div>
              <div className="smeta" style={{ marginTop: 6 }}>Added {new Date(ep.created_at).toLocaleDateString()}</div>

              <div className="wh-actions">
                <button disabled={busyId === ep.id} onClick={() => act(ep.id, () => pingWebhook(ep.id), 'Test event sent')} className="btn btn--sm btn--ghost">Test</button>
                <button disabled={busyId === ep.id} onClick={() => act(ep.id, () => setWebhookActive(ep.id, !ep.active), ep.active ? 'Paused' : 'Resumed')} className="btn btn--sm btn--ghost">{ep.active ? 'Pause' : 'Resume'}</button>
                <button disabled={busyId === ep.id} onClick={() => onRotate(ep.id)} className="btn btn--sm btn--ghost">Rotate secret</button>
                <button onClick={() => setOpenId(openId === ep.id ? null : ep.id)} className="btn btn--sm btn--ghost">{openId === ep.id ? 'Hide deliveries' : 'Deliveries'}</button>
                <button disabled={busyId === ep.id} onClick={() => onDelete(ep.id)} className="btn btn--sm btn--danger" style={{ marginLeft: 'auto' }}>Delete</button>
              </div>

              {openId === ep.id && <Deliveries endpointId={ep.id} />}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
