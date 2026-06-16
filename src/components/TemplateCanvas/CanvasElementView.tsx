/**
 * CanvasElementView.tsx
 *
 * Draws ONE element on the page. It looks at the element's "type" and renders
 * the matching element component (text, image, table, chart, …). TemplateCanvas
 * shows a whole page by mapping its elements through this one component, so the
 * big "what should I draw?" decision lives here instead of in the container.
 *
 * This component only draws and reports clicks/edits back up through callbacks;
 * it holds no state of its own.
 */

import type { Dispatch, SetStateAction } from 'react';

import TextElement from './TextElement';
import ImageElement from './ImageElement';
import LineElement from './LineElement';
import BoxElement from './BoxElement';
import ParagraphElement from './ParagraphElement';
import RadioElement from './RadioElement';
import CheckboxElement from './CheckboxElement';
import DateElement from './DateElement';
import LayoutTableElement from './LayoutTableElement';
import BarcodeElement from './BarcodeElement';
import ChartElement from './ChartElement';

import type { BarcodeElementType, CanvasElement, ChartElementType } from '../../types/canvas';
import type { LayoutTableElement as LayoutTableModel } from '../../model/layoutTable';
import { isLayoutTable } from '../../model/layoutTable';
import { pageNumberPreviewLabel } from './templateCanvasHelpers';

/** Which single cell inside a table is active, if any. */
type CellSelection = { tableId: string; rowIndex: number; colIndex: number } | null;
/** The rectangle of selected cells inside a table, if any. */
type RangeSelection = { tableId: string; r0: number; c0: number; r1: number; c1: number } | null;

interface Props {
  element: CanvasElement;
  pageId: string;
  selectedElementId: string | null;
  onUpdateElement: (id: string, updates: any) => void;
  onSelectElement: (id: string, pageId: string) => void;
  layoutTableCellSelection: CellSelection;
  layoutTableRange: RangeSelection;
  setLayoutTableCellSelection: Dispatch<SetStateAction<CellSelection>>;
  setLayoutTableRange: Dispatch<SetStateAction<RangeSelection>>;
}

function CanvasElementView({
  element,
  pageId,
  selectedElementId,
  onUpdateElement,
  onSelectElement,
  layoutTableCellSelection,
  layoutTableRange,
  setLayoutTableCellSelection,
  setLayoutTableRange,
}: Props) {
  const isSelected = element.id === selectedElementId;
  const select = () => onSelectElement(element.id, pageId);

  // Small wrappers so each element component gets the exact callback it expects.
  const updateText = (id: string, content: string) => onUpdateElement(id, { content });
  const updateImage = (id: string, src: string) => onUpdateElement(id, { src });

  if (element.type === 'text') {
    const displayContent = element.pageNumber?.enabled
      ? pageNumberPreviewLabel(element)
      : element.content;
    return (
      <TextElement
        id={element.id} content={displayContent}
        position={element.position} style={element.style}
        onUpdate={updateText} isSelected={isSelected} onSelect={select}
        onResize={(id, fontSize) =>
          onUpdateElement(id, { style: { ...element.style, fontSize } })
        }
      />
    );
  }

  if (element.type === 'paragraph') return (
    <ParagraphElement
      id={element.id} content={element.content}
      position={element.position} style={element.style}
      onUpdate={updateText} isSelected={isSelected} onSelect={select}
    />
  );

  if (element.type === 'radio') return (
    <RadioElement
      id={element.id} options={element.options}
      selected={element.selected} orientation={element.orientation as any}
      position={element.position}
      onSelect={(id, opt) => onUpdateElement(id, { selected: opt })}
      onUpdate={onUpdateElement} onElementSelect={select}
    />
  );

  if (element.type === 'checkbox') return (
    <CheckboxElement
      id={element.id} count={element.count}
      checkedValues={element.checkedValues} orientation={element.orientation as any}
      position={element.position}
      onUpdate={onUpdateElement} onElementSelect={select}
    />
  );

  if (element.type === 'table' && isLayoutTable(element)) {
    const tableEl = element as LayoutTableModel;
    return (
      <LayoutTableElement
        element={tableEl}
        isSelected={tableEl.id === selectedElementId}
        onTableChromeSelect={() => {
          onSelectElement(tableEl.id, pageId);
          setLayoutTableCellSelection(null);
          setLayoutTableRange(prev => prev?.tableId === tableEl.id ? null : prev);
        }}
        onUpdate={onUpdateElement}
        activeCell={
          layoutTableCellSelection?.tableId === tableEl.id
            ? { rowIndex: layoutTableCellSelection.rowIndex, colIndex: layoutTableCellSelection.colIndex }
            : null
        }
        selectionRange={
          layoutTableRange?.tableId === tableEl.id
            ? { r0: layoutTableRange.r0, c0: layoutTableRange.c0, r1: layoutTableRange.r1, c1: layoutTableRange.c1 }
            : null
        }
        onSelectionRangeChange={(tableId, range) => {
          if (range) setLayoutTableRange({ tableId, ...range });
          else setLayoutTableRange(prev => prev?.tableId === tableId ? null : prev);
        }}
        onCellSelect={(tableId, rowIndex, colIndex) => {
          onSelectElement(tableId, pageId);
          setLayoutTableCellSelection({ tableId, rowIndex, colIndex });
        }}
      />
    );
  }

  if (element.type === 'image') return (
    <ImageElement
      id={element.id} src={element.src}
      position={element.position} style={element.style}
      onUpdate={updateImage}
      onUpdateStyle={(id, s) => onUpdateElement(id, { style: { ...element.style, ...s } })}
      isSelected={isSelected} onSelect={select}
    />
  );

  if (element.type === 'line') return (
    <LineElement
      id={element.id} position={element.position} style={element.style}
      onUpdateStyle={(id, s) => onUpdateElement(id, { style: { ...element.style, ...s } })}
      onUpdatePosition={(id, p) => onUpdateElement(id, { position: p })}
      isSelected={isSelected} onSelect={select}
    />
  );

  if (element.type === 'box') return (
    <BoxElement
      id={element.id} position={element.position}
      shape={(element as any).shape} style={element.style}
      onUpdateStyle={(id, s) => onUpdateElement(id, { style: { ...element.style, ...s } })}
      onUpdatePosition={(id, p) => onUpdateElement(id, { position: p })}
      isSelected={isSelected} onSelect={select}
    />
  );

  if (element.type === 'date') return (
    <DateElement
      id={element.id} value={element.value} time={element.time}
      includeTime={element.includeTime} format={element.format as any}
      position={element.position} style={element.style}
      onUpdate={onUpdateElement} onElementSelect={select}
    />
  );

  if (element.type === 'barcode') {
    const barcodeEl = element as BarcodeElementType;
    return (
      <BarcodeElement
        id={barcodeEl.id}
        content={barcodeEl.content}
        position={barcodeEl.position}
        style={barcodeEl.style}
        barcode={barcodeEl.barcode}
        isSelected={isSelected}
        onSelect={select}
      />
    );
  }

  if (element.type === 'chart') {
    const chartEl = element as ChartElementType;
    return (
      <ChartElement
        id={chartEl.id}
        position={chartEl.position}
        style={chartEl.style}
        chart={chartEl.chart}
        isSelected={isSelected}
        onSelect={select}
        onUpdateStyle={(id, s) => onUpdateElement(id, { style: { ...chartEl.style, ...s } })}
      />
    );
  }

  return null;
}

export default CanvasElementView;
