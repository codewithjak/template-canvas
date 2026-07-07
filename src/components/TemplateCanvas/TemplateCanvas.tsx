/**
 * TemplateCanvas.tsx
 * Multi-page canvas — rewritten against CanonicalDocument IR.
 *
 * CHANGES FROM PREVIOUS VERSION
 * ──────────────────────────────
 * 1. RuntimeDataStructure integrated — rds state added alongside ir.
 *    handleDataConfirm accepts optional 5th param rds? from UploadData v3.
 *    Falls back to toRuntimeDataStructure() adapter when not provided.
 *
 * 2. handleExportDocument uses buildRenderContext() when rds is available.
 *    Scoping happens client-side; server receives a pre-scoped IR at rowIndex 0.
 *    Fallback to original rowIndex + driverCollectionKey + relatedCollections
 *    params when rds is not yet available.
 *
 * 3. handleClearData clears rds alongside ir.
 *
 * 4. BulkExportPanel receives rds prop (optional, backward-compatible).
 *
 * 5. handleExportDocument now scopes single PDF to previewRowIndex via
 *    driverCollectionKey + relatedCollections — fixes the bug where all
 *    collection rows were rendered into one document. (unchanged from prev)
 *
 * 6. detectRelationships + buildRelatedCollectionsConfig imported directly
 *    so driver detection is available without going through DataStructureViewer.
 *    (unchanged from prev)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';

import Toolbar             from './Toolbar';
import UploadData          from './UploadData';
import DataStructureViewer from './DataStructureViewer';
import PageBreakDivider    from './PageBreakDivider';
import BoundaryLine        from './BoundaryLine';
import SaveTemplateModal   from './SaveTemplateModal';
import TemplatesLibraryModal from './TemplatesLibraryModal';
import RebuildWithAiModal  from './RebuildWithAiModal';
import PropertiesPanel     from './PropertiesPanel';
import TextFormatBar       from './TextFormatBar';
import ElementFormatBar    from './ElementFormatBar';
import CanvasStatusBar     from './CanvasStatusBar';
import PageRulers from './PageRulers';
import { BulkExportPanel } from './BulkExportPanel';
import { usePlan } from '../../plan/PlanProvider';
import CloudStatusToast from './CloudStatusToast';
import BatchExportBar from './BatchExportBar';
import CanvasElementView from './CanvasElementView';
import type { PageSizeConfig } from '../../types/canvas';
import { defaultPageSize, PAGE_SIZE_PRESETS, customPageSize } from '../../types/canvas';

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
} from '../../services/mappingEngine';
import { generateDocument, sendDocument, extFromBlob } from '../../services/dataSourceService';
import { notify, t } from '../../notify';
import type { GenerateDocumentParams, DeliverySpec, SendDocumentResult } from '../../services/dataSourceService';
import SendDocumentModal from './SendDocumentModal';
import type { PdfImportResult } from '../../services/pdfImportService';
import {
  createTemplate as createCloudTemplate,
  updateTemplate as updateCloudTemplate,
  type TemplateRecord,
} from '../../services/templatesRepo';
import { type BuiltinTemplate } from '../../templates/registry';
import {
  detectRelationships,
  buildRelatedCollectionsConfig,
} from '../../utils/relationshipDetector';

// ── NEW: RuntimeDataStructure imports ────────────────────────────────────────
import type { RuntimeDataStructure } from '../../types/runtimeDataStructure';
import {
  buildRenderContext,
  toRuntimeDataStructure,
} from '../../types/runtimeDataStructure';
// ────────────────────────────────────────────────────────────────────────────

import {
  createDefaultLayoutTable,
  isLayoutTable,
  isLegacyCanvasTable,
} from '../../model/layoutTable';

import './TemplateCanvas.css';

import {
  adjustColorOpacity,
  findPageOfElement,
  getElementRulerSelection,
  maxCollectionRows,
  removeEmptyMappings,
  updatePageElements,
} from './templateCanvasHelpers';
import {
  createBarcodeElement,
  createBoxElement,
  createChartElement,
  createCheckboxElement,
  createDateElement,
  createEllipseElement,
  createImageElement,
  createLineElement,
  createParagraphElement,
  createRadioElement,
  createRectangleElement,
  createSignatureElement,
  createTextElement,
  createTriangleElement,
  createWatermarkElement,
} from './elementFactories';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function TemplateCanvas() {

  // ── Plan / entitlements ─────────────────────────────────────────────────────
  // UI-side gating only; the backend re-checks every export and save limit.
  const { can, atLimit, promptUpgrade, refresh: refreshPlan } = usePlan();

  // ── Core state ────────────────────────────────────────────────────────────

  const [pages, setPages] = useState<CanvasPage[]>([
    createPage({ pageId: 'page-1', label: 'Page 1' }),
  ]);
  const [templateMeta, setTemplateMeta] = useState<Partial<TemplateMeta>>({});
  const [pageSize, setPageSize] = useState<PageSizeConfig>(defaultPageSize());
  const [exportFormat, setExportFormat] = useState<'pdf' | 'zpl' | 'png' | 'jpeg'>('pdf');
  const [showPageRulers, setShowPageRulers] = useState(false);

  const handlePageSizeChange = useCallback((preset: string) => {
    const p = PAGE_SIZE_PRESETS[preset];
    if (p) {
      setPageSize({
        preset,
        canvasWidth:  p.canvasWidth,
        canvasHeight: p.canvasHeight,
        pdfWidth:     p.pdfWidth,
        pdfHeight:    p.pdfHeight,
        widthInches:  p.widthInches,
        heightInches: p.heightInches,
      });
      // ZPL is only for label sizes — auto-revert to PDF for document sizes
      if (preset === 'a4' || preset === 'letter') {
        setExportFormat('pdf');
      }
    }
  }, []);

  const handleCustomPageSize = useCallback((widthInches: number, heightInches: number) => {
    setPageSize(customPageSize(widthInches, heightInches));
  }, []);

  // ── Selection ─────────────────────────────────────────────────────────────

  const [selectedElementId,    setSelectedElementId]   = useState<string | null>(null);
  const [activePageId,         setActivePageId]         = useState<string>('page-1');
  const [selectedPageBreakId,  setSelectedPageBreakId]  = useState<string | null>(null);
  const [selectedBoundary,     setSelectedBoundary]     = useState<{
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
  // ── NEW: RuntimeDataStructure state ──────────────────────────────────────
  const [rds,                     setRds]                     = useState<RuntimeDataStructure | null>(null);
  // ─────────────────────────────────────────────────────────────────────────
  const [fieldMapping,            setFieldMapping]            = useState<FieldMapping>({});
  const [tableCollectionBindings, setTableCollectionBindings] = useState<TableCollectionBindings>({});
  const [collectionMappings,      setCollectionMappings]      = useState<CollectionMappings>({});
  const [previewRowIndex,         setPreviewRowIndex]         = useState(0);
  const [uploadPanelOpen,         setUploadPanelOpen]         = useState(false);
  const [showDataStructureViewer, setShowDataStructureViewer] = useState(false);

  // ── Bulk export state ─────────────────────────────────────────────────────

  const [bulkPanelOpen,     setBulkPanelOpen]     = useState(false);
  const [sendPanelOpen,     setSendPanelOpen]     = useState(false);
  const [savedGlobalFields, setSavedGlobalFields] = useState<Record<string, string>>({});

  // ── Single export state ───────────────────────────────────────────────────

  const [isExporting,  setIsExporting]  = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // ── Save modal ────────────────────────────────────────────────────────────

  const [showSaveModal, setShowSaveModal] = useState(false);

  // ── Cloud persistence (Supabase, team-scoped) ──────────────────────────────

  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [templatesLibraryOpen, setTemplatesLibraryOpen] = useState(false);
  const [rebuildAiOpen, setRebuildAiOpen] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

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

  // ── Relationship detection (memoised, used by single export + bulk) ───────
  // NOTE: This is now a fallback only. When UploadData v3 is used,
  // relationships are detected once during upload and stored in rds.
  // This memo is only needed for backward compat (loaded templates, etc.)

  const relationships = useMemo(
    () => (ir ? detectRelationships(ir) : {}),
    [ir],
  );

  const driverCollectionKey = useMemo((): string | undefined => {
    // Prefer rds.executionPlan.driverKey when available — already computed
    // during upload, no need to re-run detection.
    if (rds?.executionPlan.driverKey) return rds.executionPlan.driverKey;

    if (!ir) return undefined;
    const withRelated = Object.entries(relationships).find(
      ([, rel]) => rel.relatedCollections.length > 0
    );
    if (withRelated) return withRelated[0];
    const keys = Object.keys(ir.collections);
    return keys.length > 0 ? keys[0] : undefined;
  }, [rds, ir, relationships]);

  const relatedCollectionsConfig = useMemo(
    () => driverCollectionKey
      ? buildRelatedCollectionsConfig(driverCollectionKey, relationships)
      : {},
    [driverCollectionKey, relationships],
  );

  // ── Preview pages ─────────────────────────────────────────────────────────

  const previewPages = useMemo((): CanvasPage[] => {
    if (!ir) return pages;
    return pages.map(p => ({
      ...p,
      elements: mapTemplateForPreview(
        p.elements as unknown[],
        ir,
        fieldMapping,
        tableCollectionBindings,
        collectionMappings,
        previewRowIndex,
      ) as CanvasElement[],
    }));
  }, [pages, ir, fieldMapping, tableCollectionBindings, collectionMappings, previewRowIndex]);

  useEffect(() => {
    const maxIndex = Math.max(0, totalRows - 1);
    setPreviewRowIndex(i => Math.min(i, maxIndex));
  }, [totalRows]);

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
    if (selectedElementId && findPageOfElement(pages, selectedElementId) === pageId) {
      setSelectedElementId(null);
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

  const handleAddText      = () => addEl(createTextElement());
  const handleAddParagraph = () => addEl(createParagraphElement());
  const handleAddTable     = () => addEl(createDefaultLayoutTable('table'));
  const handleAddImage     = () => addEl(createImageElement());
  const handleAddLine      = () => addEl(createLineElement());
  const handleAddBox       = () => addEl(createBoxElement());
  const handleAddRectangle = () => addEl(createRectangleElement());
  const handleAddTriangle  = () => addEl(createTriangleElement());
  const handleAddEllipse   = () => addEl(createEllipseElement());
  const handleAddRadio     = () => addEl(createRadioElement());
  const handleAddCheckbox  = () => addEl(createCheckboxElement());
  const handleAddDate      = () => addEl(createDateElement());
  const handleAddBarcode   = () => addEl(createBarcodeElement());
  const handleAddChart     = () => addEl(createChartElement());

  // Watermark and signature also jump the selection to the new element.
  const handleAddWatermark = () => {
    const el = createWatermarkElement();
    addEl(el);
    setSelectedPageBreakId(null); setSelectedBoundary(null);
    setTimeout(() => setSelectedElementId(el.id), 0);
  };
  const handleAddSignature = () => {
    const el = createSignatureElement();
    addEl(el);
    setSelectedPageBreakId(null); setSelectedBoundary(null);
    setTimeout(() => setSelectedElementId(el.id), 0);
  };

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
        if ('orientation' in updates) updated.orientation = updates.orientation;
        if ('count'       in updates) updated.count       = updates.count;
        if ('options'     in updates) updated.options     = updates.options;
        if ('shape'       in updates) updated.shape       = updates.shape;
        if ('value'       in updates && 'value'  in updated) updated.value  = updates.value;
        if ('time'        in updates && 'time'   in updated) updated.time   = updates.time;
        if ('includeTime' in updates) updated.includeTime = updates.includeTime;
        if ('format'      in updates) updated.format      = updates.format;
        if ('pageNumber'  in updates) updated.pageNumber  = updates.pageNumber;
        if ('barcode'     in updates) updated.barcode     = updates.barcode;
        if ('chart'       in updates) updated.chart       = updates.chart;
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
    if (selectedElementId === id)                 setSelectedElementId(null);
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

  // Persist the current canvas to Supabase (create on first save, update after).
  const persistToCloud = async (name: string) => {
    const doc = createTemplateDocument(pages, name, templateMeta, pageSize);
    const body = {
      ...doc,
      meta: { ...doc.meta, globalFields: savedGlobalFields },
    };
    setTemplateMeta(doc.meta);
    setCloudStatus('saving');
    try {
      if (currentTemplateId) {
        await updateCloudTemplate(currentTemplateId, name, body);
      } else {
        const id = await createCloudTemplate(name, body);
        setCurrentTemplateId(id);
        void refreshPlan(); // a new template changed the team's template count
      }
      setCloudStatus('saved');
      window.setTimeout(() => setCloudStatus('idle'), 2500);
    } catch (err) {
      setCloudStatus('error');
      notify.error({ key: 'template.saveFailed', vars: { error: err instanceof Error ? err.message : String(err) } });
    }
  };

  const handleSaveTemplate = () => {
    // Saving a NEW template is what consumes a template slot; updates to an
    // already-saved one are always allowed even at the limit.
    if (!currentTemplateId && atLimit('templates')) {
      promptUpgrade({
        title: 'Template limit reached',
        message:
          "You've used all the templates on your plan. Upgrade for unlimited templates, " +
          'or delete one to free up a slot.',
      });
      return;
    }
    if (templateMeta.name) void persistToCloud(templateMeta.name);
    else setShowSaveModal(true);
  };

  // ── Load ──────────────────────────────────────────────────────────────────

  // Apply a parsed v2.0 template document to canvas state. Shared by file
  // import and cloud open.
  const applyDocument = (doc: any) => {
    const cleanPages: CanvasPage[] = doc.pages.map((p: CanvasPage) =>
      ensurePageDefaults({
        ...p,
        elements: p.elements.filter((el: any) => !isLegacyCanvasTable(el)),
      })
    );
    setPages(cleanPages);
    setTemplateMeta(doc.meta || {});
    setPageSize(doc.pageSize ? doc.pageSize : defaultPageSize());
    setSavedGlobalFields(doc.meta?.globalFields ?? {});
    setSelectedElementId(null);
    setSelectedPageBreakId(null);
    setIr(null);
    setRds(null);
    setFieldMapping({});
    setTableCollectionBindings({});
    setCollectionMappings({});
    setPreviewRowIndex(0);
    setBulkPanelOpen(false);
    setActivePageId(cleanPages[0]?.pageId || 'page-1');
  };

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
          notify.error('template.invalidFile');
          return;
        }
        applyDocument(doc);
        // Imported from a file, not linked to a cloud row yet.
        setCurrentTemplateId(null);
      } catch {
        notify.error('template.readError');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Apply a PDF rebuilt by Mapdoc AI into the editor. The RebuildWithAiModal owns
  // the upload + progress + fidelity-report UI and the importPdfAsTemplate call;
  // this just adopts the finished TOKENIZED template (values → {{placeholders}},
  // tables → token rows + bindings) through the same path as a file/cloud open.
  const handleApplyRebuiltPdf = (result: PdfImportResult) => {
    applyDocument(result.document);
    setCurrentTemplateId(null);
    setRebuildAiOpen(false);
    void refreshPlan(); // the rebuild counted against the monthly AI quota
  };

  // Open a template fetched from Supabase.
  const handleOpenCloudTemplate = (record: TemplateRecord) => {
    applyDocument(record.body_json);
    setCurrentTemplateId(record.id);
    setTemplatesLibraryOpen(false);
  };

  // Open a bundled built-in template. The template ships tokenized
  // ({{placeholders}}) plus a matching sample-data file; we resolve the tokens
  // against that sample data and BAKE the values into the canvas content, so it
  // opens looking like a finished document the user can click into and edit
  // directly (resume-template style). Loads as a fresh UNSAVED copy
  // (currentTemplateId = null) so Save creates the user's own row and the
  // shipped original is never modified.
  const handleOpenBuiltin = (template: BuiltinTemplate) => {
    applyDocument(template.doc);
    setCurrentTemplateId(null);
    setTemplatesLibraryOpen(false);

    // Load the template's bundled sample data through the SAME path a data
    // upload uses (handleDataConfirm), so it renders filled-in on the canvas
    // and exports correctly — no engine changes. How the data renders is
    // declared by the template's own meta, not decided here.
    const mode   = template.doc.meta.executionMode ?? 'single';
    const intent = mode === 'single' ? 'flat' : mode;
    const rds    = toRuntimeDataStructure(template.data, intent, mode);
    handleDataConfirm(template.data, {}, {}, {}, rds);
  };

  // ── Data upload confirm ───────────────────────────────────────────────────
  //
  // ── CHANGE 3: Accept optional 5th param rds? from UploadData v3.
  //    Falls back to toRuntimeDataStructure() adapter when not provided
  //    so all existing behaviour is preserved.

  const handleDataConfirm = (
    doc:          CanonicalDocument,
    fm:           FieldMapping,
    bindings:     TableCollectionBindings,
    colMaps:      CollectionMappings,
    incomingRds?: RuntimeDataStructure,
  ) => {
    setIr(doc);
    setFieldMapping(fm);
    setTableCollectionBindings(bindings);
    setCollectionMappings(colMaps);
    setPreviewRowIndex(0);
    setUploadPanelOpen(false);

    if (incomingRds) {
      // UploadData v3 — full RDS with relationship approvals already applied
      setRds(incomingRds);
    } else {
      // Fallback: build RDS from scratch using the migration adapter.
      // Detect driver key the same way BulkExportPanel does.
      const rels        = detectRelationships(doc);
      const withRelated = Object.entries(rels).find(
        ([, rel]) => rel.relatedCollections.length > 0,
      );
      const driverKey = withRelated?.[0] ?? Object.keys(doc.collections)[0];
      setRds(toRuntimeDataStructure(doc, 'unknown', 'relational', driverKey));
    }
  };

  // ── CHANGE 4: Clear rds alongside ir ─────────────────────────────────────

  const handleClearData = () => {
    setIr(null);
    setRds(null); // ── NEW
    setFieldMapping({});
    setTableCollectionBindings({});
    setCollectionMappings({});
    setPreviewRowIndex(0);
    setBulkPanelOpen(false);
    setShowDataStructureViewer(false);
  };

  // ── Single export ─────────────────────────────────────────────────────────
  //
  // ── CHANGE 5: When rds is available, use buildRenderContext() to scope
  //    the IR client-side. The server receives a pre-scoped IR at rowIndex 0
  //    and needs no relationship params. This is the correct implementation
  //    of the renderer-isolation guarantee.
  //
  //    Fallback path (no rds): unchanged from previous version — passes
  //    rowIndex + driverCollectionKey + relatedCollections to the server.

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  /** Build the export request params for the current preview row (rds-aware). */
  const buildExportParams = (): GenerateDocumentParams => {
    const cleanFieldMapping = removeEmptyMappings(fieldMapping);

    if (ir) {
      const validation = validateBindings(allElements as unknown[], ir, cleanFieldMapping);
      if (!validation.valid) console.warn('[export] missing bindings:', validation);
    }

    const exportPages = pages.map(p => ({
      pageId:                  p.pageId,
      label:                   p.label,
      templateElements:        p.elements,
      header:                  p.header,
      footer:                  p.footer,
      fieldMapping:            cleanFieldMapping,
      tableCollectionBindings,
      collectionMappings,
    }));

    const outputFileName = `document-${Date.now()}`;

    // RDS path — scope client-side, send a pre-scoped IR (rowIndex 0).
    if (rds) {
      const ctx = buildRenderContext(rds, previewRowIndex);
      const scopedIr: CanonicalDocument = {
        fields: ctx.fields,
        collections: Object.fromEntries(
          Object.entries(ctx.collections).map(([k, c]) => [
            k,
            { rows: c.rows as Record<string, string>[], columns: c.columns },
          ]),
        ),
      };
      return {
        pages: exportPages, ir: scopedIr, outputFileName,
        rowIndex: 0, driverCollectionKey: undefined, relatedCollections: {},
        pageSize, format: exportFormat,
      };
    }

    // Fallback — original row-scoping via server params.
    const exportIr: CanonicalDocument = ir ?? { fields: {}, collections: {} };
    return {
      pages: exportPages, ir: exportIr, outputFileName,
      rowIndex: previewRowIndex, driverCollectionKey, relatedCollections: relatedCollectionsConfig,
      pageSize, format: exportFormat,
    };
  };

  const handleExportDocument = async () => {
    if (allElements.length === 0) { notify.warning('export.nothingToExport'); return; }
    try {
      setIsExporting(true);
      setExportStatus(
        totalRows > 0
          ? `Generating document — record ${previewRowIndex + 1} of ${totalRows}…`
          : 'Generating document…'
      );
      const params = buildExportParams();
      const blob   = await generateDocument(params);
      downloadBlob(blob, `${params.outputFileName}.${extFromBlob(blob, exportFormat)}`);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : t('export.failed'));
    } finally {
      setIsExporting(false);
      setExportStatus(null);
      void refreshPlan(); // reflect the export against the monthly cap
    }
  };

  /** Render the current export and email it (no download). Used by the send modal. */
  const handleSendDocument = async (delivery: DeliverySpec): Promise<SendDocumentResult> => {
    if (allElements.length === 0) throw new Error('No template to send.');
    try {
      return await sendDocument(buildExportParams(), delivery);
    } finally {
      void refreshPlan(); // sending counts against the monthly cap too
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

  // ── Selected element ──────────────────────────────────────────────────────

  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null;
    for (const p of pages) {
      const el = p.elements.find(e => e.id === selectedElementId);
      if (el) return el;
    }
    return null;
  }, [pages, selectedElementId]);

  const selectedElementPageId = useMemo(
    () => selectedElementId ? findPageOfElement(pages, selectedElementId) : null,
    [pages, selectedElementId],
  );

  const selectedRulerSelection = useMemo(
    () => getElementRulerSelection(selectedElement),
    [selectedElement],
  );

  // ── Render elements ───────────────────────────────────────────────────────

  const renderElements = (pageElements: CanvasElement[], pageId: string) =>
    pageElements.map(element => (
      <CanvasElementView
        key={element.id}
        element={element}
        pageId={pageId}
        selectedElementId={selectedElementId}
        onUpdateElement={handleUpdateElement}
        onSelectElement={handleSelectElement}
        layoutTableCellSelection={layoutTableCellSelection}
        layoutTableRange={layoutTableRange}
        setLayoutTableCellSelection={setLayoutTableCellSelection}
        setLayoutTableRange={setLayoutTableRange}
      />
    ));

  // ── JSX ───────────────────────────────────────────────────────────────────

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
          onAddWatermark={handleAddWatermark}
          onAddSignature={handleAddSignature}
          onAddLine={handleAddLine}
          onAddBox={handleAddBox}
          onAddRectangle={handleAddRectangle}
          onAddTriangle={handleAddTriangle}
          onAddEllipse={handleAddEllipse}
          onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
          onSave={handleSaveTemplate}
          onOpenTemplates={() => setTemplatesLibraryOpen(true)}
          onLoad={handleLoadTemplate}
          onRebuildWithAi={() => {
            if (atLimit('aiBuildsThisMonth')) {
              promptUpgrade({
                title: 'AI rebuild limit reached',
                message: "You've used all your AI PDF→template rebuilds for this month. Upgrade for a higher monthly limit.",
              });
              return;
            }
            setRebuildAiOpen(true);
          }}
          onUpload={() => setUploadPanelOpen(true)}
          onExportPDF={handleExportDocument}
          onAddPage={handleAddPage}
          showRulers={showPageRulers}
          onToggleRulers={() => setShowPageRulers(v => !v)}
          hasSelection={!!selectedElementId}
          hasElements={allElements.length > 0}
          onAddBarcode={handleAddBarcode}
          onAddChart={handleAddChart}
          onPageSizeChange={handlePageSizeChange}
          onCustomPageSize={handleCustomPageSize}
          currentPageSize={pageSize.preset}
          customPageWidth={pageSize.widthInches}
          customPageHeight={pageSize.heightInches}
          exportFormat={exportFormat}
          onExportFormatChange={(format) => {
            if (format === 'zpl' && !can('zpl')) {
              promptUpgrade({
                capability: 'zpl',
                title: 'ZPL export is a Pro feature',
                message: 'Export ZPL for thermal and label printers on the Pro plan and above.',
              });
              return;
            }
            setExportFormat(format);
          }}
        />

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

        {showDataStructureViewer && ir && (
          <div className="upload-panel-backdrop">
            <DataStructureViewer
              ir={ir}
              onClose={() => setShowDataStructureViewer(false)}
              onConfirm={() => setShowDataStructureViewer(false)}
            />
          </div>
        )}

        {bulkPanelOpen && ir && (
          <BulkExportPanel
            ir={ir}
            rds={rds ?? undefined}
            pages={pages as any}
            fieldMapping={fieldMapping}
            tableCollectionBindings={tableCollectionBindings}
            collectionMappings={collectionMappings}
            savedGlobalFields={savedGlobalFields}
            onClose={() => setBulkPanelOpen(false)}
            onGlobalFieldsSave={fields => setSavedGlobalFields(fields)}
            pageSize={pageSize}
            exportFormat={exportFormat}
          />
        )}

        {ir && (
          <BatchExportBar
            isSingleMode={rds?.executionPlan.mode === 'single'}
            totalRows={totalRows}
            previewRowIndex={previewRowIndex}
            isExporting={isExporting}
            hasElements={allElements.length > 0}
            onPrevRow={() => setPreviewRowIndex(i => Math.max(0, i - 1))}
            onNextRow={() => setPreviewRowIndex(i => Math.min(totalRows - 1, i + 1))}
            onViewStructure={() => setShowDataStructureViewer(true)}
            onExport={handleExportDocument}
            onSendEmail={() => {
              if (!can('delivery')) {
                promptUpgrade({
                  capability: 'delivery',
                  title: 'Email delivery is a Pro feature',
                  message: 'Email your exports (with an optional response deadline) on the Pro plan and above.',
                });
                return;
              }
              setSendPanelOpen(true);
            }}
            onBulkExport={() => {
              if (!can('bulk')) {
                promptUpgrade({
                  capability: 'bulk',
                  title: 'Bulk generation is a Pro feature',
                  message: 'Generate one document per row from your whole dataset on the Pro plan and above.',
                });
                return;
              }
              setBulkPanelOpen(true);
            }}
            onClearData={handleClearData}
          />
        )}

        {isExporting && (
          <div className="export-overlay">
            <div className="export-overlay-card">
              <p>{exportStatus || 'Generating…'}</p>
            </div>
          </div>
        )}

        {showSaveModal && (
          <SaveTemplateModal
            initialName={templateMeta.name || ''}
            onConfirm={name => { setShowSaveModal(false); void persistToCloud(name); }}
            onCancel={() => setShowSaveModal(false)}
          />
        )}

        {sendPanelOpen && (
          <SendDocumentModal
            onClose={() => setSendPanelOpen(false)}
            onSend={handleSendDocument}
          />
        )}


        {templatesLibraryOpen && (
          <TemplatesLibraryModal
            currentTemplateId={currentTemplateId}
            onOpen={handleOpenCloudTemplate}
            onOpenBuiltin={handleOpenBuiltin}
            onClose={() => setTemplatesLibraryOpen(false)}
          />
        )}

        {rebuildAiOpen && (
          <RebuildWithAiModal
            onApply={handleApplyRebuiltPdf}
            onClose={() => setRebuildAiOpen(false)}
          />
        )}

        <CloudStatusToast status={cloudStatus} />

        <div className="canvas-pages-wrapper" style={{ width: pageSize.canvasWidth }}>
          {previewPages.map((page, pageIdx) => (
            <div key={page.pageId} className="canvas-page-block">
              <div className="canvas-page-label">
                {page.label || `Page ${pageIdx + 1}`}
              </div>

              <div
                className={`canvas-page-stage ${
                  showPageRulers && activePageId === page.pageId ? 'canvas-page-stage--with-rulers' : ''
                }`}
              >
                {showPageRulers && activePageId === page.pageId && (
                  <PageRulers
                    width={pageSize.canvasWidth} height={pageSize.canvasHeight}
                    selection={selectedElementPageId === page.pageId ? selectedRulerSelection : null}
                  />
                )}

                <div
                  className={`template-canvas ${activePageId === page.pageId ? 'template-canvas--active' : ''}`}
                  style={{ width: pageSize.canvasWidth, height: pageSize.canvasHeight }}
                  onClick={e => {
                    if (e.target === e.currentTarget) {
                      clearAllSelections();
                      setActivePageId(page.pageId);
                    }
                  }}
                >
                  {renderElements(page.elements, page.pageId)}

                  {page.elements.length === 0 && (
                    <div className="canvas-empty-hint">
                      <div className="canvas-empty-hint__title">This page is empty</div>
                      <div className="canvas-empty-hint__text">
                        Pick a tool from the rail on the right to add text, tables, images and more.
                      </div>
                    </div>
                  )}

                  <BoundaryLine
                    type="header"
                    config={page.header}
                    isSelected={selectedBoundary?.pageId === page.pageId && selectedBoundary?.type === 'header'}
                    canvasH={pageSize.canvasHeight}
                    onSelect={() => { clearAllSelections(); setSelectedBoundary({ pageId: page.pageId, type: 'header' }); setActivePageId(page.pageId); }}
                    onDeselect={() => setSelectedBoundary(null)}
                    onChange={h => handleUpdatePageHeader(page.pageId, h as HeaderConfig)}
                    onDelete={() => handleDeleteBoundary(page.pageId, 'header')}
                  />

                  <BoundaryLine
                    type="footer"
                    config={page.footer}
                    isSelected={selectedBoundary?.pageId === page.pageId && selectedBoundary?.type === 'footer'}
                    canvasH={pageSize.canvasHeight}
                    onSelect={() => { clearAllSelections(); setSelectedBoundary({ pageId: page.pageId, type: 'footer' }); setActivePageId(page.pageId); }}
                    onDeselect={() => setSelectedBoundary(null)}
                    onChange={f => handleUpdatePageFooter(page.pageId, f as FooterConfig)}
                    onDelete={() => handleDeleteBoundary(page.pageId, 'footer')}
                    onAddPageNumber={atY => handleAddPageNumber(atY, page.pageId)}
                  />

                  {page.header.enabled && (
                    <div
                      className="canvas-zone canvas-zone--header"
                      style={{
                        height: page.header.boundaryY,
                        backgroundColor: page.header.style.backgroundColor !== 'transparent'
                          ? adjustColorOpacity(page.header.style.backgroundColor, page.header.style.opacity ?? 1)
                          : 'rgba(99,102,241,0.04)',
                        borderBottom: page.header.style.borderWidth > 0
                          ? `${page.header.style.borderWidth}px solid ${page.header.style.borderColor}`
                          : undefined,
                      }}
                    />
                  )}

                  {page.footer.enabled && (
                    <div
                      className="canvas-zone canvas-zone--footer"
                      style={{
                        top: page.footer.boundaryY,
                        height: pageSize.canvasHeight - page.footer.boundaryY,
                        backgroundColor: page.footer.style.backgroundColor !== 'transparent'
                          ? adjustColorOpacity(page.footer.style.backgroundColor, page.footer.style.opacity ?? 1)
                          : 'rgba(99,102,241,0.04)',
                        borderTop: page.footer.style.borderWidth > 0
                          ? `${page.footer.style.borderWidth}px solid ${page.footer.style.borderColor}`
                          : undefined,
                      }}
                    />
                  )}
                </div>
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

        {selectedElement &&
          (selectedElement.type === 'text' || selectedElement.type === 'paragraph') && (
            <TextFormatBar element={selectedElement as any} onUpdate={handleUpdateElement} />
          )}

        {selectedElement &&
          (selectedElement.type === 'image' || selectedElement.type === 'box' || selectedElement.type === 'line') && (
            <ElementFormatBar element={selectedElement as any} onUpdate={handleUpdateElement} />
          )}

        <PropertiesPanel
          selectedElement={selectedElement as any}
          onUpdate={handleUpdateElement}
          layoutTableActiveCell={layoutTableCellSelection}
          layoutTableRange={layoutTableRange}
          activePageFooter={pages.find(p => p.pageId === activePageId)?.footer ?? null}
          staticPlaceholders={staticPlaceholders}
        />

        <CanvasStatusBar pageCount={previewPages.length} pageSizePreset={pageSize.preset} />

      </div>
    </DndContext>
  );
}

export default TemplateCanvas;