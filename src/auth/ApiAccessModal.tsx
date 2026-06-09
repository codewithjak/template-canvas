/**
 * src/auth/ApiAccessModal.tsx
 * Team API access + usage panel.
 *
 * Lets a team owner issue / rotate / revoke their single inbound API key and
 * see plan usage. The raw key is shown ONCE right after issuing (it is stored
 * only as a hash server-side); afterwards only the prefix is available.
 *
 * Additive component — opened from UserMenu. All data comes from the
 * /v1/* backend endpoints via services/apiIntegration.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  issueApiKey,
  getApiKeyMeta,
  revokeApiKey,
  getUsage,
  type ApiKeyMeta,
  type UsageSummary,
} from '../services/apiIntegration'
import { API_BASE } from '../services/config'

interface Props {
  onClose: () => void
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const over = limit != null && used >= limit
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569', marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color: over ? '#dc2626' : '#0f172a' }}>
          {used}{limit != null ? ` / ${limit}` : ' / ∞'}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: '#eef1f6', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: over ? '#dc2626' : '#2563eb', transition: 'width .2s' }} />
      </div>
    </div>
  )
}

export default function ApiAccessModal({ onClose }: Props) {
  const [meta, setMeta] = useState<ApiKeyMeta | null>(null)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [freshKey, setFreshKey] = useState<string | null>(null) // shown once
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

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleIssue = async () => {
    setBusy(true)
    setError(null)
    try {
      const { apiKey } = await issueApiKey()
      setFreshKey(apiKey)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleRevoke = async () => {
    if (!window.confirm('Revoke this API key? Any system using it will stop working immediately.')) return
    setBusy(true)
    setError(null)
    try {
      await revokeApiKey()
      setFreshKey(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const copyKey = async () => {
    if (!freshKey) return
    try {
      await navigator.clipboard.writeText(freshKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — user can select manually */ }
  }

  const active = meta && !meta.revoked_at
  const ingestUrl = `${API_BASE}/v1/ingest`
  const sampleKey = freshKey || (meta ? `${meta.key_prefix}…` : 'tc_live_…')
  const curl =
    `curl -X POST ${ingestUrl} \\\n` +
    `  -H "X-API-Key: ${sampleKey}" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d '{"templateId":"<your-template-id>","data":{ ... }}'`

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto',
          background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #eef1f6' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>API access</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Push data into your templates from any system.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ padding: 22 }}>
          {loading ? (
            <div style={{ color: '#64748b', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {error && (
                <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '10px 12px', borderRadius: 8, fontSize: 12, marginBottom: 16 }}>{error}</div>
              )}

              {/* Freshly-issued key (shown once) */}
              {freshKey && (
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: 14, marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#065f46', marginBottom: 6 }}>
                    Copy your key now — it won’t be shown again.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <code style={{ flex: 1, fontSize: 12, background: '#fff', border: '1px solid #d1fae5', borderRadius: 6, padding: '8px 10px', wordBreak: 'break-all' }}>{freshKey}</code>
                    <button onClick={copyKey} style={{ border: '1px solid #10b981', background: copied ? '#10b981' : '#fff', color: copied ? '#fff' : '#059669', borderRadius: 6, padding: '0 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}

              {/* Key status + actions */}
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>API KEY</div>
                {active ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <code style={{ fontSize: 13, color: '#0f172a' }}>{meta!.key_prefix}…</code>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                        Created {new Date(meta!.created_at).toLocaleDateString()}
                        {meta!.last_used_at ? ` · last used ${new Date(meta!.last_used_at).toLocaleDateString()}` : ' · never used'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={busy} onClick={handleIssue} style={{ border: '1px solid #cbd5e1', background: '#fff', color: '#334155', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Rotate</button>
                      <button disabled={busy} onClick={handleRevoke} style={{ border: '1px solid #fecaca', background: '#fff', color: '#dc2626', borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>Revoke</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {meta?.revoked_at ? 'Key revoked. Generate a new one to resume access.' : 'No API key yet.'}
                    </div>
                    <button disabled={busy} onClick={handleIssue} style={{ border: 'none', background: '#2563eb', color: '#fff', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer' }}>
                      {busy ? 'Generating…' : 'Generate API key'}
                    </button>
                  </div>
                )}
              </div>

              {/* Usage */}
              {usage && (
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>
                    USAGE · <span style={{ textTransform: 'capitalize' }}>{usage.plan}</span> plan
                  </div>
                  <UsageBar label="Templates" used={usage.templates.used} limit={usage.templates.limit} />
                  <UsageBar label="PDF exports this month" used={usage.exportsThisMonth.used} limit={usage.exportsThisMonth.limit} />
                </div>
              )}

              {/* How to push */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>PUSH DATA</div>
                <pre style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 10, padding: 14, fontSize: 11.5, lineHeight: 1.55, overflowX: 'auto', margin: 0 }}>{curl}</pre>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
                  Find <code>templateId</code> in the template you want to fill. Pushed data is normalized and stored against that template, ready to map and export.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
