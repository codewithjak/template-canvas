/**
 * PropertiesPanel.tsx — the editor's right-hand panel (relayout doc T4.3).
 *
 * REBUILT (not replaced) into the three-tab panel: Insert · Data · Layout. It was
 * already the 300px right-hand panel and already rendered every element type; what
 * it lacked was the tab shell, the Insert and Data panes, and z-order/duplicate/
 * delete. Building a second panel alongside it would have left two in the tree,
 * so this file grew the tabs instead.
 *
 * LAYOUT is still the same "reader" it always was: it looks at the selected element
 * and shows the matching boxes, each in its own file under ./properties. The order
 * of the boxes below is the order they appear on screen. Nothing about that changed.
 *
 * It owns exactly one piece of state: which tab is open. Everything else is props.
 */

import { useState } from 'react';
import './PropertiesPanel.css';
import './panel/panel.css';
import InsertPane, { type InsertActions } from './panel/InsertPane';
import DataPane, { type DataPaneInfo } from './panel/DataPane';
import ArrangeSection, { type ArrangeActions } from './panel/ArrangeSection';
import { isLayoutTable } from '../../model/layoutTable';
import type { FooterConfig } from '../../types/canvas';
import PageNumberProperties from './PageNumberProperties';

import type { CanvasElement } from './properties/elementTypes';
import { resolveActiveCell } from './properties/layoutTableCellHelpers';
import TextContentProperties from './properties/TextContentProperties';
import ImageProperties from './properties/ImageProperties';
import LineProperties from './properties/LineProperties';
import BoxProperties from './properties/BoxProperties';
import LayoutTableProperties from './properties/LayoutTableProperties';
import RadioCheckboxProperties from './properties/RadioCheckboxProperties';
import TypographyProperties from './properties/TypographyProperties';
import LayoutTableTypography from './properties/LayoutTableTypography';
import PositionProperties from './properties/PositionProperties';
import DateProperties from './properties/DateProperties';
import DateTypography from './properties/DateTypography';
import BarcodeProperties from './properties/BarcodeProperties';
import ChartProperties from './properties/ChartProperties';

interface PropertiesPanelProps {
  selectedElement: CanvasElement | null;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
  layoutTableActiveCell: { tableId: string; rowIndex: number; colIndex: number } | null;
  layoutTableRange: { tableId: string; r0: number; c0: number; r1: number; c1: number } | null;
  activePageFooter?: FooterConfig | null;
  staticPlaceholders?: string[];
  /** Insert tab: the canvas's existing add-element handlers. */
  insert: InsertActions;
  /** Data tab: what the canvas already knows about the bound dataset. */
  data: DataPaneInfo;
  /** Layout tab → Arrange: null when nothing is selected. */
  arrange: ArrangeActions | null;
}

type PanelTab = 'insert' | 'data' | 'layout';

const TABS: readonly { id: PanelTab; label: string }[] = [
  { id: 'insert', label: 'Insert' },
  { id: 'data', label: 'Data' },
  { id: 'layout', label: 'Layout' },
];

function PropertiesPanel(props: PropertiesPanelProps) {
  // Layout is the default: selecting an element is the overwhelmingly common
  // reason to look at this panel, and it is what the panel did before the tabs.
  const [tab, setTab] = useState<PanelTab>('layout');

  return (
    <div className="properties-panel">
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

      <div className="properties-panel-content">
        {tab === 'insert' && <InsertPane actions={props.insert} />}
        {tab === 'data' && <DataPane info={props.data} />}
        {tab === 'layout' && <LayoutTab {...props} />}
      </div>
    </div>
  );
}

/**
 * The Layout tab — the panel's original job, unchanged: read the selected element
 * and show the matching boxes. `Arrange` is appended at the end; it is the only
 * section that is new (it re-houses the floating quick bar).
 */
function LayoutTab({
  selectedElement,
  onUpdate,
  layoutTableActiveCell,
  layoutTableRange,
  activePageFooter,
  staticPlaceholders = [],
  arrange,
}: PropertiesPanelProps) {
  // Nothing selected: show the empty state.
  if (!selectedElement) {
    return (
      <>
        <div className="properties-panel-empty">
          <div className="properties-panel-empty__icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M6 3l13 8-5.5 1.5L11 18 6 3z" stroke="currentColor"
                strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="properties-panel-empty__title">Nothing selected</div>
          <p className="properties-panel-empty__text">
            Select an element on the canvas to edit it, or add one from the tool rail.
          </p>
        </div>
      </>
    );
  }

  // If a table is selected, work out which cell (if any) the user clicked.
  const { rc: activeRC, cell: activeCell } = isLayoutTable(selectedElement)
    ? resolveActiveCell(selectedElement, layoutTableActiveCell)
    : { rc: null, cell: null };

  // Show the page-number box for a text element that is a page number, or one
  // sitting inside the footer zone of the page.
  const isPageNumberElement =
    selectedElement.type === 'text' && !!selectedElement.pageNumber?.enabled;
  const isInFooterZone =
    selectedElement.type === 'text' &&
    activePageFooter?.enabled === true &&
    (selectedElement.position?.y ?? 0) >= (activePageFooter?.boundaryY ?? Infinity);
  const showPageNumberProperties = isPageNumberElement || isInFooterZone;

  // The little grey label next to the word "Properties" in the header.
  const panelTypeLabel =
    selectedElement.type === 'text' && selectedElement.role === 'watermark'
      ? 'watermark'
      : selectedElement.type === 'image' && selectedElement.role === 'signature'
      ? 'signature'
      : selectedElement.type;

  return (
    <>
      <div className="ep-selected">
        Selected
        <span className="panel-type-label">{panelTypeLabel}</span>
      </div>

      {/* The main box: depends on what kind of element is selected. */}
        {selectedElement.type === 'text' ? (
          <TextContentProperties element={selectedElement} onUpdate={onUpdate} />
        ) : selectedElement.type === 'image' ? (
          <ImageProperties element={selectedElement} onUpdate={onUpdate} />
        ) : selectedElement.type === 'line' ? (
          <LineProperties element={selectedElement} onUpdate={onUpdate} />
        ) : selectedElement.type === 'box' ? (
          <BoxProperties element={selectedElement} onUpdate={onUpdate} />
        ) : selectedElement.type === 'table' && isLayoutTable(selectedElement) ? (
          <LayoutTableProperties
            element={selectedElement}
            onUpdate={onUpdate}
            layoutTableRange={layoutTableRange}
            activeRC={activeRC}
            activeCell={activeCell}
          />
        ) : null}

        {/* Radio / checkbox layout options. */}
        {(selectedElement.type === 'radio' || selectedElement.type === 'checkbox') && (
          <RadioCheckboxProperties element={selectedElement} onUpdate={onUpdate} />
        )}

        {/* Font settings for text and paragraphs. */}
        {(selectedElement.type === 'text' || selectedElement.type === 'paragraph') && (
          <TypographyProperties element={selectedElement} onUpdate={onUpdate} />
        )}

        {/* Page number settings — only for text in the footer zone. */}
        {selectedElement.type === 'text' && showPageNumberProperties && (
          <PageNumberProperties
            config={selectedElement.pageNumber}
            onChange={(pnConfig) => onUpdate(selectedElement.id, { pageNumber: pnConfig })}
          />
        )}

        {/* Font settings for tables (defaults or the selected cell). */}
        {isLayoutTable(selectedElement) && (
          <LayoutTableTypography
            element={selectedElement}
            onUpdate={onUpdate}
            activeRC={activeRC}
            activeCell={activeCell}
          />
        )}

        {/* Position box — shown for every element. */}
        <PositionProperties element={selectedElement} onUpdate={onUpdate} />

        {/* Date value and format. */}
        {selectedElement.type === 'date' && (
          <DateProperties element={selectedElement} onUpdate={onUpdate} />
        )}

        {/* Barcode settings. */}
        {selectedElement.type === 'barcode' && (
          <BarcodeProperties
            element={selectedElement}
            onUpdate={onUpdate}
            staticPlaceholders={staticPlaceholders}
          />
        )}

        {/* Chart settings. */}
        {selectedElement.type === 'chart' && (
          <ChartProperties element={selectedElement} onUpdate={onUpdate} />
        )}

      {/* Font settings for a date element. */}
      {selectedElement.type === 'date' && (
        <DateTypography element={selectedElement} onUpdate={onUpdate} />
      )}

      {/* Z-order, duplicate, delete — the one thing the floating quick bar had
          that this panel never did. The quick bar is retired only once this is
          verified (T4.10), not before. */}
      {arrange && <ArrangeSection actions={arrange} />}
    </>
  );
}

export default PropertiesPanel;
