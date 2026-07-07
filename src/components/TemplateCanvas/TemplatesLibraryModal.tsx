/**
 * TemplatesLibraryModal.tsx
 * Lists the team's saved templates (from Supabase) and lets the user open
 * or delete one. Shared across the team via RLS — anyone on the team sees
 * the same list.
 */
import React, { useEffect, useState } from 'react'
import {
  listTemplates,
  getTemplate,
  deleteTemplate,
  type TemplateSummary,
  type TemplateRecord,
} from '../../services/templatesRepo'
import { BUILTIN_TEMPLATES, type BuiltinTemplate } from '../../templates/registry'
import { confirm } from '../../notify'
import './TemplatesLibraryModal.css'

interface Props {
  /** 'builtin' shows the ready-made Templates; 'projects' shows the user's saved ones. */
  mode: 'builtin' | 'projects'
  currentTemplateId: string | null
  onOpen: (record: TemplateRecord) => void
  onOpenBuiltin: (template: BuiltinTemplate) => void
  onClose: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}

const TemplatesLibraryModal: React.FC<Props> = ({ mode, currentTemplateId, onOpen, onOpenBuiltin, onClose }) => {
  const [items, setItems] = useState<TemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listTemplates())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Only the Projects view needs the user's saved templates from Supabase.
    if (mode === 'projects') void refresh()
    else setLoading(false)
  }, [mode])

  const handleOpen = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      onOpen(await getTemplate(id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open template.')
      setBusyId(null)
    }
  }

  // The row's id is the template's API `templateId` (POST /v1/generate). Copying
  // it here is the only in-app way to get that value for integrations.
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

  return (
    <div className="tlm-backdrop" onClick={onClose}>
      <div className="tlm-card" onClick={(e) => e.stopPropagation()}>
        <div className="tlm-header">
          <h2 className="tlm-title">{mode === 'builtin' ? 'Templates' : 'My projects'}</h2>
          <button className="tlm-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="tlm-body">
        {mode === 'builtin' && (
        <section className="tlm-section">
          <p className="tlm-section-sub">Start from a ready-made design — opens as a new, editable copy.</p>
          <div className="tlm-gallery">
            {BUILTIN_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tlm-tile"
                onClick={() => onOpenBuiltin(t)}
              >
                <span className="tlm-tile-size">{t.sizeLabel}</span>
                <span className="tlm-tile-name">{t.name}</span>
                <span className="tlm-tile-desc">{t.description}</span>
                <span className="tlm-tile-cat">{t.category}</span>
              </button>
            ))}
          </div>
        </section>
        )}

        {mode === 'projects' && <>
        {loading && <p className="tlm-msg">Loading…</p>}
        {error && <p className="tlm-msg tlm-msg--error">{error}</p>}

        {!loading && !error && items.length === 0 && (
          <p className="tlm-msg">No saved projects yet. Use Save to create one.</p>
        )}

        {!loading && !error && items.length > 0 && (
          <ul className="tlm-list">
            {items.map((item) => (
              <li
                key={item.id}
                className={
                  'tlm-row' + (item.id === currentTemplateId ? ' tlm-row--current' : '')
                }
                onClick={() => handleOpen(item.id)}
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
        )}
        </>}
        </div>
      </div>
    </div>
  )
}

export default TemplatesLibraryModal
