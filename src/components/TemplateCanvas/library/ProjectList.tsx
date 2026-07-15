/**
 * ProjectList.tsx — the team's saved templates ("My projects").
 *
 * EXTRACTED from `TemplatesLibraryModal` (relayout doc T3.2) so the modal and the
 * Templates page render the same list from the same component. The modal still
 * renders this (T3.3); its behaviour is unchanged.
 *
 * It owns the things a list must own — fetching, loading/error state, delete,
 * copy-id, per-row busy — but NOT what "open" means. That is the one difference
 * between the two callers:
 *
 *   - the modal opens INTO the canvas it already lives in, so its `onOpen` fetches
 *     the record and hands it to the canvas;
 *   - the Templates page is a different route, so its `onOpen` navigates to the
 *     canvas with a launch intent.
 *
 * Hence `onOpen(id)` may be async: this component awaits it and shows the row busy
 * meanwhile, which covers both without knowing which is which.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  listTemplates,
  deleteTemplate,
  type TemplateSummary,
} from '../../../services/templatesRepo'
import { confirm } from '../../../notify'
import '../TemplatesLibraryModal.css'

interface Props {
  currentTemplateId: string | null
  onOpen: (id: string) => void | Promise<void>
  /** Shown when the team has no saved templates. */
  emptyMessage?: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function ProjectList({ currentTemplateId, onOpen, emptyMessage }: Props) {
  const [items, setItems] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listTemplates())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleOpen = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      await onOpen(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open template.')
      setBusyId(null)
    }
  }

  // The row's id is the template's API `templateId` (POST /v1/generate). Copying it
  // here is the only in-app way to get that value for integrations.
  const handleCopyId = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(id)
      setCopiedId(id)
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500)
    } catch {
      /* clipboard blocked — the id is still shown for manual selection */
    }
  }

  const handleDelete = async (e: React.MouseEvent, item: TemplateSummary) => {
    e.stopPropagation()
    if (!(await confirm({ message: { key: 'templates.deleteConfirm', vars: { name: item.name } }, danger: true }))) return
    setBusyId(item.id)
    try {
      await deleteTemplate(item.id)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <p className="tlm-msg">Loading…</p>
  if (error) return <p className="tlm-msg tlm-msg--error">{error}</p>
  if (items.length === 0) {
    return <p className="tlm-msg">{emptyMessage ?? 'No saved projects yet. Use Save to create one.'}</p>
  }

  return (
    <ul className="tlm-list">
      {items.map((item) => (
        <li
          key={item.id}
          className={'tlm-row' + (item.id === currentTemplateId ? ' tlm-row--current' : '')}
          onClick={() => void handleOpen(item.id)}
        >
          <div className="tlm-row-main">
            <span className="tlm-name">{item.name}</span>
            <span className="tlm-date">Updated {formatDate(item.updated_at)}</span>
            <button
              type="button"
              className="tlm-id"
              title="Copy template ID — use as templateId for the API / n8n integrations"
              onClick={(e) => void handleCopyId(e, item.id)}
            >
              <span className="tlm-id-label">ID</span>
              <code className="tlm-id-value">{item.id.slice(0, 8)}…</code>
              <span className="tlm-id-action">{copiedId === item.id ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <div className="tlm-row-actions">
            <button
              className="tlm-open"
              disabled={busyId === item.id}
              onClick={(e) => {
                e.stopPropagation()
                void handleOpen(item.id)
              }}
            >
              {busyId === item.id ? '…' : 'Open'}
            </button>
            <button
              className="tlm-delete"
              disabled={busyId === item.id}
              onClick={(e) => void handleDelete(e, item)}
              aria-label={`Delete ${item.name}`}
            >
              🗑
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

export default ProjectList
