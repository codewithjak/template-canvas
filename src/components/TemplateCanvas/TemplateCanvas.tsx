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
import type { DataRow } from '../../services/mappingEngine';
import { getAllPlaceholders, mapTemplateToData } from '../../services/mappingEngine';
import type { LayoutTableElement as LayoutTableModel } from '../../model/layoutTable';
import { createDefaultLayoutTable, isLayoutTable, isLegacyCanvasTable } from '../../model/layoutTable';
import './TemplateCanvas.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface TextElementType {
  id: string;
  type: 'text';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
}

interface ImageElementType {
  id: string;
  type: 'image';
  src: string;
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    opacity?: number;
  };
}

interface LineElementType {
  id: string;
  type: 'line';
  position: { x: number; y: number };
  style: {
    length: number;
    thickness: number;
    direction: 'horizontal' | 'vertical';
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
    opacity?: number;
  };
}

interface BoxElementType {
  id: string;
  type: 'box';
  shape?: 'box' | 'rectangle' | 'triangle' | 'ellipse';
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    borderWidth: number;
    borderColor: string;
    borderStyle: 'solid' | 'dashed' | 'dotted' | 'double';
    backgroundColor: string;
    opacity?: number;
    borderRadius?: number;
  };
}

interface ParagraphElementType {
  id: string;
  type: 'paragraph';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    lineHeight?: number;
  };
}

interface RadioElementType {
  id: string;
  type: 'radio';
  options: number;
  selected?: string;
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

interface CheckboxElementType {
  id: string;
  type: 'checkbox';
  count?: number;
  checkedValues?: string[];
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

interface DateElementType {
  id: string;
  type: 'date';
  value?: string;
  time?: string;
  includeTime?: boolean;
  format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD Mon YYYY';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
}

type CanvasElement =
  | TextElementType
  | ImageElementType
  | LineElementType
  | BoxElementType
  | ParagraphElementType
  | RadioElementType
  | CheckboxElementType
  | DateElementType
  | LayoutTableModel;

function TemplateCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);

  // All bound rows + mapping. previewRowIndex only affects canvas display.
  // Export always sends ALL rows to backend regardless of preview position.
  const [boundData, setBoundData] = useState<{
    rows: DataRow[];
    mapping: Record<string, string>;
  } | null>(null);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);

  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const [layoutTableCellSelection, setLayoutTableCellSelection] = useState<{
    tableId: string;
    rowIndex: number;
    colIndex: number;
  } | null>(null);
  const [layoutTableRange, setLayoutTableRange] = useState<{
    tableId: string;
    r0: number;
    c0: number;
    r1: number;
    c1: number;
  } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const templatePlaceholders = useMemo(() => getAllPlaceholders(elements), [elements]);

  // Canvas preview: substitutes the selected preview row into static elements
  // (text, paragraph, image, date etc.) so users can verify data mapping.
  // Tables always render raw placeholders on canvas — full row expansion only
  // happens inside the exported PDF on the backend.
  const previewElements = useMemo(() => {
    if (!boundData || boundData.rows.length === 0) return elements;
    const currentRow = boundData.rows[previewRowIndex];
    return mapTemplateToData(elements, currentRow, boundData.mapping);
  }, [boundData, elements, previewRowIndex]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // ── Add element handlers ──────────────────────────────────────────────────

  const handleAddText = () => {
    const newElement: TextElementType = {
      id: `text-${Date.now()}`,
      type: 'text',
      content: 'New Text',
      position: { x: 50, y: 50 },
      style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddTable = () => {
    setElements((prev) => [...prev, createDefaultLayoutTable('table')]);
  };

  const handleAddImage = () => {
    const newElement: ImageElementType = {
      id: `image-${Date.now()}`,
      type: 'image',
      src: '{{image_url}}',
      position: { x: 50, y: 50 },
      style: { width: 200, height: 200, objectFit: 'contain', opacity: 100 },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddLine = () => {
    const newElement: LineElementType = {
      id: `line-${Date.now()}`,
      type: 'line',
      position: { x: 50, y: 50 },
      style: { length: 200, thickness: 2, direction: 'horizontal', color: '#000000', style: 'solid', opacity: 100 },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddBox = () => {
    const newElement: BoxElementType = {
      id: `box-${Date.now()}`,
      type: 'box',
      shape: 'box',
      position: { x: 50, y: 50 },
      style: {
        width: 200, height: 200, borderWidth: 1, borderColor: '#000000',
        borderStyle: 'solid', backgroundColor: 'transparent', opacity: 100, borderRadius: 0,
      },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddRectangle = () => {
    const newElement: BoxElementType = {
      id: `rectangle-${Date.now()}`,
      type: 'box',
      shape: 'rectangle',
      position: { x: 50, y: 50 },
      style: {
        width: 220, height: 140, borderWidth: 1, borderColor: '#007bff',
        borderStyle: 'solid', backgroundColor: '#e7f1ff', opacity: 100, borderRadius: 0,
      },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddTriangle = () => {
    const newElement: BoxElementType = {
      id: `triangle-${Date.now()}`,
      type: 'box',
      shape: 'triangle',
      position: { x: 50, y: 50 },
      style: {
        width: 140, height: 120, borderWidth: 0, borderColor: '#000000',
        borderStyle: 'solid', backgroundColor: '#ffb200', opacity: 100, borderRadius: 0,
      },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddEllipse = () => {
    const newElement: BoxElementType = {
      id: `ellipse-${Date.now()}`,
      type: 'box',
      shape: 'ellipse',
      position: { x: 50, y: 50 },
      style: {
        width: 200, height: 120, borderWidth: 1, borderColor: '#2a9d8f',
        borderStyle: 'solid', backgroundColor: '#d8f3ef', opacity: 100, borderRadius: 9999,
      },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddParagraph = () => {
    const newElement: ParagraphElementType = {
      id: `paragraph-${Date.now()}`,
      type: 'paragraph',
      content: 'Add your text here...',
      position: { x: 50, y: 50 },
      style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif', lineHeight: 24 },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddRadio = () => {
    const newElement: RadioElementType = {
      id: `radio-${Date.now()}`,
      type: 'radio',
      options: 2,
      selected: '',
      orientation: 'vertical',
      position: { x: 50, y: 50, relativeOffset: 8 },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddCheckbox = () => {
    const newElement: CheckboxElementType = {
      id: `checkbox-${Date.now()}`,
      type: 'checkbox',
      count: 1,
      checkedValues: [],
      orientation: 'vertical',
      position: { x: 50, y: 50, relativeOffset: 8 },
    };
    setElements((prev) => [...prev, newElement]);
  };

  const handleAddDate = () => {
    const newElement: DateElementType = {
      id: `date-${Date.now()}`,
      type: 'date',
      value: '',
      time: '',
      includeTime: false,
      format: 'MM/DD/YYYY',
      position: { x: 50, y: 50 },
      style: { fontSize: 14, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
    };
    setElements((prev) => [...prev, newElement]);
  };

  // ── Update handlers ───────────────────────────────────────────────────────

  const handleUpdateImage = (id: string, src: string) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id && el.type === 'image' ? { ...el, src } : el))
    );
  };

  const handleUpdateText = (id: string, content: string) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id && el.type === 'text' ? { ...el, content } : el))
    );
  };

  const handleUpdateParagraph = (id: string, content: string) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id && el.type === 'paragraph' ? { ...el, content } : el))
    );
  };

  const handleUpdateRadio = (id: string, updates: { selected?: string; orientation?: 'horizontal' | 'vertical' }) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id && el.type === 'radio' ? { ...el, ...updates } : el))
    );
  };

  const handleUpdateCheckbox = (id: string, updates: { checkedValues?: string[]; orientation?: 'horizontal' | 'vertical' }) => {
    setElements((prev) =>
      prev.map((el) => (el.id === id && el.type === 'checkbox' ? { ...el, ...updates } : el))
    );
  };

  const handleSelectElement = (id: string) => {
    setSelectedElementId(id);
    const el = elements.find((e) => e.id === id);
    if (!isLayoutTable(el)) {
      setLayoutTableCellSelection(null);
      setLayoutTableRange(null);
    }
  };

  const handleUpdateElement = (id: string, updates: any) => {
    setElements((prev) =>
      prev.map((element) => {
        if (element.id !== id) return element;
        const updated = { ...element };
        if (updates.position) updated.position = { ...updated.position, ...updates.position };
        if (updates.style && 'style' in updated) {
          (updated as any).style = { ...(updated as any).style, ...updates.style };
        }
        if ('content' in updates && 'content' in updated) (updated as any).content = updates.content;
        if ('src' in updates && 'src' in updated) (updated as any).src = updates.src;
        if ('orientation' in updates) (updated as any).orientation = updates.orientation;
        if ('count' in updates) (updated as any).count = updates.count;
        if ('options' in updates) (updated as any).options = updates.options;
        if ('shape' in updates) (updated as any).shape = updates.shape;
        if ('value' in updates && 'value' in updated) (updated as any).value = updates.value;
        if ('time' in updates && 'time' in updated) (updated as any).time = updates.time;
        if ('includeTime' in updates && 'includeTime' in updated) (updated as any).includeTime = updates.includeTime;
        if ('format' in updates && 'format' in updated) (updated as any).format = updates.format;
        if (isLayoutTable(updated)) {
          if (updates.columns !== undefined) (updated as LayoutTableModel).columns = updates.columns;
          if (updates.headerRow !== undefined) (updated as LayoutTableModel).headerRow = updates.headerRow;
          if (updates.rows !== undefined) (updated as LayoutTableModel).rows = updates.rows;
          if (updates.binding !== undefined) (updated as LayoutTableModel).binding = updates.binding;
          if (updates.size !== undefined) (updated as LayoutTableModel).size = updates.size;
        }
        return updated;
      })
    );
  };

  const selectedElement = elements.find((el) => el.id === selectedElementId) || null;

  const handleDeleteElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    setSelectedElementId((prev) => (prev === id ? null : prev));
    setLayoutTableCellSelection((prev) => (prev?.tableId === id ? null : prev));
    setLayoutTableRange((prev) => (prev?.tableId === id ? null : prev));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          handleDeleteElement(selectedElementId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId]);

  // ── Save / Load ───────────────────────────────────────────────────────────

  const handleSaveTemplate = () => {
    const template = { version: '1.0', elements };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `template-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const template = JSON.parse(e.target?.result as string);
        if (template.elements && Array.isArray(template.elements)) {
          setElements(template.elements.filter((el: unknown) => !isLegacyCanvasTable(el)));
          setSelectedElementId(null);
          setBoundData(null);
          setPreviewRowIndex(0);
        } else {
          alert('Invalid template file format');
        }
      } catch {
        alert('Error loading template file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // ── Data upload ───────────────────────────────────────────────────────────

  const handleOpenUpload = () => setUploadPanelOpen(true);
  const handleCloseUpload = () => setUploadPanelOpen(false);

  // No more isBatch flag — all uploads are stored as full row set
  const handleUploadMapped = (dataRows: DataRow[], fieldMapping: Record<string, string>) => {
    setBoundData({ rows: dataRows, mapping: fieldMapping });
    setPreviewRowIndex(0);
    setUploadPanelOpen(false);
  };

  const handleClearBoundData = () => {
    setBoundData(null);
    setPreviewRowIndex(0);
  };

  // Preview row navigation — only affects canvas display, not export
  const handlePrevRow = () => setPreviewRowIndex((i) => Math.max(0, i - 1));
  const handleNextRow = () =>
    setPreviewRowIndex((i) => Math.min((boundData?.rows.length ?? 1) - 1, i + 1));

  // ── Export ────────────────────────────────────────────────────────────────

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Sends ALL rows to backend — preview row index is irrelevant for export
  const handleExportDocument = async () => {
    if (elements.length === 0) {
      alert('No template to export');
      return;
    }
    try {
      setIsExporting(true);
      setExportStatus(
        boundData && boundData.rows.length > 0
          ? `Generating document with ${boundData.rows.length} record${boundData.rows.length !== 1 ? 's' : ''}…`
          : 'Generating document…'
      );

      const response = await fetch(`${API_BASE}/generate-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateElements: elements,
          dataRows: boundData?.rows || [],
          fieldMapping: boundData?.mapping || {},
          outputFileName: `document-${Date.now()}`,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error || 'Failed to generate document');
      }

      const blob = await response.blob();
      downloadBlob(blob, `document-${Date.now()}.pdf`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
      setExportStatus(null);
    }
  };

  // ── Drag ─────────────────────────────────────────────────────────────────

  const handleDragEnd = (event: any) => {
    const { active, delta } = event;
    if (!delta) return;
    setElements((prev) =>
      prev.map((el) =>
        el.id === active.id
          ? { ...el, position: { x: el.position.x + delta.x, y: el.position.y + delta.y } }
          : el
      )
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

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
          onUpload={handleOpenUpload}
          onExportPDF={handleExportDocument}
          hasSelection={!!selectedElementId}
          hasElements={elements.length > 0}
        />

        {uploadPanelOpen && (
          <div className="upload-panel-backdrop">
            <UploadData
              templatePlaceholders={templatePlaceholders}
              onClose={handleCloseUpload}
              onDataMapped={handleUploadMapped}
            />
          </div>
        )}

        {/* Data banner with prev/next preview navigation */}
        {boundData && (
          <div className="batch-export-controls">
            <div className="batch-export-summary">
              <span>{boundData.rows.length} record{boundData.rows.length !== 1 ? 's' : ''} bound</span>
              <span className="preview-label">
                &nbsp;— previewing row {previewRowIndex + 1} of {boundData.rows.length}
              </span>
            </div>
            <div className="batch-export-actions">
              <div className="preview-nav">
                <button
                  type="button"
                  className="preview-nav-btn"
                  onClick={handlePrevRow}
                  disabled={previewRowIndex === 0}
                  title="Previous record"
                >
                  ‹
                </button>
                <span className="preview-nav-count">
                  {previewRowIndex + 1} / {boundData.rows.length}
                </span>
                <button
                  type="button"
                  className="preview-nav-btn"
                  onClick={handleNextRow}
                  disabled={previewRowIndex === boundData.rows.length - 1}
                  title="Next record"
                >
                  ›
                </button>
              </div>
              <button type="button" className="clear-button" onClick={handleClearBoundData}>
                Clear Data
              </button>
            </div>
          </div>
        )}

        {/* Export overlay */}
        {isExporting && (
          <div className="export-overlay">
            <div className="export-overlay-card">
              <p>{exportStatus || 'Generating document…'}</p>
            </div>
          </div>
        )}

        <div
          ref={canvasRef}
          className="template-canvas"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedElementId(null);
              setLayoutTableCellSelection(null);
              setLayoutTableRange(null);
            }
          }}
        >
          {previewElements.map((element) => {
            if (element.type === 'text') {
              return (
                <TextElement
                  key={element.id}
                  id={element.id}
                  content={element.content}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateText}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                  onResize={(id, fontSize) =>
                    handleUpdateElement(id, { style: { ...element.style, fontSize } })
                  }
                />
              );
            } else if (element.type === 'paragraph') {
              return (
                <ParagraphElement
                  key={element.id}
                  id={element.id}
                  content={element.content}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateParagraph}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'radio') {
              return (
                <RadioElement
                  key={element.id}
                  id={element.id}
                  options={element.options}
                  selected={element.selected}
                  orientation={element.orientation}
                  position={element.position}
                  onSelect={(id, option) => handleUpdateRadio(id, { selected: option })}
                  onUpdate={handleUpdateRadio}
                  onElementSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'checkbox') {
              return (
                <CheckboxElement
                  key={element.id}
                  id={element.id}
                  count={element.count}
                  checkedValues={element.checkedValues}
                  orientation={element.orientation}
                  position={element.position}
                  onUpdate={handleUpdateCheckbox}
                  onElementSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'table' && isLayoutTable(element)) {
              // Always pull raw template element for tables so placeholders stay
              // visible on canvas. Preview substitution is for static fields only.
              const rawTable = elements.find((e) => e.id === element.id);
              const tableEl = (rawTable && isLayoutTable(rawTable) ? rawTable : element) as LayoutTableModel;
              return (
                <LayoutTableElement
                  key={tableEl.id}
                  element={tableEl}
                  isSelected={tableEl.id === selectedElementId}
                  onTableChromeSelect={() => {
                    handleSelectElement(tableEl.id);
                    setLayoutTableCellSelection(null);
                    setLayoutTableRange((prev) =>
                      prev?.tableId === tableEl.id ? null : prev
                    );
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
                    else setLayoutTableRange((prev) => (prev?.tableId === tableId ? null : prev));
                  }}
                  onCellSelect={(tableId, rowIndex, colIndex) => {
                    handleSelectElement(tableId);
                    setLayoutTableCellSelection({ tableId, rowIndex, colIndex });
                  }}
                />
              );
            } else if (element.type === 'image') {
              return (
                <ImageElement
                  key={element.id}
                  id={element.id}
                  src={element.src}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateImage}
                  onUpdateStyle={(id, styleUpdates) =>
                    handleUpdateElement(id, { style: { ...element.style, ...styleUpdates } })
                  }
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'line') {
              return (
                <LineElement
                  key={element.id}
                  id={element.id}
                  position={element.position}
                  style={element.style}
                  onUpdateStyle={(id, styleUpdates) =>
                    handleUpdateElement(id, { style: { ...element.style, ...styleUpdates } })
                  }
                  onUpdatePosition={(id, positionUpdates) =>
                    handleUpdateElement(id, { position: positionUpdates })
                  }
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'box') {
              return (
                <BoxElement
                  key={element.id}
                  id={element.id}
                  position={element.position}
                  shape={element.shape}
                  style={element.style}
                  onUpdateStyle={(id, styleUpdates) =>
                    handleUpdateElement(id, { style: { ...element.style, ...styleUpdates } })
                  }
                  onUpdatePosition={(id, positionUpdates) =>
                    handleUpdateElement(id, { position: positionUpdates })
                  }
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'date') {
              return (
                <DateElement
                  key={element.id}
                  id={element.id}
                  value={element.value}
                  time={element.time}
                  includeTime={element.includeTime}
                  format={element.format}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateElement}
                  onElementSelect={() => handleSelectElement(element.id)}
                />
              );
            }
            return null;
          })}
        </div>

        <PropertiesPanel
          selectedElement={selectedElement}
          onUpdate={handleUpdateElement}
          layoutTableActiveCell={layoutTableCellSelection}
          layoutTableRange={layoutTableRange}
        />
      </div>
    </DndContext>
  );
}

export default TemplateCanvas;