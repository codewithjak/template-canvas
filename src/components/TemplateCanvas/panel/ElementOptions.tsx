/**
 * ElementOptions.tsx — the selected element's advanced properties, in the right panel.
 *
 * This is what used to live behind the "⋯" on the floating format bar (TC-0198). It
 * moves here (TC-0212) because a table's controls — columns, binding, per-cell
 * typography — are dense, and a 300px popover hanging off a floating bar is a bad
 * place to put them. The panel is a column with room and a scrollbar.
 *
 * WHAT THIS IS NOT: it is still not a properties panel. The everyday formatting —
 * size, colour, fill, border, font — stays on the floating bars, where it is one click
 * from the element (relayout doc Amendment 5). Only the OVERFLOW comes here: the
 * controls that never fitted on a bar in the first place.
 *
 * Renders nothing at all unless the selected element actually has overflow controls,
 * so an image or a box shows no empty section.
 */
import { isLayoutTable, type LayoutTableElement } from '../../../model/layoutTable'
import type { FooterConfig } from '../../../types/canvas'
import type { CanvasElement, UpdateElement } from '../properties/elementTypes'
import { resolveActiveCell } from '../properties/layoutTableCellHelpers'
import LayoutTableProperties from '../properties/LayoutTableProperties'
import LayoutTableTypography from '../properties/LayoutTableTypography'
import ChartProperties from '../properties/ChartProperties'
import PageNumberProperties from '../PageNumberProperties'
import '../PropertiesPanel.css'
import './panel.css'

export interface ElementOptionsProps {
  selectedElement: CanvasElement | null
  onUpdate: UpdateElement
  layoutTableActiveCell: { tableId: string; rowIndex: number; colIndex: number } | null
  layoutTableRange: { tableId: string; r0: number; c0: number; r1: number; c1: number } | null
  activePageFooter: FooterConfig | null
}

/**
 * Which elements have overflow controls at all. The same three the "⋯" served, and the
 * same three the deleted Properties panel was gated to — table, chart, page-number
 * text. Everything else is fully served by its floating bar.
 */
function optionsTitle(el: CanvasElement | null, showPageNumber: boolean): string | null {
  if (!el) return null
  if (isLayoutTable(el)) return 'Table options'
  if (el.type === 'chart') return 'Chart options'
  if (el.type === 'text' && showPageNumber) return 'Page number'
  return null
}

function ElementOptions({
  selectedElement,
  onUpdate,
  layoutTableActiveCell,
  layoutTableRange,
  activePageFooter,
}: ElementOptionsProps) {
  const el = selectedElement

  // Same rule the panel used before it was deleted: a text element that IS a page
  // number, or one sitting below the footer boundary, can be turned into one.
  const showPageNumber =
    !!el &&
    el.type === 'text' &&
    (!!el.pageNumber?.enabled ||
      (activePageFooter?.enabled === true &&
        (el.position?.y ?? 0) >= (activePageFooter?.boundaryY ?? Infinity)))

  const title = optionsTitle(el, showPageNumber)
  if (!el || !title) return null

  const isTable = isLayoutTable(el)
  const { rc: activeRC, cell: activeCell } = isTable
    ? resolveActiveCell(el as LayoutTableElement, layoutTableActiveCell)
    : { rc: null, cell: null }

  return (
    <section className="ep-options">
      <div className="ep-section-label">{title}</div>

      {isTable && (
        <>
          <LayoutTableProperties
            element={el as LayoutTableElement}
            onUpdate={onUpdate}
            layoutTableRange={layoutTableRange}
            activeRC={activeRC}
            activeCell={activeCell}
          />
          <LayoutTableTypography
            element={el as LayoutTableElement}
            onUpdate={onUpdate}
            activeRC={activeRC}
            activeCell={activeCell}
          />
        </>
      )}

      {el.type === 'chart' && <ChartProperties element={el} onUpdate={onUpdate} />}

      {el.type === 'text' && showPageNumber && (
        <PageNumberProperties
          config={el.pageNumber}
          onChange={(pn) => onUpdate(el.id, { pageNumber: pn })}
        />
      )}

      {/* Numeric X/Y is no longer here: it moved onto the floating format bars, so
          every element can set it (not just the three that open this panel). See
          docs/POSITION_ON_FORMAT_BAR_ARCHITECTURE.md §2.3. */}
    </section>
  )
}

export default ElementOptions
