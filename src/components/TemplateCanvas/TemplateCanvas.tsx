/**
 * TemplateCanvas.tsx
 * Multi-page canvas — rewritten against CanonicalDocument IR.
 *
 * Data state is now:
 *   ir                      CanonicalDocument | null
 *   fieldMapping            FieldMapping
 *   tableCollectionBindings TableCollectionBindings
 *   collectionMappings      CollectionMappings
 *
 * No BoundData. No ParsedDataSource. No metadata. No buildExportPayload.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

import Toolbar           from './Toolbar';
import UploadData        from './UploadData';
import PageBreakDivider  from './PageBreakDivider';
import BoundaryLine      from './BoundaryLine';
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

import type {
  CanonicalDocument,
  FieldMapping,
  TableCollectionBindings,
  CollectionMappings,
} from '../../types/dataSource';
import type {
  CanvasPage,
  CanvasElement,
  TemplateMeta,
  HeaderConfig,
  FooterConfig,
  TextElementType,
} from '../../types/canvas';
import {
  createPage,
  createTemplateDocument,
  migrateV1,
  ensurePageDefaults,
} from '../../types/canvas';
import {
  getStaticPlaceholders,
  getTableInfos,
  mapTemplateForPreview,
  validateBindings,
  autoMapStaticFields,
} from '../../services/mappingEngine';
import { generateBulkDocuments, generateDocument } from '../../services/dataSourceService';
import type { LayoutTableElement as LayoutTableModel } from '../../model/layoutTable';
import {
  createDefaultLayoutTable,
  isLayoutTable,
  isLegacyCanvasTable,
} from '../../model/layoutTable';

import './TemplateCanvas.css';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function adjustColorOpacity(color: string, opacity: number): string {
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    const r   = parseInt(hex.substring(0, 2), 16);
    const g   = parseInt(hex.substring(2, 4), 16);
    const b   = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (color.startsWith('rgba')) return color.replace(/[\d.]+\s*\)/, `${opacity})`);
  if (color.startsWith('rgb')) {
    const m = color.match(/\d+/g);
    if (m && m.length >= 3) return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${opacity})`;
  }
  return color;
}

function findPageOfElement(pages: CanvasPage[], elementId: string): string | null {
  for (const p of pages) {
    if (p.elements.some(e => e.id === elementId)) return p.pageId;
  }
  return null;
}

function updatePageElements(
  pages:   CanvasPage[],
  pageId:  string,
  updater: (els: CanvasElement[]) => CanvasElement[],
): CanvasPage[] {
  return pages.map(p =>
    p.pageId === pageId ? { ...p, elements: updater(p.elements) } : p
  );
}

function pageNumberPreviewLabel(el: TextElementType): string {
  const pn     = el.pageNumber!;
  const start  = pn.startFrom ?? 1;
  const format = pn.format    ?? 'Page X of Y';
  if (format === 'Page X of Y') return `Page ${start} of N`;
  if (format === 'X / Y')       return `${start} / N`;
  return String(start);
}

/** Total preview rows = max rows across all bound collections. */
function maxCollectionRows(ir: CanonicalDocument | null): number {
  if (!ir) return 0;
  return Object.values(ir.collections).reduce((m, c) => Math.max(m, c.rows.length), 0);
}

type ExportMode = 'single' | 'bulk';

function removeEmptyMappings(mapping: FieldMapping): FieldMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, value]) => value.trim() !== '')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function TemplateCanvas() {

  // ── Core state ────────────────────────────────────────────────────────────

  const [pages, setPages] = useState<CanvasPage[]>([
    createPage({ pageId: 'page-1', label: 'Page 1' }),
  ]);
  const [templateMeta, setTemplateMeta] = useState<Partial<TemplateMeta>>({});

  // ── Selection ─────────────────────────────────────────────────────────────

  const [selectedElementId,   setSelectedElementId]   = useState<string | null>(null);
  const [activePageId,        setActivePageId]         = useState<string>('page-1');
  const [selectedPageBreakId, setSelectedPageBreakId]  = useState<string | null>(null);
  const [selectedBoundary,    setSelectedBoundary]     = useState<{
    pageId: string; type: 'header' | 'footer';
  } | null>(null);

  const [layoutTableCellSelection, setLayoutTableCellSelection] = useState<{
    tableId: string; rowIndex: number; colIndex: number;
  } | null>(null);
  const [layoutTableRange, setLayoutTableRange] = useState<{
    tableId: string; r0: number; c0: number; r1: number; c1: number;
  } | null>(null);

  // ── Data / IR state ───────────────────────────────────────────────────────

  const [ir,                      setIr]                      = useState<CanonicalDocument | null>(null);
  const [fieldMapping,            setFieldMapping]            = useState<FieldMapping>({});
  const [tableCollectionBindings, setTableCollectionBindings] = useState<TableCollectionBindings>({});
  const [collectionMappings,      setCollectionMappings]      = useState<CollectionMappings>({});
  const [previewRowIndex,         setPreviewRowIndex]         = useState(0);
  const [uploadPanelOpen,         setUploadPanelOpen]         = useState(false);
  const [exportMode,              setExportMode]              = useState<ExportMode>('single');
  const [bulkDriverCollectionKey, setBulkDriverCollectionKey] = useState('');
  const [bulkFieldMapping,        setBulkFieldMapping]        = useState<FieldMapping>({});
  const [bulkFileNameTemplate,    setBulkFileNameTemplate]    = useState('document-{{index}}.pdf');

  // ── Export state ──────────────────────────────────────────────────────────

  const [isExporting,  setIsExporting]  = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // ── Save modal ────────────────────────────────────────────────────────────

  const [showSaveModal, setShowSaveModal] = useState(false);

  // ── Sensors ───────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ── Derived ───────────────────────────────────────────────────────────────

  const allElements = useMemo(() => pages.flatMap(p => p.elements), [pages]);

  const staticPlaceholders = useMemo(
    () => getStaticPlaceholders(allElements as unknown[]),
    [allElements],
  );
  const tableInfos = useMemo(
    () => getTableInfos(allElements as unknown[]),
    [allElements],
  );

  const totalRows = useMemo(() => maxCollectionRows(ir), [ir]);
  const collectionKeys = useMemo(() => ir ? Object.keys(ir.collections) : [], [ir]);
  const bulkDriverCollection = useMemo(
    () => ir && bulkDriverCollectionKey ? ir.collections[bulkDriverCollectionKey] : undefined,
    [ir, bulkDriverCollectionKey],
  );
  const bulkTotalRows = bulkDriverCollection?.rows.length ?? 0;
  const previewTotalRows = exportMode === 'bulk' ? bulkTotalRows : totalRows;
  const effectiveFieldMapping = useMemo(
    () => exportMode === 'bulk'
      ? { ...fieldMapping, ...removeEmptyMappings(bulkFieldMapping) }
      : fieldMapping,
    [exportMode, fieldMapping, bulkFieldMapping],
  );
  const previewIr = useMemo((): CanonicalDocument | null => {
    if (!ir || exportMode !== 'bulk' || !bulkDriverCollection || bulkTotalRows === 0) return ir;

    const row = bulkDriverCollection.rows[
      Math.min(previewRowIndex, bulkDriverCollection.rows.length - 1)
    ] ?? {};

    return {
      ...ir,
      fields: {
        ...ir.fields,
        ...row,
      },
      collections: {
        ...ir.collections,
        [bulkDriverCollectionKey]: {
          ...bulkDriverCollection,
          rows: [row],
        },
      },
    };
  }, [ir, exportMode, bulkDriverCollection, bulkDriverCollectionKey, bulkTotalRows, previewRowIndex]);

  // ── Preview pages ─────────────────────────────────────────────────────────

  const previewPages = useMemo((): CanvasPage[] => {
    if (!previewIr) return pages;
    return pages.map(p => ({
      ...p,
      elements: mapTemplateForPreview(
        p.elements as unknown[],
        previewIr,
        effectiveFieldMapping,
        tableCollectionBindings,
        collectionMappings,
        exportMode === 'bulk' ? 0 : previewRowIndex,
      ) as CanvasElement[],
    }));
  }, [pages, previewIr, effectiveFieldMapping, tableCollectionBindings, collectionMappings, previewRowIndex, exportMode]);

  useEffect(() => {
    if (!ir) {
      setBulkDriverCollectionKey('');
      setBulkFieldMapping({});
      return;
    }

    const keys = Object.keys(ir.collections);
    setBulkDriverCollectionKey(prev => prev && ir.collections[prev] ? prev : keys[0] ?? '');
  }, [ir]);

  useEffect(() => {
    if (!ir || !bulkDriverCollectionKey) {
      setBulkFieldMapping({});
      return;
    }

    const columns = ir.collections[bulkDriverCollectionKey]?.columns ?? [];
    setBulkFieldMapping(autoMapStaticFields(staticPlaceholders, columns));
  }, [ir, bulkDriverCollectionKey, staticPlaceholders]);

  useEffect(() => {
    const maxIndex = Math.max(0, previewTotalRows - 1);
    setPreviewRowIndex(i => Math.min(i, maxIndex));
  }, [previewTotalRows]);

  // ── Add element to active page ────────────────────────────────────────────

  const addEl = useCallback(<T extends CanvasElement>(el: T) => {
    setPages(prev => updatePageElements(prev, activePageId, els => [...els, el]));
  }, [activePageId]);

  // ── Page management ───────────────────────────────────────────────────────

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
    if (selectedElementId) {
      if (findPageOfElement(pages, selectedElementId) === pageId) {
        setSelectedElementId(null);
      }
    }
  };

  const handleUpdatePage = (pageId: string, updates: Partial<CanvasPage>) => {
    setPages(prev => prev.map(p => p.pageId === pageId ? { ...p, ...updates } : p));
  };

  const handleUpdatePageHeader = (pageId: string, header: HeaderConfig) => {
    setPages(prev => prev.map(p => p.pageId === pageId ? { ...p, header } : p));
  };

  const handleUpdatePageFooter = (pageId: string, footer: FooterConfig) => {
    setPages(prev => prev.map(p => p.pageId === pageId ? { ...p, footer } : p));
  };

  const handleDeleteBoundary = (pageId: string, type: 'header' | 'footer') => {
    setPages(prev => prev.map(p => {
      if (p.pageId !== pageId) return p;
      if (type === 'header') return { ...p, header: { ...p.header, enabled: false } };
      return { ...p, footer: { ...p.footer, enabled: false } };
    }));
    setSelectedBoundary(null);
  };

  // ── Page number element ───────────────────────────────────────────────────

  const handleAddPageNumber = useCallback((atY?: number, targetPageId?: string) => {
    const pageId     = targetPageId ?? activePageId;
    const targetPage = pages.find(p => p.pageId === pageId);
    const footer     = targetPage?.footer;

    const footerEnabled = footer?.enabled ?? false;
    const boundaryY     = footer?.boundaryY ?? 1043;
    const elementY      = atY != null ? atY : footerEnabled ? boundaryY + 16 : 1060;

    const fmt       = (footer as any)?.pageNumberFormat    ?? 'Page X of Y';
    const alignment = (footer as any)?.pageNumberAlignment ?? 'right';
    const startFrom = (footer as any)?.pageNumberStartFrom ?? 1;

    const previewContent =
      fmt === 'X / Y' ? `${startFrom} / N` :
      fmt === 'X'     ? String(startFrom)   :
      `Page ${startFrom} of N`;

    const el: TextElementType = {
      id:        `pagenum-${Date.now()}`,
      type:      'text',
      content:   previewContent,
      position:  { x: 600, y: elementY },
      style:     { fontSize: 10, fontWeight: 'normal', color: '#64748b', fontFamily: 'Arial, sans-serif' },
      pageNumber: { enabled: true, format: fmt, alignment, startFrom },
    };

    setPages(prev => updatePageElements(prev, pageId, els => [...els, el]));
    setActivePageId(pageId);
    setTimeout(() => setSelectedElementId(el.id), 0);
  }, [pages, activePageId]);

  // ── Element add handlers ──────────────────────────────────────────────────

  const handleAddText      = () => addEl({ id: `text-${Date.now()}`,      type: 'text',      content: 'New Text',          position: { x: 50, y: 50 }, style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' } });
  const handleAddParagraph = () => addEl({ id: `paragraph-${Date.now()}`, type: 'paragraph', content: 'Add your text here…', position: { x: 50, y: 50 }, style: { fontSize: 16, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif', lineHeight: 24 } });
  const handleAddTable     = () => addEl(createDefaultLayoutTable('table'));
  const handleAddImage     = () => addEl({ id: `image-${Date.now()}`,     type: 'image',     src: '{{image_url}}',          position: { x: 50, y: 50 }, style: { width: 200, height: 200, objectFit: 'contain' as const, opacity: 100 } });
  const handleAddLine      = () => addEl({ id: `line-${Date.now()}`,      type: 'line',      position: { x: 50, y: 50 },   style: { length: 200, thickness: 2, direction: 'horizontal' as const, color: '#000000', style: 'solid' as const, opacity: 100 } });
  const handleAddBox       = () => addEl({ id: `box-${Date.now()}`,       type: 'box',       shape: 'box',  position: { x: 50, y: 50 }, style: { width: 200, height: 200, borderWidth: 1, borderColor: '#000000', borderStyle: 'solid' as const, backgroundColor: 'transparent', opacity: 100, borderRadius: 0 } });
  const handleAddRectangle = () => addEl({ id: `rectangle-${Date.now()}`, type: 'box',       shape: 'rectangle', position: { x: 50, y: 50 }, style: { width: 220, height: 140, borderWidth: 1, borderColor: '#007bff', borderStyle: 'solid' as const, backgroundColor: '#e7f1ff', opacity: 100, borderRadius: 0 } });
  const handleAddTriangle  = () => addEl({ id: `triangle-${Date.now()}`,  type: 'box',       shape: 'triangle',  position: { x: 50, y: 50 }, style: { width: 140, height: 120, borderWidth: 0, borderColor: '#000000', borderStyle: 'solid' as const, backgroundColor: '#ffb200', opacity: 100, borderRadius: 0 } });
  const handleAddEllipse   = () => addEl({ id: `ellipse-${Date.now()}`,   type: 'box',       shape: 'ellipse',   position: { x: 50, y: 50 }, style: { width: 200, height: 120, borderWidth: 1, borderColor: '#2a9d8f', borderStyle: 'solid' as const, backgroundColor: '#d8f3ef', opacity: 100, borderRadius: 9999 } });
  const handleAddRadio     = () => addEl({ id: `radio-${Date.now()}`,     type: 'radio',     options: 2, selected: '', orientation: 'vertical', position: { x: 50, y: 50, relativeOffset: 8 } });
  const handleAddCheckbox  = () => addEl({ id: `checkbox-${Date.now()}`,  type: 'checkbox',  count: 1, checkedValues: [], orientation: 'vertical', position: { x: 50, y: 50, relativeOffset: 8 } });
  const handleAddDate      = () => addEl({ id: `date-${Date.now()}`,      type: 'date',      value: '', time: '', includeTime: false, format: 'MM/DD/YYYY', position: { x: 50, y: 50 }, style: { fontSize: 14, fontWeight: 'normal', color: '#000000', fontFamily: 'Arial, sans-serif' } });

  // ── Element update ────────────────────────────────────────────────────────

  const handleUpdateElement = useCallback((id: string, updates: any) => {
    const pageId = findPageOfElement(pages, id);
    if (!pageId) return;
    setPages(prev => updatePageElements(prev, pageId, els =>
      els.map(element => {
        if (element.id !== id) return element;
        const updated: any = { ...element };
        if (updates.position)  updated.position  = { ...updated.position, ...updates.position };
        if (updates.style && 'style' in updated) updated.style = { ...updated.style, ...updates.style };
        if ('content'     in updates && 'content'    in updated) updated.content     = updates.content;
        if ('src'         in updates && 'src'        in updated) updated.src         = updates.src;
        if ('orientation' in updates) updated.orientation  = updates.orientation;
        if ('count'       in updates) updated.count        = updates.count;
        if ('options'     in updates) updated.options      = updates.options;
        if ('shape'       in updates) updated.shape        = updates.shape;
        if ('value'       in updates && 'value'  in updated) updated.value  = updates.value;
        if ('time'        in updates && 'time'   in updated) updated.time   = updates.time;
        if ('includeTime' in updates) updated.includeTime  = updates.includeTime;
        if ('format'      in updates) updated.format       = updates.format;
        if ('pageNumber'  in updates) updated.pageNumber   = updates.pageNumber;
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
    if (selectedElementId === id)               setSelectedElementId(null);
    if (layoutTableCellSelection?.tableId === id) setLayoutTableCellSelection(null);
    if (layoutTableRange?.tableId         === id) setLayoutTableRange(null);
  };

  const clearAllSelections = () => {
    setSelectedElementId(null);
    setSelectedPageBreakId(null);
    setSelectedBoundary(null);
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
    const doc  = createTemplateDocument(pages, name, templateMeta);
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
    if (templateMeta.name) doSave(templateMeta.name);
    else setShowSaveModal(true);
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
          doc = raw;
        } else if (Array.isArray(raw.elements)) {
          doc = migrateV1(raw);
        } else {
          alert('Invalid template file.');
          return;
        }
        const cleanPages: CanvasPage[] = doc.pages.map((p: CanvasPage) =>
          ensurePageDefaults({
            ...p,
            elements: p.elements.filter((el: any) => !isLegacyCanvasTable(el)),
          })
        );
        setPages(cleanPages);
        setTemplateMeta(doc.meta || {});
        setSelectedElementId(null);
        setSelectedPageBreakId(null);
        setIr(null);
        setFieldMapping({});
        setTableCollectionBindings({});
        setCollectionMappings({});
        setPreviewRowIndex(0);
        setExportMode('single');
        setBulkDriverCollectionKey('');
        setBulkFieldMapping({});
        setBulkFileNameTemplate('document-{{index}}.pdf');
        setActivePageId(cleanPages[0]?.pageId || 'page-1');
      } catch {
        alert('Error reading template file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Data upload confirm ───────────────────────────────────────────────────

  const handleDataConfirm = (
    doc:      CanonicalDocument,
    fm:       FieldMapping,
    bindings: TableCollectionBindings,
    colMaps:  CollectionMappings,
  ) => {
    setIr(doc);
    setFieldMapping(fm);
    setTableCollectionBindings(bindings);
    setCollectionMappings(colMaps);
    setPreviewRowIndex(0);
    setBulkFileNameTemplate('document-{{index}}.pdf');
    setUploadPanelOpen(false);
  };

  const handleClearData = () => {
    setIr(null);
    setFieldMapping({});
    setTableCollectionBindings({});
    setCollectionMappings({});
    setPreviewRowIndex(0);
    setExportMode('single');
    setBulkDriverCollectionKey('');
    setBulkFieldMapping({});
    setBulkFileNameTemplate('document-{{index}}.pdf');
  };

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
    if (exportMode === 'bulk' && !ir) {
      alert('Upload data before running a bulk export.');
      return;
    }
    if (exportMode === 'bulk' && (!bulkDriverCollectionKey || bulkTotalRows === 0)) {
      alert('Choose a collection with rows for bulk export.');
      return;
    }

    // Warn about missing bindings but don't block
    if (ir) {
      const validation = validateBindings(
        allElements as unknown[],
        previewIr ?? ir,
        exportMode === 'bulk' ? effectiveFieldMapping : fieldMapping,
      );
      if (!validation.valid) {
        console.warn('[export] missing bindings:', validation);
      }
    }

    try {
      setIsExporting(true);
      setExportStatus(
        exportMode === 'bulk'
          ? `Generating ${bulkTotalRows} PDF${bulkTotalRows !== 1 ? 's' : ''} into a ZIP…`
          : totalRows > 0
          ? `Generating document with ${totalRows} record${totalRows !== 1 ? 's' : ''}…`
          : 'Generating document…'
      );

      // Use an empty IR if no data has been uploaded — the renderer handles it
      const exportIr: CanonicalDocument = ir ?? { fields: {}, collections: {} };
      const outputFileName = `document-${Date.now()}`;
      const exportPages = pages.map(p => ({
        pageId:                   p.pageId,
        label:                    p.label,
        templateElements:         p.elements,
        header:                   p.header,
        footer:                   p.footer,
        fieldMapping:             exportMode === 'bulk' ? effectiveFieldMapping : fieldMapping,
        tableCollectionBindings,
        collectionMappings,
      }));

      if (exportMode === 'bulk') {
        const blob = await generateBulkDocuments({
          pages: exportPages,
          ir: exportIr,
          outputFileName,
          bulk: {
            driverCollectionKey: bulkDriverCollectionKey,
            fileNameTemplate:   bulkFileNameTemplate,
            zipFileName:        `${outputFileName}.zip`,
          },
        });

        downloadBlob(blob, `${outputFileName}.zip`);
      } else {
        const blob = await generateDocument({
          pages: exportPages,
          ir:             exportIr,
          outputFileName,
        });

        downloadBlob(blob, `${outputFileName}.pdf`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
      setExportStatus(null);
    }
  };

  // ── Drag ──────────────────────────────────────────────────────────────────

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

  // ── Selected element (from original pages, not preview) ───────────────────

  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null;
    for (const p of pages) {
      const el = p.elements.find(e => e.id === selectedElementId);
      if (el) return el;
    }
    return null;
  }, [pages, selectedElementId]);

  // ── Render elements ───────────────────────────────────────────────────────

  const renderElements = (pageElements: CanvasElement[], pageId: string) =>
    pageElements.map(element => {
      const isSelected = element.id === selectedElementId;
      const select     = () => handleSelectElement(element.id, pageId);

      if (element.type === 'text') {
        const displayContent = element.pageNumber?.enabled
          ? pageNumberPreviewLabel(element)
          : element.content;
        return (
          <TextElement
            key={element.id} id={element.id} content={displayContent}
            position={element.position} style={element.style}
            onUpdate={handleUpdateText} isSelected={isSelected} onSelect={select}
            onResize={(id, fontSize) =>
              handleUpdateElement(id, { style: { ...element.style, fontSize } })
            }
          />
        );
      }

      if (element.type === 'paragraph') return (
        <ParagraphElement
          key={element.id} id={element.id} content={element.content}
          position={element.position} style={element.style}
          onUpdate={handleUpdateParagraph} isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'radio') return (
        <RadioElement
          key={element.id} id={element.id} options={element.options}
          selected={element.selected} orientation={element.orientation as any}
          position={element.position}
          onSelect={(id, opt) => handleUpdateRadio(id, { selected: opt })}
          onUpdate={handleUpdateRadio} onElementSelect={select}
        />
      );

      if (element.type === 'checkbox') return (
        <CheckboxElement
          key={element.id} id={element.id} count={element.count}
          checkedValues={element.checkedValues} orientation={element.orientation as any}
          position={element.position}
          onUpdate={handleUpdateCheckbox} onElementSelect={select}
        />
      );

      if (element.type === 'table' && isLayoutTable(element)) {
        const tableEl = element as LayoutTableModel;
        return (
          <LayoutTableElement
            key={tableEl.id} element={tableEl}
            isSelected={tableEl.id === selectedElementId}
            onTableChromeSelect={() => {
              handleSelectElement(tableEl.id, pageId);
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
              handleSelectElement(tableId, pageId);
              setLayoutTableCellSelection({ tableId, rowIndex, colIndex });
            }}
          />
        );
      }

      if (element.type === 'image') return (
        <ImageElement
          key={element.id} id={element.id} src={element.src}
          position={element.position} style={element.style}
          onUpdate={handleUpdateImage}
          onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...element.style, ...s } })}
          isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'line') return (
        <LineElement
          key={element.id} id={element.id} position={element.position} style={element.style}
          onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...element.style, ...s } })}
          onUpdatePosition={(id, p) => handleUpdateElement(id, { position: p })}
          isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'box') return (
        <BoxElement
          key={element.id} id={element.id} position={element.position}
          shape={(element as any).shape} style={element.style}
          onUpdateStyle={(id, s) => handleUpdateElement(id, { style: { ...element.style, ...s } })}
          onUpdatePosition={(id, p) => handleUpdateElement(id, { position: p })}
          isSelected={isSelected} onSelect={select}
        />
      );

      if (element.type === 'date') return (
        <DateElement
          key={element.id} id={element.id} value={element.value} time={element.time}
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

        {/* Toolbar */}
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

        {/* Upload panel */}
        {uploadPanelOpen && (
          <div className="upload-panel-backdrop">
            <UploadData
              staticPlaceholders={staticPlaceholders}
              tables={tableInfos}
              onClose={() => setUploadPanelOpen(false)}
              onConfirm={handleDataConfirm}
            />
          </div>
        )}

        {/* Data banner */}
        {ir && (
          <div className="batch-export-controls">
            <div className="batch-export-summary">
              <span>
                {exportMode === 'bulk'
                  ? `${bulkTotalRows} bulk PDF${bulkTotalRows !== 1 ? 's' : ''}`
                  : `${totalRows} record${totalRows !== 1 ? 's' : ''} bound`}
              </span>
              {previewTotalRows > 1 && (
                <span className="preview-label">
                  &nbsp;— previewing row {previewRowIndex + 1} of {previewTotalRows}
                </span>
              )}
            </div>
            <div className="batch-export-actions">
              <label className="batch-control">
                <span>Export</span>
                <select
                  value={exportMode}
                  onChange={e => {
                    setExportMode(e.target.value as ExportMode);
                    setPreviewRowIndex(0);
                  }}
                >
                  <option value="single">Single PDF</option>
                  <option value="bulk" disabled={collectionKeys.length === 0}>Bulk PDFs</option>
                </select>
              </label>

              {exportMode === 'bulk' && (
                <>
                  <label className="batch-control">
                    <span>Records</span>
                    <select
                      value={bulkDriverCollectionKey}
                      onChange={e => {
                        setBulkDriverCollectionKey(e.target.value);
                        setPreviewRowIndex(0);
                      }}
                    >
                      {collectionKeys.map(k => (
                        <option key={k} value={k}>
                          {k} ({ir.collections[k].rows.length})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="batch-control batch-control--wide">
                    <span>File names</span>
                    <input
                      type="text"
                      value={bulkFileNameTemplate}
                      onChange={e => setBulkFileNameTemplate(e.target.value)}
                    />
                  </label>
                </>
              )}

              {previewTotalRows > 1 && (
                <div className="preview-nav">
                  <button
                    type="button" className="preview-nav-btn"
                    onClick={() => setPreviewRowIndex(i => Math.max(0, i - 1))}
                    disabled={previewRowIndex === 0}
                  >‹</button>
                  <span className="preview-nav-count">
                    {previewRowIndex + 1} / {previewTotalRows}
                  </span>
                  <button
                    type="button" className="preview-nav-btn"
                    onClick={() => setPreviewRowIndex(i => Math.min(previewTotalRows - 1, i + 1))}
                    disabled={previewRowIndex === previewTotalRows - 1}
                  >›</button>
                </div>
              )}
              <button type="button" className="clear-button" onClick={handleClearData}>
                Clear Data
              </button>
            </div>

            {exportMode === 'bulk' && staticPlaceholders.length > 0 && bulkDriverCollection && (
              <div className="bulk-field-map">
                {staticPlaceholders.map(ph => (
                  <label key={ph} className="bulk-field-map-row">
                    <span title={ph}>{ph}</span>
                    <select
                      value={bulkFieldMapping[ph] ?? ''}
                      onChange={e =>
                        setBulkFieldMapping(prev => ({ ...prev, [ph]: e.target.value }))
                      }
                    >
                      <option value="">same name</option>
                      {bulkDriverCollection.columns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Export overlay */}
        {isExporting && (
          <div className="export-overlay">
            <div className="export-overlay-card">
              <p>{exportStatus || 'Generating…'}</p>
            </div>
          </div>
        )}

        {/* Save modal */}
        {showSaveModal && (
          <SaveTemplateModal
            initialName={templateMeta.name || ''}
            onConfirm={name => { setShowSaveModal(false); doSave(name); }}
            onCancel={() => setShowSaveModal(false)}
          />
        )}

        {/* Canvas pages */}
        <div className="canvas-pages-wrapper">
          {previewPages.map((page, pageIdx) => (
            <div key={page.pageId} className="canvas-page-block">

              <div className="canvas-page-label">
                {page.label || `Page ${pageIdx + 1}`}
              </div>

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

                {/* Header boundary */}
                <BoundaryLine
                  type="header"
                  config={page.header}
                  isSelected={selectedBoundary?.pageId === page.pageId && selectedBoundary?.type === 'header'}
                  canvasH={1123}
                  onSelect={() => { clearAllSelections(); setSelectedBoundary({ pageId: page.pageId, type: 'header' }); setActivePageId(page.pageId); }}
                  onDeselect={() => setSelectedBoundary(null)}
                  onChange={h => handleUpdatePageHeader(page.pageId, h as HeaderConfig)}
                  onDelete={() => handleDeleteBoundary(page.pageId, 'header')}
                />

                {/* Footer boundary */}
                <BoundaryLine
                  type="footer"
                  config={page.footer}
                  isSelected={selectedBoundary?.pageId === page.pageId && selectedBoundary?.type === 'footer'}
                  canvasH={1123}
                  onSelect={() => { clearAllSelections(); setSelectedBoundary({ pageId: page.pageId, type: 'footer' }); setActivePageId(page.pageId); }}
                  onDeselect={() => setSelectedBoundary(null)}
                  onChange={f => handleUpdatePageFooter(page.pageId, f as FooterConfig)}
                  onDelete={() => handleDeleteBoundary(page.pageId, 'footer')}
                  onAddPageNumber={atY => handleAddPageNumber(atY, page.pageId)}
                />

                {/* Header zone shading */}
                {page.header.enabled && (
                  <div
                    className="canvas-zone canvas-zone--header"
                    style={{
                      height:          page.header.boundaryY,
                      backgroundColor: page.header.style.backgroundColor !== 'transparent'
                        ? adjustColorOpacity(page.header.style.backgroundColor, page.header.style.opacity ?? 1)
                        : 'rgba(99,102,241,0.04)',
                      borderBottom:    page.header.style.borderWidth > 0
                        ? `${page.header.style.borderWidth}px solid ${page.header.style.borderColor}`
                        : undefined,
                    }}
                  />
                )}

                {/* Footer zone shading */}
                {page.footer.enabled && (
                  <div
                    className="canvas-zone canvas-zone--footer"
                    style={{
                      top:             page.footer.boundaryY,
                      height:          1123 - page.footer.boundaryY,
                      backgroundColor: page.footer.style.backgroundColor !== 'transparent'
                        ? adjustColorOpacity(page.footer.style.backgroundColor, page.footer.style.opacity ?? 1)
                        : 'rgba(99,102,241,0.04)',
                      borderTop:       page.footer.style.borderWidth > 0
                        ? `${page.footer.style.borderWidth}px solid ${page.footer.style.borderColor}`
                        : undefined,
                    }}
                  />
                )}
              </div>

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

        {/* Properties panel */}
        <PropertiesPanel
          selectedElement={selectedElement as any}
          onUpdate={handleUpdateElement}
          layoutTableActiveCell={layoutTableCellSelection}
          layoutTableRange={layoutTableRange}
          activePageFooter={pages.find(p => p.pageId === activePageId)?.footer ?? null}
        />

      </div>
    </DndContext>
  );
}

export default TemplateCanvas;
