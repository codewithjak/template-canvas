/**
 * TemplatesLibraryModal.tsx
 * Lists the team's saved templates (from Supabase) and lets the user open
 * or delete one. Shared across the team via RLS — anyone on the team sees
 * the same list.
 *
 * The gallery and the list were EXTRACTED into `library/TemplateGallery` and
 * `library/ProjectList` (relayout doc T3.1–T3.3) so the Templates page renders
 * the SAME components and the two cannot drift. This modal is not replaced: it is
 * still how the canvas opens a template from inside the editor, and its behaviour
 * is unchanged — `onOpen` still fetches the record and hands it to the canvas.
 */
import React from 'react'
import { getTemplate, type TemplateRecord } from '../../services/templatesRepo'
import { BUILTIN_TEMPLATES, type BuiltinTemplate } from '../../templates/registry'
import TemplateGallery from './library/TemplateGallery'
import ProjectList from './library/ProjectList'
import './TemplatesLibraryModal.css'

interface Props {
  /** 'builtin' shows the ready-made Templates; 'projects' shows the user's saved ones. */
  mode: 'builtin' | 'projects'
  currentTemplateId: string | null
  onOpen: (record: TemplateRecord) => void
  onOpenBuiltin: (template: BuiltinTemplate) => void
  onClose: () => void
}

const TemplatesLibraryModal: React.FC<Props> = ({
  mode,
  currentTemplateId,
  onOpen,
  onOpenBuiltin,
  onClose,
}) => {
  // In the modal, "open" means: fetch the record and hand it to the canvas we are
  // already inside. (On the Templates page it means navigate with a launch intent
  // instead — the one thing that differs between the two callers of ProjectList.)
  const openIntoCanvas = async (id: string) => {
    onOpen(await getTemplate(id))
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
              <p className="tlm-section-sub">
                Start from a ready-made design — opens as a new, editable copy.
              </p>
              <TemplateGallery templates={BUILTIN_TEMPLATES} onOpen={onOpenBuiltin} />
            </section>
          )}

          {mode === 'projects' && (
            <ProjectList currentTemplateId={currentTemplateId} onOpen={openIntoCanvas} />
          )}
        </div>
      </div>
    </div>
  )
}

export default TemplatesLibraryModal
