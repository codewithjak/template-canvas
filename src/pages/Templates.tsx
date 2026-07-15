/**
 * Templates.tsx — the Templates route (relayout doc T3.4).
 *
 * Renders the SAME components the in-canvas modal renders — `TemplateGallery` and
 * `ProjectList` — so the two surfaces cannot drift. What differs is only what
 * "open" means here: this is a different route, so it navigates to the canvas with
 * a launch intent rather than hydrating anything itself.
 *
 * No thumbnails: those are Phase 2 of the canvas-activation doc, which owns them.
 * No favourites, no search: nothing in the codebase backs either.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BUILTIN_TEMPLATES } from '../templates/registry'
import {
  categoriesOf,
  filterByCategory,
  ALL_CATEGORIES,
  type CategoryFilter,
} from '../templates/filterByCategory'
import TemplateGallery from '../components/TemplateCanvas/library/TemplateGallery'
import ProjectList from '../components/TemplateCanvas/library/ProjectList'
import { toLaunchState } from '../frame/launchIntent'
import './templates.css'

function Templates() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<CategoryFilter>(ALL_CATEGORIES)

  const categories = useMemo(() => categoriesOf(BUILTIN_TEMPLATES), [])
  const shown = useMemo(() => filterByCategory(BUILTIN_TEMPLATES, category), [category])

  return (
    <div className="tpl-page">
      <section className="tpl-section">
        <div className="tpl-section__head">
          <h2 className="tpl-section__title">Start from a template</h2>
          <p className="tpl-section__sub">Opens as a new, editable copy.</p>
        </div>

        <div className="tpl-chips" role="group" aria-label="Filter templates by category">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={`tpl-chip${c === category ? ' tpl-chip--on' : ''}`}
              aria-pressed={c === category}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <TemplateGallery
          templates={shown}
          onOpen={(t) => navigate('/canvas', toLaunchState({ kind: 'open-builtin', builtinId: t.id }))}
        />
      </section>

      <section className="tpl-section">
        <div className="tpl-section__head">
          <h2 className="tpl-section__title">My projects</h2>
        </div>
        <ProjectList
          currentTemplateId={null}
          onOpen={(id) => navigate('/canvas', toLaunchState({ kind: 'open-template', templateId: id }))}
        />
      </section>
    </div>
  )
}

export default Templates
