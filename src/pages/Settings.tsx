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
  type ApiKeyMeta,
  type UsageSummary,
} from '../services/apiIntegration'
import { API_BASE } from '../services/config'

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

export default function Settings() {
  const navigate = useNavigate()
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
    if (!window.confirm('Revoke this API key? Any system using it will stop working immediately.')) return
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

            <Card title="API access" subtitle="Push data into your templates from any system using a team API key.">
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
            </Card>

            {usage && (
              <Card title={`Usage · ${usage.plan} plan`}>
                <UsageBar label="Templates" used={usage.templates.used} limit={usage.templates.limit} />
                <UsageBar label="PDF exports this month" used={usage.exportsThisMonth.used} limit={usage.exportsThisMonth.limit} />
              </Card>
            )}

            <Card title="Push data" subtitle="Send JSON to a template; it’s normalized and stored, ready to map and export.">
              <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 10, padding: 16, fontSize: 12, lineHeight: 1.6, overflowX: 'auto', margin: 0 }}>{curl}</pre>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
                Find <code>templateId</code> in the template you want to fill.
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
