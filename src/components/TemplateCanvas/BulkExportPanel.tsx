/**
 * BulkExportPanel.tsx
 *
 * Self-contained modal for bulk PDF generation.
 *
 * CHANGES FROM PREVIOUS VERSION
 * ──────────────────────────────
 * 1. UI redesigned — tighter, cleaner, consistent with UploadData redesign.
 *
 * 2. Collection-scalar section removed. These fields resolve automatically
 *    per driver row on the server — showing them as a separate section
 *    with "auto" badges adds noise without value.
 *
 * 3. Document-level fields (true metadata) section kept — these genuinely
 *    need user input. Badge transitions "required" → "set" as user types.
 *
 * 4. Record preview is now a compact inline table, not a separate section
 *    header. Navigator sits above the preview table.
 *
 * 5. Progress section integrated into footer area to save vertical space.
 */

import { useState, useMemo, useCallback } from 'react';
import { detectRelationships, buildRelatedCollectionsConfig } from '../../utils/relationshipDetector';
import { classifyPlaceholders } from '../../utils/classifyPlaceholders';
import { useBulkExport } from '../../services/useBulkExport';
import type {
  CanonicalDocument,
  FieldMapping,
  TableCollectionBindings,
  CollectionMappings,
} from '../../types/dataSource';
import type { RuntimeDataStructure } from '../../types/runtimeDataStructure';
import './BulkExportPanel.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CanvasPage {
  pageId:      string;
  elements:    any[];
  pageConfig?: any;
}

export interface BulkExportPanelProps {
  ir:                      CanonicalDocument;
  rds?:                    RuntimeDataStructure;
  pages:                   CanvasPage[];
  fieldMapping:            FieldMapping;
  tableCollectionBindings: TableCollectionBindings;
  collectionMappings:      CollectionMappings;
  savedGlobalFields?:      Record<string, string>;
  onClose:                 () => void;
  onGlobalFieldsSave?:     (fields: Record<string, string>) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getStaticPlaceholders(pages: CanvasPage[]): string[] {
  const found = new Set<string>();
  const RE    = /\{\{([^}]+)\}\}/g;
  function scanValue(v: unknown) {
    if (typeof v !== 'string') return;
    let m: RegExpExecArray | null;
    while ((m = RE.exec(v)) !== null) found.add(m[1].trim());
    RE.lastIndex = 0;
  }
  pages.forEach(p =>
    p.elements?.forEach(el => {
      if (el?.type === 'table') return;
      [el?.content, el?.value, el?.src, el?.label].forEach(scanValue);
    })
  );
  return [...found];
}

function resolveFileName(template: string, row: Record<string, any>): string {
  let name = template;
  for (const [k, v] of Object.entries(row)) {
    name = name.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
  }
  return name.replace(/\{\{[^}]+\}\}/g, '').replace(/[/\\:*?"<>|]/g, '_').trim() || 'document';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function BulkExportPanel({
  ir,
  pages,
  fieldMapping,
  tableCollectionBindings,
  collectionMappings,
  savedGlobalFields = {},
  onClose,
  onGlobalFieldsSave,
}: BulkExportPanelProps) {

  // ── Relationship detection ────────────────────────────────────────────────
  const relationships = useMemo(() => detectRelationships(ir), [ir]);
  const collectionKeys = Object.keys(ir.collections);

  const autoDriver = useMemo(() => {
    const withRelated = Object.entries(relationships).find(
      ([, rel]) => rel.relatedCollections.length > 0
    );
    return withRelated?.[0] ?? collectionKeys[0] ?? '';
  }, [relationships, collectionKeys]);

  const [driverKey,         setDriverKey]         = useState<string>(autoDriver);
  const [fileNameTemplate,  setFileNameTemplate]  = useState<string>(() => {
    const firstCol = Object.keys(ir.collections[collectionKeys[0]]?.rows[0] ?? {})[0] ?? 'id';
    return `document-{{${firstCol}}}.pdf`;
  });
  const [globalFieldValues, setGlobalFieldValues] = useState<Record<string, string>>(savedGlobalFields);
  const [previewIndex,      setPreviewIndex]      = useState<number>(0);

  // ── Placeholder classification ────────────────────────────────────────────
  const staticPlaceholders = useMemo(() => getStaticPlaceholders(pages), [pages]);

  const classification = useMemo(
    () => classifyPlaceholders(staticPlaceholders, ir),
    [staticPlaceholders, ir],
  );

  // ── Driver data ───────────────────────────────────────────────────────────
  const driverRows  = useMemo(() => ir.collections[driverKey]?.rows ?? [], [ir, driverKey]);
  const totalRows   = driverRows.length;
  const previewRow  = driverRows[previewIndex] ?? {};

  const previewFileName = useMemo(
    () => resolveFileName(fileNameTemplate, { ...previewRow, ...globalFieldValues }),
    [fileNameTemplate, previewRow, globalFieldValues],
  );

  // ── Related collections config ────────────────────────────────────────────
  const relatedCollectionsConfig = useMemo(
    () => buildRelatedCollectionsConfig(driverKey, relationships),
    [driverKey, relationships],
  );

  const relatedList = relationships[driverKey]?.relatedCollections ?? [];

  // ── Bulk export hook ──────────────────────────────────────────────────────
  const { run, progress, status, errorMessage } = useBulkExport();

  const handleExport = useCallback(async () => {
    if (status === 'running') return;
    if (onGlobalFieldsSave) onGlobalFieldsSave(globalFieldValues);

    const enrichedIr: CanonicalDocument = {
      ...ir,
      fields: { ...ir.fields, ...globalFieldValues },
    };

    await run({
      ir:                      enrichedIr,
      pages:                   pages.map(p => ({
        pageId:                  p.pageId,
        templateElements:        p.elements ?? [],
        header:                  (p as any).header ?? null,
        footer:                  (p as any).footer ?? null,
        fieldMapping,
        tableCollectionBindings,
        collectionMappings,
      })),
      bulk: {
        driverCollectionKey:  driverKey,
        fileNameTemplate,
        relatedCollections:   relatedCollectionsConfig,
        zipFileName:          `bulk-export-${new Date().toISOString().slice(0, 10)}.zip`,
      },
      totalRows,
    });
  }, [
    status, ir, globalFieldValues, pages, fieldMapping,
    tableCollectionBindings, collectionMappings, driverKey,
    fileNameTemplate, relatedCollectionsConfig, totalRows,
    run, onGlobalFieldsSave,
  ]);

  const isRunning = status === 'running';
  const isDone    = status === 'done';
  const isError   = status === 'error';

  const missingMetaCount = classification.trueMetadata.filter(
    ph => !(globalFieldValues[ph] ?? '').trim()
  ).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bep-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bep-panel" role="dialog" aria-modal="true" aria-label="Bulk Export">

        {/* Header */}
        <div className="bep-header">
          <div className="bep-header-left">
            <div>
              <h2 className="bep-title">Bulk Export</h2>
              <p className="bep-subtitle">Generate one PDF per record</p>
            </div>
          </div>
          <button className="bep-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="bep-body">

          {/* ── Driver collection ──────────────────────────────────────── */}
          <div className="bep-section">
            <div className="bep-section-head">
              <span className="bep-section-label">Driver collection</span>
              <span className="bep-pill bep-pill-blue">{totalRows} PDFs</span>
            </div>
            <p className="bep-section-hint">One PDF will be generated per row in this collection.</p>
            <select
              className="bep-select"
              value={driverKey}
              onChange={e => { setDriverKey(e.target.value); setPreviewIndex(0); }}
              disabled={isRunning}
            >
              {collectionKeys.map(k => (
                <option key={k} value={k}>
                  {k} ({ir.collections[k]?.rows.length ?? 0} rows)
                </option>
              ))}
            </select>

            {relatedList.length > 0 && (
              <div className="bep-related">
                <span className="bep-related-label">Related:</span>
                {relatedList.map((r: any) => (
                  <span key={r.collectionKey} className="bep-related-chip">
                    {r.collectionKey}
                    <span className="bep-related-key">via {r.foreignKey}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── File name template ─────────────────────────────────────── */}
          <div className="bep-section">
            <div className="bep-section-head">
              <span className="bep-section-label">File name template</span>
            </div>
            <p className="bep-section-hint">
              Use <code className="bep-code">{`{{column_name}}`}</code> to include record values.
            </p>
            <input
              className="bep-input"
              type="text"
              value={fileNameTemplate}
              onChange={e => setFileNameTemplate(e.target.value)}
              placeholder="document-{{id}}.pdf"
              disabled={isRunning}
            />
            {previewFileName && (
              <p className="bep-preview-name">
                <span className="bep-preview-label">Preview: </span>{previewFileName}
              </p>
            )}
          </div>

          {/* ── Document-level fields (true metadata only) ─────────────── */}
          {classification.trueMetadata.length > 0 && (
            <div className="bep-section">
              <div className="bep-section-head">
                <span className="bep-section-label">Document-level fields</span>
                <span className={`bep-pill ${missingMetaCount > 0 ? 'bep-pill-amber' : 'bep-pill-green'}`}>
                  {missingMetaCount > 0 ? `${missingMetaCount} need values` : 'all set'}
                </span>
              </div>
              <p className="bep-section-hint">
                Not in your data — same value across all {totalRows} PDFs. Saved to template.
              </p>
              <div className="bep-meta-list">
                {classification.trueMetadata.map(ph => {
                  const v     = globalFieldValues[ph] ?? '';
                  const isSet = v.trim().length > 0;
                  return (
                    <div key={ph} className="bep-meta-row">
                      <span className="bep-meta-key">{`{{${ph}}}`}</span>
                      <input
                        className="bep-meta-input"
                        type="text"
                        value={v}
                        placeholder="Enter value…"
                        disabled={isRunning}
                        onChange={e =>
                          setGlobalFieldValues(prev => ({ ...prev, [ph]: e.target.value }))
                        }
                      />
                      <span className={`bep-badge ${isSet ? 'bep-badge-set' : 'bep-badge-required'}`}>
                        {isSet ? 'set' : 'required'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Record preview ─────────────────────────────────────────── */}
          {totalRows > 0 && (
            <div className="bep-section">
              <div className="bep-section-head">
                <span className="bep-section-label">Preview record</span>
                <div className="bep-nav">
                  <button
                    className="bep-nav-btn"
                    onClick={() => setPreviewIndex(i => Math.max(0, i - 1))}
                    disabled={previewIndex === 0 || isRunning}
                    aria-label="Previous record"
                  >‹</button>
                  <span className="bep-nav-label">{previewIndex + 1} / {totalRows}</span>
                  <button
                    className="bep-nav-btn"
                    onClick={() => setPreviewIndex(i => Math.min(totalRows - 1, i + 1))}
                    disabled={previewIndex === totalRows - 1 || isRunning}
                    aria-label="Next record"
                  >›</button>
                </div>
              </div>
              <div className="bep-record-preview">
                {Object.entries(previewRow).slice(0, 6).map(([k, v]) => (
                  <div key={k} className="bep-record-row">
                    <span className="bep-record-key">{k}</span>
                    <span className="bep-record-val">{String(v ?? '')}</span>
                  </div>
                ))}
                {Object.keys(previewRow).length > 6 && (
                  <div className="bep-record-more">
                    +{Object.keys(previewRow).length - 6} more fields
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Progress ───────────────────────────────────────────────── */}
          {(isRunning || isDone || isError) && (
            <div className="bep-section">
              {(isRunning || isDone) && progress && (
                <div className="bep-progress-wrap">
                  <div className="bep-progress-bar">
                    <div
                      className="bep-progress-fill"
                      style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                  <span className="bep-progress-label">
                    {progress.current} / {progress.total}
                  </span>
                </div>
              )}
              {isDone && (
                <p className="bep-success">
                  ✓ {totalRows} PDF{totalRows !== 1 ? 's' : ''} exported — download started.
                </p>
              )}
              {isError && (
                <p className="bep-error">✕ {errorMessage || 'Export failed. Please try again.'}</p>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bep-footer">
          <button className="bep-btn-secondary" onClick={onClose} disabled={isRunning}>
            {isDone ? 'Close' : 'Cancel'}
          </button>
          <button
            className="bep-btn-primary"
            onClick={handleExport}
            disabled={isRunning || totalRows === 0}
          >
            {isRunning
              ? `Generating… ${progress?.current ?? 0}/${totalRows}`
              : `Export ${totalRows} PDF${totalRows !== 1 ? 's' : ''}`}
          </button>
        </div>

      </div>
    </div>
  );
}