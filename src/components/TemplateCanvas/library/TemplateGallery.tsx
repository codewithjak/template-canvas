/**
 * TemplateGallery.tsx — the grid of ready-made (built-in) templates.
 *
 * EXTRACTED from `TemplatesLibraryModal` (relayout doc T3.1) so the modal and the
 * Templates page render the SAME tiles from the same component and cannot drift.
 * The modal is not replaced — it still renders this (T3.3).
 *
 * Purely presentational: it takes an already-filtered list and a callback. It does
 * not know about categories, chips, routes or the canvas.
 */
import type { BuiltinTemplate } from '../../../templates/registry'
import '../TemplatesLibraryModal.css'

interface Props {
  templates: readonly BuiltinTemplate[]
  onOpen: (template: BuiltinTemplate) => void
}

function TemplateGallery({ templates, onOpen }: Props) {
  if (templates.length === 0) {
    return <p className="tlm-msg">No templates in this category.</p>
  }

  return (
    <div className="tlm-gallery">
      {templates.map((t) => (
        <button key={t.id} type="button" className="tlm-tile" onClick={() => onOpen(t)}>
          <span className="tlm-tile-size">{t.sizeLabel}</span>
          <span className="tlm-tile-name">{t.name}</span>
          <span className="tlm-tile-desc">{t.description}</span>
          <span className="tlm-tile-cat">{t.category}</span>
        </button>
      ))}
    </div>
  )
}

export default TemplateGallery
