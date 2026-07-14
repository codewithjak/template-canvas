/**
 * EditorPanel.tsx — the editor's right-hand panel: **Insert** and **Data**.
 *
 * WHAT THIS IS NOT. It is not the old Properties panel, and it must never grow into
 * one. Element formatting lives on the floating format bars (`TextFormatBar`,
 * `ElementFormatBar`) with the overflow behind their "⋯" — that is the editing
 * model (relayout doc Amendment 5), and the properties panel was deleted for it
 * (TC-0198). There is deliberately **no Layout/Properties tab here**.
 *
 * What it IS: the two surfaces the bars do not cover.
 *  - Insert — a second door to the add-element handlers the tool rail already calls.
 *    Nothing new; the rail keeps working exactly as it does.
 *  - Data — the bound source and the `{{placeholders}}` this template uses, visible
 *    at a glance instead of only inside a modal.
 *
 * It owns exactly one piece of state: which tab is open. Everything else is props,
 * and every callback it fires already exists on the canvas.
 */
import { useState } from 'react'
import InsertPane, { type InsertActions } from './InsertPane'
import DataPane, { type DataPaneInfo } from './DataPane'
import './panel.css'

type PanelTab = 'insert' | 'data'

const TABS: readonly { id: PanelTab; label: string }[] = [
  { id: 'insert', label: 'Insert' },
  { id: 'data', label: 'Data' },
]

interface Props {
  insert: InsertActions
  data: DataPaneInfo
}

function EditorPanel({ insert, data }: Props) {
  const [tab, setTab] = useState<PanelTab>('insert')

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
      </div>

      <div className="ep-body">
        {tab === 'insert' && <InsertPane actions={insert} />}
        {tab === 'data' && <DataPane info={data} />}
      </div>
    </aside>
  )
}

export default EditorPanel
