/**
 * InsertPane.tsx — the panel's "Insert" tab (relayout doc T4.4).
 *
 * Pure delegation: every button calls an add-element handler that ALREADY exists
 * and is already wired to the tool rail. This adds no element type and no logic —
 * the rail keeps working exactly as it does, and this is a second door to the same
 * handlers, which is what the mockup's panel is.
 */
import type { ReactNode } from 'react'
import { Icons } from '../toolbar/icons'
import './panel.css'

/** Every element the editor can insert, and the handler that inserts it. */
export interface InsertActions {
  onAddText: () => void
  onAddParagraph: () => void
  onAddImage: () => void
  onAddTable: () => void
  onAddBarcode: () => void
  onAddChart: () => void
  onAddDate: () => void
  onAddRadio: () => void
  onAddCheckbox: () => void
  onAddWatermark: () => void
  onAddSignature: () => void
  onAddLine: () => void
  onAddBox: () => void
}

interface Cell {
  label: string
  icon: ReactNode
  run: (a: InsertActions) => void
}

const CONTENT: Cell[] = [
  { label: 'Text', icon: <Icons.Text />, run: (a) => a.onAddText() },
  { label: 'Paragraph', icon: <Icons.Paragraph />, run: (a) => a.onAddParagraph() },
  { label: 'Image', icon: <Icons.Image />, run: (a) => a.onAddImage() },
  { label: 'Line', icon: <Icons.Line />, run: (a) => a.onAddLine() },
]

const DATA_BLOCKS: Cell[] = [
  { label: 'Table', icon: <Icons.Table />, run: (a) => a.onAddTable() },
  { label: 'Barcode', icon: <Icons.Barcode />, run: (a) => a.onAddBarcode() },
  { label: 'Chart', icon: <Icons.Chart />, run: (a) => a.onAddChart() },
  { label: 'Date', icon: <Icons.Date />, run: (a) => a.onAddDate() },
]

const FORM_AND_BRAND: Cell[] = [
  { label: 'Radio', icon: <Icons.Radio />, run: (a) => a.onAddRadio() },
  { label: 'Checkbox', icon: <Icons.Checkbox />, run: (a) => a.onAddCheckbox() },
  { label: 'Signature', icon: <Icons.Signature />, run: (a) => a.onAddSignature() },
  { label: 'Watermark', icon: <Icons.Watermark />, run: (a) => a.onAddWatermark() },
  { label: 'Box', icon: <Icons.Box />, run: (a) => a.onAddBox() },
]

function Group({ title, cells, actions }: { title: string; cells: Cell[]; actions: InsertActions }) {
  return (
    <>
      <div className="ep-section-label">{title}</div>
      <div className="ep-grid">
        {cells.map((cell) => (
          <button
            key={cell.label}
            type="button"
            className="ep-cell"
            onClick={() => cell.run(actions)}
          >
            <span className="ep-cell__icon" aria-hidden="true">{cell.icon}</span>
            <span className="ep-cell__label">{cell.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function InsertPane({ actions }: { actions: InsertActions }) {
  return (
    <div className="ep-pane">
      <Group title="Content" cells={CONTENT} actions={actions} />
      <Group title="Data blocks" cells={DATA_BLOCKS} actions={actions} />
      <Group title="Form &amp; brand" cells={FORM_AND_BRAND} actions={actions} />
    </div>
  )
}

export default InsertPane
