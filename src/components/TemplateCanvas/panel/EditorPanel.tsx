/**
 * EditorPanel.tsx — the editor's right-hand panel: **Edit** and **Data**.
 *
 * WHAT THIS IS NOT. It is not the old Properties panel, and it must never grow into
 * one. Element formatting lives on the floating format bars (`TextFormatBar`,
 * `ElementFormatBar`) with the overflow behind their "⋯" — that is the editing
 * model (relayout doc Amendment 5), and the properties panel was deleted for it
 * (TC-0198). There is deliberately **no Layout/Properties tab here**.
 *
 * What it IS: the two surfaces the bars do not cover.
 *  - Edit — element-contextual tools that need more room than a bar (image
 *    crop-to-shape; see IMAGE_CROP_ARCHITECTURE.md). This REPLACED an "Insert" tab
 *    that only duplicated the left tool rail's add-element buttons.
 *  - Data — the bound source and the `{{placeholders}}` this template uses, visible
 *    at a glance instead of only inside a modal.
 *
 * It owns exactly one piece of state: which tab is open. Everything else is props,
 * and every callback it fires already exists on the canvas.
 */
import { useState } from 'react'
import EditPane from './EditPane'
import DataPane, { type DataPaneInfo } from './DataPane'
import ElementOptions, { type ElementOptionsProps } from './ElementOptions'
import './panel.css'

type PanelTab = 'edit' | 'data'

const TABS: readonly { id: PanelTab; label: string }[] = [
  { id: 'edit', label: 'Edit' },
  { id: 'data', label: 'Data' },
]

interface Props {
  data: DataPaneInfo
  /**
   * The selected element's advanced controls — what used to hang off the "⋯" on the
   * floating bar. They sit BELOW the tab content, so they are always in view for the
   * element you have selected, whichever tab is open. Renders nothing for an element
   * that has no overflow controls.
   */
  options: ElementOptionsProps
  /**
   * Collapse is owned by the CANVAS, not by this panel. The width has to be stamped
   * on `--frame-panel-w`, and that var must live on an ancestor of the floating
   * format bars (which are `position: fixed` and centre on the stage by subtracting
   * the chrome). The panel cannot reach them; the container can.
   */
  collapsed: boolean
  onToggleCollapsed: () => void
}

function EditorPanel({ data, options, collapsed, onToggleCollapsed }: Props) {
  const [tab, setTab] = useState<PanelTab>('edit')

  const Toggle = (
    <button
      type="button"
      className="ep-collapse"
      onClick={onToggleCollapsed}
      title={collapsed ? 'Show Edit and Data' : 'Hide panel'}
      aria-label={collapsed ? 'Show Edit and Data' : 'Hide panel'}
      aria-expanded={!collapsed}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
        <path d={collapsed ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )

  if (collapsed) {
    // A thin strip, not nothing: a panel that vanishes with no way back is a panel
    // the user has lost.
    return (
      <aside className="editor-panel editor-panel--collapsed">{Toggle}</aside>
    )
  }

  return (
    <aside className="editor-panel">
      <div className="ep-tabs" role="tablist" aria-label="Editor panel">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ep-tab${tab === id ? ' ep-tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
        {Toggle}
      </div>

      <div className="ep-body">
        {tab === 'edit' && <EditPane selectedElement={options.selectedElement} onUpdate={options.onUpdate} />}
        {tab === 'data' && <DataPane info={data} />}

        {/* Below the tab's controls, not inside them: this is about the SELECTED
            element, not about the tab you happen to be on. */}
        <ElementOptions {...options} />
      </div>
    </aside>
  )
}

export default EditorPanel
