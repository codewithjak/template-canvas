/**
 * DataPane.tsx — the panel's "Data" tab (relayout doc T4.5).
 *
 * Re-houses what the editor already knows about the bound dataset: the source, the
 * detected collections, and the `{{placeholders}}` the template uses. It opens the
 * EXISTING upload panel and data-structure viewer; it does not fetch, parse or bind
 * anything itself.
 *
 * Deliberately NOT here (the mockup shows both, we have neither): hover-a-field-to-
 * locate-it-on-the-page, and drag-a-field-to-bind. Those are new behaviour.
 */
import { Icons } from '../toolbar/icons'
import './panel.css'

export interface DataPaneInfo {
  /** True once a dataset is mapped (the canvas's `ir`). */
  hasData: boolean
  fileName?: string
  fieldCount?: number
  rowCount?: number
  /** `{{tokens}}` used by the template's static (non-table) elements. */
  placeholders: readonly string[]
  onUploadData: () => void
  onViewStructure: () => void
}

function DataPane({ info }: { info: DataPaneInfo }) {
  if (!info.hasData) {
    return (
      <div className="ep-pane">
        <div className="ep-empty">
          <p className="ep-empty__text">
            No data bound yet. Upload a spreadsheet or JSON file and the template's
            <code> {'{{placeholders}}'} </code> will fill from it.
          </p>
          <button type="button" className="ep-primary" onClick={info.onUploadData}>
            Upload data
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ep-pane">
      <div className="ep-source">
        <span className="ep-source__icon" aria-hidden="true"><Icons.Structure /></span>
        <span className="ep-source__text">
          <b>{info.fileName ?? 'Bound dataset'}</b>
          <small>
            {info.fieldCount ?? 0} fields
            {info.rowCount != null && ` · ${info.rowCount} rows`}
          </small>
        </span>
        <button type="button" className="ep-source__change" onClick={info.onUploadData}>
          Change
        </button>
      </div>

      <div className="ep-section-label">Fields in this template</div>
      {info.placeholders.length === 0 ? (
        <p className="ep-hint">
          This template has no <code>{'{{placeholders}}'}</code> yet. Add one to a text
          element and it will appear here.
        </p>
      ) : (
        <ul className="ep-fields">
          {info.placeholders.map((p) => (
            <li key={p} className="ep-field">
              <span className="ep-field__dot" aria-hidden="true" />
              <code>{p}</code>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="ep-secondary" onClick={info.onViewStructure}>
        View full data structure
      </button>
    </div>
  )
}

export default DataPane
