/**
 * TemplateCanvas.tsx
 * Multi-page canvas.
 *
 * State shape:
 *   pages: CanvasPage[]   — ordered array of canvas pages
 *   Each page owns its elements independently.
 *
 * Template JSON (v2.0):
 *   { version:'2.0', meta:{...}, pages:[...], ai:null }
 *   v1.0 files are auto-migrated on load.
 *
 * New features vs previous version:
 *   - Multiple canvas pages rendered as a vertical stack
 *   - PageBreakDivider between pages (select to see settings)
 *   - "Add Page" toolbar button
 *   - Per-page: label, repeatHeader toggle
 *   - Save modal asks for template name (once; reuses on subsequent saves)
 *   - Drag: elements stay within their own canvas page
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

import Toolbar           from './Toolbar';
import UploadData        from './UploadData';
import PageBreakDivider  from './PageBreakDivider';
import SaveTemplateModal from './SaveTemplateModal';
import TextElement       from './TextElement';
import ImageElement      from './ImageElement';
import LineElement       from './LineElement';
import BoxElement        from './BoxElement';
import ParagraphElement  from './ParagraphElement';
import RadioElement      from './RadioElement';
import CheckboxElement   from './CheckboxElement';
import DateElement       from './DateElement';
import LayoutTableElement from './LayoutTableElement';
import PropertiesPanel   from './PropertiesPanel';

import type { BoundData }   from '../../types/dataSource';
import type { CanvasPage, CanvasElement, TemplateMeta }  from '../../types/canvas';
import {
  createPage,
  createTemplateDocument,
  migrateV1,
} from '../../types/canvas';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find which page owns a given element id. */
function findPageOfElement(pages: CanvasPage[], elementId: string): string | null {
  for (const p of pages) {
    if (p.elements.some(e => e.id === elementId)) return p.pageId;
  }
  return null;
}

/** Update elements on a specific page, leaving other pages untouched. */
function updatePageElements(
  pages    : CanvasPage[],
  pageId   : string,
  updater  : (els: CanvasElement[]) => CanvasElement[],
): CanvasPage[] {
  return pages.map(p =>
    p.pageId === pageId ? { ...p, elements: updater(p.elements) } : p
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

function TemplateCanvas() {

  // ── Core state ────────────────────────────────────────────────────────────

  const [pages, setPages] = useState<CanvasPage[]>([
    createPage({ pageId: 'page-1', label: 'Page 1' }),
  ]);

  // templateMeta persists across saves so templateId + createdAt are stable
  const [templateMeta, setTemplateMeta] = useState<Partial<TemplateMeta>>({});

  // ── Selection state ───────────────────────────────────────────────────────

  const [selectedElementId,    setSelectedElementId]    = useState<string | null>(null);
  const [activePageId,         setActivePageId]         = useState<string>('page-1');
  const [selectedPageBreakId,  setSelectedPageBreakId]  = useState<string | null>(null);

  const [layoutTableCellSelection, setLayoutTableCellSelection] = useState<{
    tableId: string; rowIndex: number; colIndex: number;
  } | null>(null);
  const [layoutTableRange, setLayoutTableRange] = useState<{
    tableId: string; r0: number; c0: number; r1: number; c1: number;
  } | null>(null);

  // ── Data / export state ───────────────────────────────────────────────────

  const [boundData,      setBoundData]      = useState<BoundData | null>(null);
  const [previewRowIndex,setPreviewRowIndex] = useState(0);
  const [uploadPanelOpen,setUploadPanelOpen] = useState(false);
  const [isExporting,    setIsExporting]     = useState(false);
  const [exportStatus,   setExportStatus]    = useState<string | null>(null);

  // ── Save modal ────────────────────────────────────────────────────────────

  const [showSaveModal,  setShowSaveModal]   = useState(false);

  // ── Sensors ───────────────────────────────────────────────────────────────

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ── Derived: all elements across all pages (for upload panel) ─────────────

  const allElements = useMemo(
    () => pages.flatMap(p => p.elements),
    [pages],
  );

  const staticPlaceholders = useMemo(() => getStaticPlaceholders(allElements as any), [allElements]);
  const tableInfos          = useMemo(() => getTableInfos(allElements as any),         [allElements]);

  // ── Preview elements per page ─────────────────────────────────────────────

  const previewPages = useMemo((): CanvasPage[] => {
    if (!boundData) return pages;
    return pages.map(p => ({
      ...p,
      elements: mapTemplateForPreview(p.elements as any, boundData, previewRowIndex) as CanvasElement[],
    }));
  }, [pages, boundData, previewRowIndex]);

  // ── Add element to active page ────────────────────────────────────────────

  const addEl = useCallback(<T extends CanvasElement>(el: T) => {
    setPages(prev => updatePageElements(prev, activePageId, els => [...els, el]));
  }, [activePageId]);

  // ── Add / delete pages ────────────────────────────────────────────────────

  const handleAddPage = () => {
    const newPage = createPage({ label: `Page ${pages.length + 1}` });
    setPages(prev => [...prev, newPage]);
    setActivePageId(newPage.pageId);
    setSelectedPageBreakId(newPage.pageId);
  };

  const handleDeletePage = (pageId: string) => {
    if (pages.length <= 1) return;
    setPages(prev => prev.filter(p => p.pageId !== pageId));
    setSelectedPageBreakId(null);
    setActivePageId(prev => prev === pageId ? pages[0].pageId : prev);
    // Deselect element if it was on the deleted page
    if (selectedElementId) {
      const ownerPage = findPageOfElement(pages, selectedElementId);
      if (ownerPage === pageId) setSelectedElementId(null);
    }
  };

  const handleUpdatePage = (pageId: string, updates: Partial<CanvasPage>) => {
    setPages(prev => prev.map(p => p.pageId === pageId ? { ...p, ...updates } : p));
  };

  // ── Element add handlers ──────────────────────────────────────────────────

  const handleAddText = () => addEl({
    id: `text-${Date.now()}`, type: 'text', content: 'New Text',
    position: { x: 50, y: 50 },
    style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
  });

  const handleAddParagraph = () => addEl({
    id: `paragraph-${Date.now()}`, type: 'paragraph', content: 'Add your text here…',
    position: { x: 50, y: 50 },
    style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif', lineHeight: 24 },
  });

  const handleAddTable = () => addEl(createDefaultLayoutTable('table'));

  const handleAddImage = () => addEl({
    id: `image-${Date.now()}`, type: 'image', src: '{{image_url}}',
    position: { x: 50, y: 50 },
    style: { width: 200, height: 200, objectFit: 'contain' as const, opacity: 100 },
  });

  const handleAddLine = () => addEl({
    id: `line-${Date.now()}`, type: 'line', position: { x: 50, y: 50 },
    style: { length: 200, thickness: 2, direction: 'horizontal' as const, color: '#000000', style: 'solid' as const, opacity: 100 },
  });

  const handleAddBox = () => addEl({
    id: `box-${Date.now()}`, type: 'box', shape: 'box', position: { x: 50, y: 50 },
    style: { width: 200, height: 200, borderWidth: 1, borderColor: '#000000', borderStyle: 'solid' as const, backgroundColor: 'transparent', opacity: 100, borderRadius: 0 },
  });

  const handleAddRectangle = () => addEl({
    id: `rectangle-${Date.now()}`, type: 'box', shape: 'rectangle', position: { x: 50, y: 50 },
    style: { width: 220, height: 140, borderWidth: 1, borderColor: '#007bff', borderStyle: 'solid' as const, backgroundColor: '#e7f1ff', opacity: 100, borderRadius: 0 },
  });

  const handleAddTriangle = () => addEl({
    id: `triangle-${Date.now()}`, type: 'box', shape: 'triangle', position: { x: 50, y: 50 },
    style: { width: 140, height: 120, borderWidth: 0, borderColor: '#000000', borderStyle: 'solid' as const, backgroundColor: '#ffb200', opacity: 100, borderRadius: 0 },
  });

  const handleAddEllipse = () => addEl({
    id: `ellipse-${Date.now()}`, type: 'box', shape: 'ellipse', position: { x: 50, y: 50 },
    style: { width: 200, height: 120, borderWidth: 1, borderColor: '#2a9d8f', borderStyle: 'solid' as const, backgroundColor: '#d8f3ef', opacity: 100, borderRadius: 9999 },
  });

  const handleAddRadio = () => addEl({
    id: `radio-${Date.now()}`, type: 'radio', options: 2, selected: '', orientation: 'vertical',
    position: { x: 50, y: 50, relativeOffset: 8 },
  });

  const handleAddCheckbox = () => addEl({
    id: `checkbox-${Date.now()}`, type: 'checkbox', count: 1, checkedValues: [], orientation: 'vertical',
    position: { x: 50, y: 50, relativeOffset: 8 },
  });

  const handleAddDate = () => addEl({
    id: `date-${Date.now()}`, type: 'date', value: '', time: '', includeTime: false, format: 'MM/DD/YYYY',
    position: { x: 50, y: 50 },
    style: { fontSize: 14, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' },
  });

  // ── Element update ────────────────────────────────────────────────────────

  const handleUpdateElement = useCallback((id: string, updates: any) => {
    const pageId = findPageOfElement(pages, id);
    if (!pageId) return;
    setPages(prev => updatePageElements(prev, pageId, els =>
      els.map(element => {
        if (element.id !== id) return element;
        const updated: any = { ...element };
        if (updates.position) updated.position = { ...updated.position, ...updates.position };
        if (updates.style && 'style' in updated) updated.style = { ...updated.style, ...updates.style };
        if ('content'     in updates && 'content'     in updated) updated.content     = updates.content;
        if ('src'         in updates && 'src'         in updated) updated.src         = updates.src;
        if ('orientation' in updates) updated.orientation = updates.orientation;
        if ('count'       in updates) updated.count       = updates.count;
        if ('options'     in updates) updated.options     = updates.options;
        if ('shape'       in updates) updated.shape       = updates.shape;
        if ('value'       in updates && 'value' in updated) updated.value = updates.value;
        if ('time'        in updates && 'time'  in updated) updated.time  = updates.time;
        if ('includeTime' in updates) updated.includeTime = updates.includeTime;
        if ('format'      in updates) updated.format      = updates.format;
        if (isLayoutTable(updated)) {
          if (updates.columns   !== undefined) updated.columns   = updates.columns;
          if (updates.headerRow !== undefined) updated.headerRow = updates.headerRow;
          if (updates.rows      !== undefined) updated.rows      = updates.rows;
          if (updates.binding   !== undefined) updated.binding   = updates.binding;
          if (updates.size      !== undefined) updated.size      = updates.size;
        }
        return updated;
      })
    ));
  }, [pages]);

  const handleUpdateText      = (id: string, content: string) => handleUpdateElement(id, { content });
  const handleUpdateParagraph = (id: string, content: string) => handleUpdateElement(id, { content });
  const handleUpdateImage     = (id: string, src: string)     => handleUpdateElement(id, { src });
  const handleUpdateRadio     = (id: string, updates: any)    => handleUpdateElement(id, updates);
  const handleUpdateCheckbox  = (id: string, updates: any)    => handleUpdateElement(id, updates);

  // ── Selection ─────────────────────────────────────────────────────────────

  const handleSelectElement = (id: string, pageId: string) => {
    setSelectedElementId(id);
    setActivePageId(pageId);
    setSelectedPageBreakId(null);
    const el = pages.find(p => p.pageId === pageId)?.elements.find(e => e.id === id);
    if (!isLayoutTable(el)) {
      setLayoutTableCellSelection(null);
      setLayoutTableRange(null);
    }
  };

  const handleDeleteElement = (id: string) => {
    const pageId = findPageOfElement(pages, id);
    if (!pageId) return;
    setPages(prev => updatePageElements(prev, pageId, els => els.filter(e => e.id !== id)));
    if (selectedElementId === id) setSelectedElementId(null);
    if (layoutTableCellSelection?.tableId === id) setLayoutTableCellSelection(null);
    if (layoutTableRange?.tableId         === id) setLayoutTableRange(null);
  };

  const clearAllSelections = () => {
    setSelectedElementId(null);
    setSelectedPageBreakId(null);
    setLayoutTableCellSelection(null);
    setLayoutTableRange(null);
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

  // ── Save ──────────────────────────────────────────────────────────────────

  const doSave = (name: string) => {
    const doc = createTemplateDocument(pages, name, templateMeta);
    setTemplateMeta(doc.meta);
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleSaveTemplate = () => {
    // If we already have a name, save directly. Otherwise show modal.
    if (templateMeta.name) {
      doSave(templateMeta.name);
    } else {
      setShowSaveModal(true);
    }
  };

  // ── Load ──────────────────────────────────────────────────────────────────

  const handleLoadTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string);

        let doc;
        if (raw.version === '2.0' && Array.isArray(raw.pages)) {
          // v2.0 — use directly
          doc = raw;
        } else if (Array.isArray(raw.elements)) {
          // v1.0 — migrate
          doc = migrateV1(raw);
        } else {
          alert('Invalid template file.');
          return;
        }

        // Strip legacy canvas tables from all pages
        const cleanPages: CanvasPage[] = doc.pages.map((p: CanvasPage) => ({
          ...p,
          elements: p.elements.filter((el: any) => !isLegacyCanvasTable(el)),
        }));

        setPages(cleanPages);
        setTemplateMeta(doc.meta || {});
        setSelectedElementId(null);
        setSelectedPageBreakId(null);
        setBoundData(null);
        setPreviewRowIndex(0);
        setActivePageId(cleanPages[0]?.pageId || 'page-1');
      } catch {
        alert('Error reading template file.');
      }
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

  const totalRows      = boundData ? maxBoundRows(boundData) : 0;
  const handlePrevRow  = () => setPreviewRowIndex(i => Math.max(0, i - 1));
  const handleNextRow  = () => setPreviewRowIndex(i => Math.min(totalRows - 1, i + 1));

  // ── Export ────────────────────────────────────────────────────────────────

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportDocument = async () => {
    if (allElements.length === 0) { alert('No template to export.'); return; }
    try {
      setIsExporting(true);
      const rowCount = boundData ? maxBoundRows(boundData) : 0;
      setExportStatus(
        rowCount > 0
          ? `Generating document with ${rowCount} record${rowCount !== 1 ? 's' : ''}…`
          : 'Generating document…'
      );

      // Build payload — send pages array so backend can handle multi-page
      const payload = {
        pages: pages.map(p => ({
          pageId          : p.pageId,
          label           : p.label,
          repeatHeader    : p.repeatHeader,
          headerElementIds: p.headerElementIds,
          ...buildExportPayload(
            p.elements,
            boundData || {
              source              : { metadata: {}, collections: {} },
              fieldMapping        : {},
              tableCollectionBindings: {},
              collectionMappings  : {},
            },
            `document-${Date.now()}`,
          ),
        })),
        outputFileName: `document-${Date.now()}`,
      };

      const res = await fetch(`${API_BASE}/generate-document`, {
        method  : 'POST',
        headers : { 'Content-Type': 'application/json' },
        body    : JSON.stringify(payload),
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

  // ── Drag ──────────────────────────────────────────────────────────────────
  // Elements stay within their own page — we find the owning page by element id
  // and only update that page's elements.

  const handleDragEnd = (event: any) => {
    const { active, delta } = event;
    if (!delta || !active) return;
    const pageId = findPageOfElement(pages, active.id);
    if (!pageId) return;
    setPages(prev => updatePageElements(prev, pageId, els =>
      els.map(el =>
        el.id === active.id
          ? { ...el, position: { x: el.position.x + delta.x, y: el.position.y + delta.y } }
          : el
      )
    ));
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null;
    for (const p of pages) {
      const el = p.elements.find(e => e.id === selectedElementId);
      if (el) return el;
    }
    return null;
  }, [pages, selectedElementId]);

  const renderElements = (pageElements: CanvasElement[], pageId: string) =>
    pageElements.map(element => {
      const isSelected = element.id === selectedElementId;
      const select     = () => handleSelectElement(element.id, pageId);

      if (element.type === 'text') return (
        <TextElement key={element.id} id={element.id} content={element.content}
          position={element.position} style={element.style}
          onUpdate={handleUpdateText} isSelected={isSelected} onSelect={select}
          onResize={(id, fontSize) => handleUpdateElement(id, { style: { ...element.style, fontSize } })}
        />
      );

      if (element.type === 'paragraph') return (
        <ParagraphElement key={element.id} id={element.id} content={element.content}
          position={element.position} style={element.style}
          onUpdate={handleUpdateParagraph} isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'radio') return (
        <RadioElement key={element.id} id={element.id} options={element.options}
          selected={element.selected} orientation={element.orientation as any}
          position={element.position}
          onSelect={(id, opt) => handleUpdateRadio(id, { selected: opt })}
          onUpdate={handleUpdateRadio} onElementSelect={select}
        />
      );

      if (element.type === 'checkbox') return (
        <CheckboxElement key={element.id} id={element.id} count={element.count}
          checkedValues={element.checkedValues} orientation={element.orientation as any}
          position={element.position}
          onUpdate={handleUpdateCheckbox} onElementSelect={select}
        />
      );

      if (element.type === 'table' && isLayoutTable(element)) {
        const tableEl = element as LayoutTableModel;
        return (
          <LayoutTableElement key={tableEl.id} element={tableEl}
            isSelected={tableEl.id === selectedElementId}
            onTableChromeSelect={() => {
              handleSelectElement(tableEl.id, pageId);
              setLayoutTableCellSelection(null);
              setLayoutTableRange(prev => prev?.tableId === tableEl.id ? null : prev);
            }}
            onUpdate={handleUpdateElement}
            activeCell={layoutTableCellSelection?.tableId === tableEl.id
              ? { rowIndex: layoutTableCellSelection.rowIndex, colIndex: layoutTableCellSelection.colIndex }
              : null}
            selectionRange={layoutTableRange?.tableId === tableEl.id
              ? { r0: layoutTableRange.r0, c0: layoutTableRange.c0, r1: layoutTableRange.r1, c1: layoutTableRange.c1 }
              : null}
            onSelectionRangeChange={(tableId, range) => {
              if (range) setLayoutTableRange({ tableId, ...range });
              else setLayoutTableRange(prev => prev?.tableId === tableId ? null : prev);
            }}
            onCellSelect={(tableId, rowIndex, colIndex) => {
              handleSelectElement(tableId, pageId);
              setLayoutTableCellSelection({ tableId, rowIndex, colIndex });
            }}
          />
        );
      }

      if (element.type === 'image') return (
        <ImageElement key={element.id} id={element.id} src={element.src}
          position={element.position} style={element.style}
          onUpdate={handleUpdateImage}
          onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...element.style, ...s } })}
          isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'line') return (
        <LineElement key={element.id} id={element.id} position={element.position} style={element.style}
          onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...element.style, ...s } })}
          onUpdatePosition={(id, p) => handleUpdateElement(id, { position: p })}
          isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'box') return (
        <BoxElement key={element.id} id={element.id} position={element.position}
          shape={element.shape as any} style={element.style}
          onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...element.style, ...s } })}
          onUpdatePosition={(id, p) => handleUpdateElement(id, { position: p })}
          isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'date') return (
        <DateElement key={element.id} id={element.id} value={element.value} time={element.time}
          includeTime={element.includeTime} format={element.format as any}
          position={element.position} style={element.style}
          onUpdate={handleUpdateElement} onElementSelect={select}
        />
      );

      return null;
    });

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="template-canvas-container">

        {/* ── Toolbar ── */}
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
          onAddPage={handleAddPage}
          hasSelection={!!selectedElementId}
          hasElements={allElements.length > 0}
        />

        {/* ── Upload panel ── */}
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

        {/* ── Data banner ── */}
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
                  <button type="button" className="preview-nav-btn" onClick={handlePrevRow} disabled={previewRowIndex === 0}>‹</button>
                  <span className="preview-nav-count">{previewRowIndex + 1} / {totalRows}</span>
                  <button type="button" className="preview-nav-btn" onClick={handleNextRow} disabled={previewRowIndex === totalRows - 1}>›</button>
                </div>
              )}
              <button type="button" className="clear-button" onClick={handleClearBoundData}>Clear Data</button>
            </div>
          </div>
        )}

        {/* ── Export overlay ── */}
        {isExporting && (
          <div className="export-overlay">
            <div className="export-overlay-card"><p>{exportStatus || 'Generating…'}</p></div>
          </div>
        )}

        {/* ── Save modal ── */}
        {showSaveModal && (
          <SaveTemplateModal
            initialName={templateMeta.name || ''}
            onConfirm={name => { setShowSaveModal(false); doSave(name); }}
            onCancel={() => setShowSaveModal(false)}
          />
        )}

        {/* ── Canvas pages ── */}
        <div className="canvas-pages-wrapper">
          {previewPages.map((page, pageIdx) => (
            <div key={page.pageId} className="canvas-page-block">

              {/* Page label above canvas */}
              <div className="canvas-page-label">
                {page.label || `Page ${pageIdx + 1}`}
              </div>

              {/* The canvas itself */}
              <div
                className={`template-canvas ${activePageId === page.pageId ? 'template-canvas--active' : ''}`}
                onClick={e => {
                  if (e.target === e.currentTarget) {
                    clearAllSelections();
                    setActivePageId(page.pageId);
                  }
                }}
              >
                {renderElements(page.elements, page.pageId)}
              </div>

              {/* Page break divider — shown between pages, not after the last */}
              {pageIdx < previewPages.length - 1 && (
                <PageBreakDivider
                  pageNumber={pageIdx + 2}
                  page={previewPages[pageIdx + 1]}
                  isSelected={selectedPageBreakId === previewPages[pageIdx + 1].pageId}
                  canDelete={pages.length > 1}
                  onSelect={() => {
                    clearAllSelections();
                    setSelectedPageBreakId(previewPages[pageIdx + 1].pageId);
                    setActivePageId(previewPages[pageIdx + 1].pageId);
                  }}
                  onDeselect={() => setSelectedPageBreakId(null)}
                  onDelete={() => handleDeletePage(previewPages[pageIdx + 1].pageId)}
                  onToggleRepeatHeader={val =>
                    handleUpdatePage(previewPages[pageIdx + 1].pageId, { repeatHeader: val })
                  }
                  onLabelChange={label =>
                    handleUpdatePage(previewPages[pageIdx + 1].pageId, { label })
                  }
                />
              )}
            </div>
          ))}
        </div>

        {/* ── Properties panel ── */}
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