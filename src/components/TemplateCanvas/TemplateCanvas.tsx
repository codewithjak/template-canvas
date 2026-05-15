/**
 * TemplateCanvas.tsx
 * Main canvas component, updated to use the new data-source architecture.
 *
 * Key changes from previous version:
 *   - boundData is now typed as BoundData (metadata + collections + mappings)
 *   - previewElements uses mapTemplateForPreview() which correctly separates
 *     static substitution from table-row expansion
 *   - Tables always render from raw template elements on canvas (placeholders
 *     visible); preview substitutes only the selected row
 *   - Export sends the new payload shape to /generate-document
 *   - UploadData now receives staticPlaceholders + tables instead of one flat list
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

import Toolbar from './Toolbar';
import UploadData from './UploadData';
import TextElement from './TextElement';
import ImageElement from './ImageElement';
import LineElement from './LineElement';
import BoxElement from './BoxElement';
import ParagraphElement from './ParagraphElement';
import RadioElement from './RadioElement';
import CheckboxElement from './CheckboxElement';
import DateElement from './DateElement';
import LayoutTableElement from './LayoutTableElement';
import PropertiesPanel from './PropertiesPanel';

import type { BoundData } from '../../types/dataSource';
import {
  getStaticPlaceholders,
  getTableInfos,
  mapTemplateForPreview,
} from '../../services/mappingEngine';
import { buildExportPayload, maxBoundRows } from '../../services/dataSourceService';

import type { LayoutTableElement as LayoutTableModel } from '../../model/layoutTable';
import { createDefaultLayoutTable, isLayoutTable, isLegacyCanvasTable } from '../../model/layoutTable';
import './TemplateCanvas.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── Element type definitions (unchanged) ──────────────────────────────────────

interface TextElementType {
  id: string; type: 'text'; content: string;
  position: { x: number; y: number };
  style: { fontSize: number; fontWeight: string; color: string; fontFamily: string };
}
interface ImageElementType {
  id: string; type: 'image'; src: string;
  position: { x: number; y: number };
  style: { width: number; height: number; objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'; opacity?: number };
}
interface LineElementType {
  id: string; type: 'line';
  position: { x: number; y: number };
  style: { length: number; thickness: number; direction: 'horizontal' | 'vertical'; color: string; style: 'solid' | 'dashed' | 'dotted'; opacity?: number };
}
interface BoxElementType {
  id: string; type: 'box'; shape?: string;
  position: { x: number; y: number };
  style: { width: number; height: number; borderWidth: number; borderColor: string; borderStyle: 'solid' | 'dashed' | 'dotted' | 'double'; backgroundColor: string; opacity?: number; borderRadius?: number };
}
interface ParagraphElementType {
  id: string; type: 'paragraph'; content: string;
  position: { x: number; y: number };
  style: { fontSize: number; fontWeight: string; color: string; fontFamily: string; lineHeight?: number };
}
interface RadioElementType {
  id: string; type: 'radio'; options: number; selected?: string; orientation?: string;
  position: { x: number; y: number; relativeOffset?: number };
}
interface CheckboxElementType {
  id: string; type: 'checkbox'; count?: number; checkedValues?: string[]; orientation?: string;
  position: { x: number; y: number; relativeOffset?: number };
}
interface DateElementType {
  id: string; type: 'date'; value?: string; time?: string; includeTime?: boolean; format?: string;
  position: { x: number; y: number };
  style: { fontSize: number; fontWeight: string; color: string; fontFamily: string };
}

type CanvasElement =
  | TextElementType | ImageElementType | LineElementType | BoxElementType
  | ParagraphElementType | RadioElementType | CheckboxElementType | DateElementType
  | LayoutTableModel;

// ── Component ─────────────────────────────────────────────────────────────────

function TemplateCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);

  const [boundData, setBoundData] = useState<BoundData | null>(null);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const [layoutTableCellSelection, setLayoutTableCellSelection] = useState<{
    tableId: string; rowIndex: number; colIndex: number;
  } | null>(null);
  const [layoutTableRange, setLayoutTableRange] = useState<{
    tableId: string; r0: number; c0: number; r1: number; c1: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  // ── Derived data for upload panel ─────────────────────────────────────────

  const staticPlaceholders = useMemo(() => getStaticPlaceholders(elements as any), [elements]);
  const tableInfos = useMemo(() => getTableInfos(elements as any), [elements]);

  // ── Preview elements ──────────────────────────────────────────────────────
  //
  // Static elements: substituted with metadata
  // Tables: show only one preview row (previewRowIndex), NOT all rows
  // If no data is bound, render raw template (placeholders visible)

  const previewElements = useMemo(() => {
    if (!boundData) return elements;
    return mapTemplateForPreview(elements as any, boundData, previewRowIndex) as CanvasElement[];
  }, [boundData, elements, previewRowIndex]);

  // ── Sensors ───────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ── Add element handlers ──────────────────────────────────────────────────

  const addEl = <T extends CanvasElement>(el: T) => setElements(prev => [...prev, el]);

  const handleAddText = () => addEl<TextElementType>({
    id: `text-${Date.now()}`, type: 'text', content: 'New Text',
    position: { x: 50, y: 50 },
    style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
  });

  const handleAddParagraph = () => addEl<ParagraphElementType>({
    id: `paragraph-${Date.now()}`, type: 'paragraph', content: 'Add your text here…',
    position: { x: 50, y: 50 },
    style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif', lineHeight: 24 },
  });

  const handleAddTable = () => addEl(createDefaultLayoutTable('table'));

  const handleAddImage = () => addEl<ImageElementType>({
    id: `image-${Date.now()}`, type: 'image', src: '{{image_url}}',
    position: { x: 50, y: 50 },
    style: { width: 200, height: 200, objectFit: 'contain', opacity: 100 },
  });

  const handleAddLine = () => addEl<LineElementType>({
    id: `line-${Date.now()}`, type: 'line', position: { x: 50, y: 50 },
    style: { length: 200, thickness: 2, direction: 'horizontal', color: '#000000', style: 'solid', opacity: 100 },
  });

  const handleAddBox = () => addEl<BoxElementType>({
    id: `box-${Date.now()}`, type: 'box', shape: 'box', position: { x: 50, y: 50 },
    style: { width: 200, height: 200, borderWidth: 1, borderColor: '#000000', borderStyle: 'solid', backgroundColor: 'transparent', opacity: 100, borderRadius: 0 },
  });

  const handleAddRectangle = () => addEl<BoxElementType>({
    id: `rectangle-${Date.now()}`, type: 'box', shape: 'rectangle', position: { x: 50, y: 50 },
    style: { width: 220, height: 140, borderWidth: 1, borderColor: '#007bff', borderStyle: 'solid', backgroundColor: '#e7f1ff', opacity: 100, borderRadius: 0 },
  });

  const handleAddTriangle = () => addEl<BoxElementType>({
    id: `triangle-${Date.now()}`, type: 'box', shape: 'triangle', position: { x: 50, y: 50 },
    style: { width: 140, height: 120, borderWidth: 0, borderColor: '#000000', borderStyle: 'solid', backgroundColor: '#ffb200', opacity: 100, borderRadius: 0 },
  });

  const handleAddEllipse = () => addEl<BoxElementType>({
    id: `ellipse-${Date.now()}`, type: 'box', shape: 'ellipse', position: { x: 50, y: 50 },
    style: { width: 200, height: 120, borderWidth: 1, borderColor: '#2a9d8f', borderStyle: 'solid', backgroundColor: '#d8f3ef', opacity: 100, borderRadius: 9999 },
  });

  const handleAddRadio = () => addEl<RadioElementType>({
    id: `radio-${Date.now()}`, type: 'radio', options: 2, selected: '', orientation: 'vertical',
    position: { x: 50, y: 50, relativeOffset: 8 },
  });

  const handleAddCheckbox = () => addEl<CheckboxElementType>({
    id: `checkbox-${Date.now()}`, type: 'checkbox', count: 1, checkedValues: [], orientation: 'vertical',
    position: { x: 50, y: 50, relativeOffset: 8 },
  });

  const handleAddDate = () => addEl<DateElementType>({
    id: `date-${Date.now()}`, type: 'date', value: '', time: '', includeTime: false, format: 'MM/DD/YYYY',
    position: { x: 50, y: 50 },
    style: { fontSize: 14, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
  });

  // ── Update handlers ───────────────────────────────────────────────────────

  const handleUpdateElement = (id: string, updates: any) => {
    setElements(prev =>
      prev.map(element => {
        if (element.id !== id) return element;
        const updated: any = { ...element };
        if (updates.position) updated.position = { ...updated.position, ...updates.position };
        if (updates.style && 'style' in updated) updated.style = { ...updated.style, ...updates.style };
        if ('content' in updates && 'content' in updated) updated.content = updates.content;
        if ('src' in updates && 'src' in updated) updated.src = updates.src;
        if ('orientation' in updates) updated.orientation = updates.orientation;
        if ('count' in updates) updated.count = updates.count;
        if ('options' in updates) updated.options = updates.options;
        if ('shape' in updates) updated.shape = updates.shape;
        if ('value' in updates && 'value' in updated) updated.value = updates.value;
        if ('time' in updates && 'time' in updated) updated.time = updates.time;
        if ('includeTime' in updates) updated.includeTime = updates.includeTime;
        if ('format' in updates) updated.format = updates.format;
        if (isLayoutTable(updated)) {
          if (updates.columns !== undefined) updated.columns = updates.columns;
          if (updates.headerRow !== undefined) updated.headerRow = updates.headerRow;
          if (updates.rows !== undefined) updated.rows = updates.rows;
          if (updates.binding !== undefined) updated.binding = updates.binding;
          if (updates.size !== undefined) updated.size = updates.size;
        }
        return updated;
      })
    );
  };

  const handleUpdateText = (id: string, content: string) =>
    setElements(prev => prev.map(el => el.id === id && el.type === 'text' ? { ...el, content } : el));

  const handleUpdateParagraph = (id: string, content: string) =>
    setElements(prev => prev.map(el => el.id === id && el.type === 'paragraph' ? { ...el, content } : el));

  const handleUpdateImage = (id: string, src: string) =>
    setElements(prev => prev.map(el => el.id === id && el.type === 'image' ? { ...el, src } : el));

  const handleUpdateRadio = (id: string, updates: any) =>
    setElements(prev => prev.map(el => el.id === id && el.type === 'radio' ? { ...el, ...updates } : el));

  const handleUpdateCheckbox = (id: string, updates: any) =>
    setElements(prev => prev.map(el => el.id === id && el.type === 'checkbox' ? { ...el, ...updates } : el));

  // ── Selection ─────────────────────────────────────────────────────────────

  const handleSelectElement = (id: string) => {
    setSelectedElementId(id);
    const el = elements.find(e => e.id === id);
    if (!isLayoutTable(el)) {
      setLayoutTableCellSelection(null);
      setLayoutTableRange(null);
    }
  };

  const handleDeleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedElementId(prev => prev === id ? null : prev);
    setLayoutTableCellSelection(prev => prev?.tableId === id ? null : prev);
    setLayoutTableRange(prev => prev?.tableId === id ? null : prev);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          handleDeleteElement(selectedElementId);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedElementId]);

  // ── Save / Load ───────────────────────────────────────────────────────────

  const handleSaveTemplate = () => {
    const blob = new Blob([JSON.stringify({ version: '1.0', elements }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `template-${Date.now()}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleLoadTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const tpl = JSON.parse(ev.target?.result as string);
        if (Array.isArray(tpl.elements)) {
          setElements(tpl.elements.filter((el: any) => !isLegacyCanvasTable(el)));
          setSelectedElementId(null);
          setBoundData(null);
          setPreviewRowIndex(0);
        } else alert('Invalid template file.');
      } catch { alert('Error reading template file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Data upload ───────────────────────────────────────────────────────────

  const handleUploadMapped = (bd: BoundData) => {
    setBoundData(bd);
    setPreviewRowIndex(0);
    setUploadPanelOpen(false);
  };

  const handleClearBoundData = () => { setBoundData(null); setPreviewRowIndex(0); };

  const totalRows = boundData ? maxBoundRows(boundData) : 0;
  const handlePrevRow = () => setPreviewRowIndex(i => Math.max(0, i - 1));
  const handleNextRow = () => setPreviewRowIndex(i => Math.min(totalRows - 1, i + 1));

  // ── Export ────────────────────────────────────────────────────────────────

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportDocument = async () => {
    if (elements.length === 0) { alert('No template to export.'); return; }
    try {
      setIsExporting(true);
      const rowCount = boundData ? maxBoundRows(boundData) : 0;
      setExportStatus(
        rowCount > 0
          ? `Generating document with ${rowCount} record${rowCount !== 1 ? 's' : ''}…`
          : 'Generating document…'
      );

      const payload = buildExportPayload(
        elements,
        boundData || {
          source: { metadata: {}, collections: {} },
          fieldMapping: {},
          tableCollectionBindings: {},
          collectionMappings: {},
        },
        `document-${Date.now()}`
      );

      const res = await fetch(`${API_BASE}/generate-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Export failed.');
      }

      const blob = await res.blob();
      downloadBlob(blob, `document-${Date.now()}.pdf`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
      setExportStatus(null);
    }
  };

  // ── Drag ─────────────────────────────────────────────────────────────────

  const handleDragEnd = (event: any) => {
    const { active, delta } = event;
    if (!delta) return;
    setElements(prev =>
      prev.map(el =>
        el.id === active.id
          ? { ...el, position: { x: el.position.x + delta.x, y: el.position.y + delta.y } }
          : el
      )
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedElement = elements.find(el => el.id === selectedElementId) || null;

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="template-canvas-container">

        <Toolbar
          onAddParagraph={handleAddParagraph}
          onAddRadio={handleAddRadio}
          onAddCheckbox={handleAddCheckbox}
          onAddDate={handleAddDate}
          onAddText={handleAddText}
          onAddTable={handleAddTable}
          onAddImage={handleAddImage}
          onAddLine={handleAddLine}
          onAddBox={handleAddBox}
          onAddRectangle={handleAddRectangle}
          onAddTriangle={handleAddTriangle}
          onAddEllipse={handleAddEllipse}
          onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
          onSave={handleSaveTemplate}
          onLoad={handleLoadTemplate}
          onUpload={() => setUploadPanelOpen(true)}
          onExportPDF={handleExportDocument}
          hasSelection={!!selectedElementId}
          hasElements={elements.length > 0}
        />

        {uploadPanelOpen && (
          <div className="upload-panel-backdrop">
            <UploadData
              staticPlaceholders={staticPlaceholders}
              tables={tableInfos}
              onClose={() => setUploadPanelOpen(false)}
              onDataMapped={handleUploadMapped}
            />
          </div>
        )}

        {/* Data banner */}
        {boundData && (
          <div className="batch-export-controls">
            <div className="batch-export-summary">
              <span>{totalRows} record{totalRows !== 1 ? 's' : ''} bound</span>
              {totalRows > 1 && (
                <span className="preview-label">
                  &nbsp;— previewing row {previewRowIndex + 1} of {totalRows}
                </span>
              )}
            </div>
            <div className="batch-export-actions">
              {totalRows > 1 && (
                <div className="preview-nav">
                  <button type="button" className="preview-nav-btn" onClick={handlePrevRow} disabled={previewRowIndex === 0} title="Previous">‹</button>
                  <span className="preview-nav-count">{previewRowIndex + 1} / {totalRows}</span>
                  <button type="button" className="preview-nav-btn" onClick={handleNextRow} disabled={previewRowIndex === totalRows - 1} title="Next">›</button>
                </div>
              )}
              <button type="button" className="clear-button" onClick={handleClearBoundData}>Clear Data</button>
            </div>
          </div>
        )}

        {/* Export overlay */}
        {isExporting && (
          <div className="export-overlay">
            <div className="export-overlay-card"><p>{exportStatus || 'Generating…'}</p></div>
          </div>
        )}

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="template-canvas"
          onClick={e => {
            if (e.target === e.currentTarget) {
              setSelectedElementId(null);
              setLayoutTableCellSelection(null);
              setLayoutTableRange(null);
            }
          }}
        >
          {previewElements.map(element => {
            if (element.type === 'text') {
              return (
                <TextElement key={element.id} id={element.id} content={(element as TextElementType).content}
                  position={element.position} style={(element as TextElementType).style}
                  onUpdate={handleUpdateText} isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                  onResize={(id, fontSize) => handleUpdateElement(id, { style: { ...(element as TextElementType).style, fontSize } })}
                />
              );
            }
            if (element.type === 'paragraph') {
              return (
                <ParagraphElement key={element.id} id={element.id} content={(element as ParagraphElementType).content}
                  position={element.position} style={(element as ParagraphElementType).style}
                  onUpdate={handleUpdateParagraph} isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            }
            if (element.type === 'radio') {
              const el = element as RadioElementType;
              return (
                <RadioElement key={el.id} id={el.id} options={el.options} selected={el.selected}
                  orientation={el.orientation as any} position={el.position}
                  onSelect={(id, opt) => handleUpdateRadio(id, { selected: opt })}
                  onUpdate={handleUpdateRadio} onElementSelect={() => handleSelectElement(el.id)}
                />
              );
            }
            if (element.type === 'checkbox') {
              const el = element as CheckboxElementType;
              return (
                <CheckboxElement key={el.id} id={el.id} count={el.count} checkedValues={el.checkedValues}
                  orientation={el.orientation as any} position={el.position}
                  onUpdate={handleUpdateCheckbox} onElementSelect={() => handleSelectElement(el.id)}
                />
              );
            }
            if (element.type === 'table' && isLayoutTable(element)) {
              // Always use raw template element so placeholder tokens stay visible on canvas.
              // previewElements has already resolved the preview row inside; use that.
              const tableEl = element as LayoutTableModel;
              return (
                <LayoutTableElement key={tableEl.id} element={tableEl}
                  isSelected={tableEl.id === selectedElementId}
                  onTableChromeSelect={() => {
                    handleSelectElement(tableEl.id);
                    setLayoutTableCellSelection(null);
                    setLayoutTableRange(prev => prev?.tableId === tableEl.id ? null : prev);
                  }}
                  onUpdate={handleUpdateElement}
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
                    handleSelectElement(tableId);
                    setLayoutTableCellSelection({ tableId, rowIndex, colIndex });
                  }}
                />
              );
            }
            if (element.type === 'image') {
              const el = element as ImageElementType;
              return (
                <ImageElement key={el.id} id={el.id} src={el.src} position={el.position} style={el.style}
                  onUpdate={handleUpdateImage}
                  onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...el.style, ...s } })}
                  isSelected={el.id === selectedElementId}
                  onSelect={() => handleSelectElement(el.id)}
                />
              );
            }
            if (element.type === 'line') {
              const el = element as LineElementType;
              return (
                <LineElement key={el.id} id={el.id} position={el.position} style={el.style}
                  onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...el.style, ...s } })}
                  onUpdatePosition={(id, p) => handleUpdateElement(id, { position: p })}
                  isSelected={el.id === selectedElementId}
                  onSelect={() => handleSelectElement(el.id)}
                />
              );
            }
            if (element.type === 'box') {
              const el = element as BoxElementType;
              return (
                <BoxElement key={el.id} id={el.id} position={el.position} shape={el.shape as any} style={el.style}
                  onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...el.style, ...s } })}
                  onUpdatePosition={(id, p) => handleUpdateElement(id, { position: p })}
                  isSelected={el.id === selectedElementId}
                  onSelect={() => handleSelectElement(el.id)}
                />
              );
            }
            if (element.type === 'date') {
              const el = element as DateElementType;
              return (
                <DateElement key={el.id} id={el.id} value={el.value} time={el.time}
                  includeTime={el.includeTime} format={el.format as any}
                  position={el.position} style={el.style}
                  onUpdate={handleUpdateElement}
                  onElementSelect={() => handleSelectElement(el.id)}
                />
              );
            }
            return null;
          })}
        </div>

        <PropertiesPanel
          selectedElement={selectedElement as any}
          onUpdate={handleUpdateElement}
          layoutTableActiveCell={layoutTableCellSelection}
          layoutTableRange={layoutTableRange}
        />
      </div>
    </DndContext>
  );
}

export default TemplateCanvas;