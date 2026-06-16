/**
 * PropertiesPanel.tsx
 *
 * The panel on the right that shows the settings for whatever element is
 * selected on the canvas. It is mostly a "reader": it looks at the selected
 * element and shows the matching little boxes (sections). Each box lives in
 * its own file inside the ./properties folder, so this file stays short.
 *
 * The order of the boxes below is the order they appear on screen.
 */

import './PropertiesPanel.css';
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
}

function PropertiesPanel({
  selectedElement,
  onUpdate,
  layoutTableActiveCell,
  layoutTableRange,
  activePageFooter,
  staticPlaceholders = [],
}: PropertiesPanelProps) {
  // Nothing selected: show the empty panel.
  if (!selectedElement) {
    return (
      <div className="properties-panel">
        <div className="properties-panel-header">Properties</div>
        <div className="properties-panel-empty">No element selected</div>
      </div>
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
    <div className="properties-panel">
      <div className="properties-panel-header">
        Properties
        <span className="panel-type-label">{panelTypeLabel}</span>
      </div>
      <div className="properties-panel-content">
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
      </div>
    </div>
  );
}

export default PropertiesPanel;
