/**
 * RecentProjects.tsx — "Jump back in" (app-frame doc T2.3).
 *
 * `listTemplates('document')` already returns rows ordered `updated_at desc`
 * (`templatesRepo.ts:38`), so there is no sorting here and no new query. It
 * returns `{id, name, updated_at}` and nothing else — which is exactly why these
 * cards show a name and a time and NOT a "documents generated" count: we do not
 * have that number anywhere (see UI_UX_GAP_ANALYSIS.md §3.2).
 *
 * A card opens its template through the launch intent: this component does not
 * hydrate anything, the canvas does.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listTemplates, type TemplateSummary } from '../../services/templatesRepo'
import { toLaunchState } from '../../frame/launchIntent'
import { relativeTime } from '../../utils/relativeTime'
import './dashboard.css'

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: readonly TemplateSummary[] }

const RECENT_LIMIT = 6

function RecentProjects() {
  const navigate = useNavigate()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    listTemplates('document')
      .then((items) => {
        if (!cancelled) setLoad({ status: 'ready', items: items.slice(0, RECENT_LIMIT) })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoad({ status: 'error', message: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const open = (id: string) =>
    navigate('/canvas', toLaunchState({ kind: 'open-template', templateId: id }))

  if (load.status === 'loading') {
    return <div className="dash-muted">Loading your templates…</div>
  }

  if (load.status === 'error') {
    return <div className="dash-error">Couldn’t load your templates. {load.message}</div>
  }

  if (load.items.length === 0) {
    return (
      <div className="dash-empty">
        <b>No templates yet</b>
        <p>Create one from scratch, or start from a ready-made design.</p>
        <button type="button" className="dash-empty__cta" onClick={() => navigate('/canvas')}>
          New template
        </button>
      </div>
    )
  }

  return (
    <div className="dash-recent">
      {load.items.map((item) => (
        <button key={item.id} type="button" className="dash-card" onClick={() => open(item.id)}>
          <span className="dash-card__thumb" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2h8l4 4v16H6z" />
              <path d="M14 2v4h4" />
            </svg>
          </span>
          <span className="dash-card__name">{item.name}</span>
          <span className="dash-card__time">Edited {relativeTime(item.updated_at)}</span>
        </button>
      ))}
    </div>
  )
}

export default RecentProjects
