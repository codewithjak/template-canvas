/**
 * seedLayout.ts — activation doc T1.7.
 *
 * When "Start from your data" completes on a pristine canvas, the flow must not
 * leave an empty page (root cause #3). This builds a starter layout from the
 * detected structure: a title text plus a layout table bound to the first
 * collection, its columns matching the detected fields (capped to what fits an
 * A4 width). Pure and unit-testable; reuses the existing element factories, no
 * new inference.
 */
import type { CanvasElement } from '../../types/canvas'
import type { CanonicalDocument } from '../../types/dataSource'
import { createDefaultLayoutTable, makeRow, newStableId } from '../../model/layoutTable'
import { createTextElement } from './elementFactories'

// A4 canvas is 794px; leave ~48px margins each side. A column narrower than
// ~110px is unreadable, so that caps how many detected fields we lay out.
const USABLE_WIDTH = 698
const MIN_COL_WIDTH = 110
const MAX_COLS = Math.max(1, Math.floor(USABLE_WIDTH / MIN_COL_WIDTH))

/** "invoice_lines" / "invoice.no" → "Invoice Lines" / "Invoice No". */
function titleCase(key: string): string {
  return key
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Build [title, boundTable] from the first collection of a parsed document, or
 * [] when there is nothing tabular to lay out (caller then leaves the canvas
 * as-is rather than inserting an empty table).
 */
export function seedStarterLayoutFromStructure(doc: CanonicalDocument): CanvasElement[] {
  const entries = Object.entries(doc.collections ?? {})
  if (entries.length === 0) return []

  const [collectionKey, collection] = entries[0]
  const fields = (collection.columns ?? []).slice(0, MAX_COLS)
  if (fields.length === 0) return []

  const colWidth = Math.floor(USABLE_WIDTH / fields.length)

  // Start from the real factory, then shape it to the detected fields so the
  // element is structurally identical to a hand-built table.
  const table = createDefaultLayoutTable('table')
  table.columns = fields.map(() => ({
    id: newStableId(),
    width: colWidth,
    widthMode: 'fixed' as const,
    alignment: 'left' as const,
  }))
  table.headerRow = makeRow(fields.length, fields.map(titleCase))
  table.rows = [makeRow(fields.length, fields.map((f) => `{{${f}}}`))]
  // Same binding shape builtins use — the renderer resolves the table's own
  // binding.collectionKey, so no separate binding map is needed.
  table.binding = { enabled: true, collectionKey, itemAlias: 'item' }
  table.position = { x: 48, y: 96 }

  const title = createTextElement()
  title.content = titleCase(collectionKey)
  title.position = { x: 48, y: 40 }
  title.style = { ...title.style, fontSize: 24, fontWeight: 'bold', width: USABLE_WIDTH }

  return [title, table]
}
