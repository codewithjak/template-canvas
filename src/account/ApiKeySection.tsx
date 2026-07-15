/**
 * src/account/ApiKeySection.tsx
 *
 * Integrations section for the team API key: issue, rotate, revoke. Gated on the
 * `api` capability — without it, the existing upsell shows instead. The key state
 * is owned by `useApiKey` and passed in, so the Quickstart snippet on the same
 * page reads the same key (architecture doc §2.3). Lifted from the API access card
 * of the old one-page Settings.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlan } from '../plan/PlanProvider'
import { minPlanFor } from '../config/plans'
import { SectionCard } from './SectionCard'
import { ICONS } from './sectionIcons'
import type { ApiKeyState } from './useApiKey'
import './account.css'

export default function ApiKeySection({ api }: { api: ApiKeyState }) {
  const navigate = useNavigate()
  const { can } = usePlan()
  const [copied, setCopied] = useState(false)
  const { meta, freshKey, busy, error } = api

  const copyKey = async () => {
    if (!freshKey) return
    try {
      await navigator.clipboard.writeText(freshKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — select manually */ }
  }

  const active = meta && !meta.revoked_at

  return (
    <SectionCard id="api" title="API access" subtitle="Push data into your templates from any system using a team API key." icon={ICONS.key}>
      {error && <div className="alert--danger">{error}</div>}
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
                <button disabled={busy} onClick={() => void api.issue()} className="btn btn--ghost">Rotate</button>
                <button disabled={busy} onClick={() => void api.revoke()} className="btn btn--danger">Revoke</button>
              </div>
            </div>
          ) : (
            <div className="srow">
              <div style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{meta?.revoked_at ? 'Key revoked. Generate a new one to resume access.' : 'No API key yet.'}</div>
              <button disabled={busy} onClick={() => void api.issue()} className="btn btn--primary btn--sm">{busy ? 'Generating…' : 'Generate API key'}</button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}
