/**
 * src/account/UsageSection.tsx
 *
 * Settings section: this month's usage against plan limits. Self-fetching — it
 * calls `getUsage()` itself rather than depending on a page-level loader, so it
 * can sit on any route (architecture doc §2.3). Lifted from the Usage card and
 * `UsageBar` of the old one-page Settings.
 */
import { useEffect, useState } from 'react'
import { getUsage, type UsageSummary } from '../services/apiIntegration'
import { SectionCard } from './SectionCard'
import { ICONS } from './sectionIcons'
import './account.css'

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

export default function UsageSection() {
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setUsage(await getUsage())
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
  }, [])

  if (error) return <SectionCard title="Usage" icon={ICONS.usage}><div className="alert--danger">{error}</div></SectionCard>
  if (!usage) return null

  return (
    <SectionCard title={`Usage · ${usage.plan} plan`} icon={ICONS.usage}>
      <UsageBar label="Templates" used={usage.templates.used} limit={usage.templates.limit} />
      <UsageBar label="PDF exports this month" used={usage.exportsThisMonth.used} limit={usage.exportsThisMonth.limit} />
    </SectionCard>
  )
}
