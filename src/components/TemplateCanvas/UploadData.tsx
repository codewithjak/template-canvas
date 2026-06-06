/**
 * UploadData.tsx  (v3 — full intent-to-relationship flow)
 *
 * Orchestrates a three-phase flow:
 *
 *   Phase 0 — Intent capture
 *     IntentCapturePanel asks the user to choose from three options:
 *     Intent === 'flat'       → single complete report, skip detection, driverKey = null
 *     Intent === 'per-row'    → each row is a separate document, skip detection
 *     Intent === 'relational' → run detection + RelationshipReview after parse
 *
 *   Phase 1 — Upload + parse
 *     Same dropzone as before. Parses file → CanonicalDocument.
 *     If intent === 'flat': goes straight to Phase 2 (mapping). Mode = 'single'.
 *     If intent === 'per-row': goes straight to Phase 2 (mapping). Mode = 'per-row'.
 *     If intent === 'relational': goes to Phase 1.5.
 *
 *   Phase 1.5 — Relationship review (new, relational only)
 *     RelationshipReview presents every detected relationship with:
 *       - confidence badge + explanation
 *       - approve / edit / reject per relationship
 *       - inline RelationshipBuilder for uncertain/none tier
 *     Blocks proceeding until all pending relationships are actioned.
 *
 *   Phase 2 — Mapping confirmation
 *     Same section layout as before:
 *       Section 1: Fields from data (collection-scalar, auto-resolved)
 *       Section 2: Document-level fields (true-metadata, user types once)
 *       Section 3: Table data sources
 *
 * The RuntimeDataStructure is assembled here from the parse result +
 * relationship approvals + execution plan, then passed to onConfirm.
 *
 * onConfirm now also receives the RuntimeDataStructure so callers can
 * adopt the new shape incrementally — the existing CanonicalDocument
 * params are still present for backward compatibility.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type {
  CanonicalDocument,
  FieldMapping,
  TableCollectionBindings,
  CollectionMappings,
  TableInfo,
} from '../../types/dataSource';
import type {
  UploadIntent,
  RuntimeDataStructure,
  CollectionRole,
} from '../../types/runtimeDataStructure';
import {
  toRuntimeDataStructure,
} from '../../types/runtimeDataStructure';
import {
  buildInitialMappings,
  autoMapCollectionFields,
} from '../../services/mappingEngine';
import { parseFile } from '../../services/dataSourceService';
import { classifyPlaceholders } from '../../utils/classifyPlaceholders';
import {
  detectRelationshipsScored,
  type ScoredRelationshipMap,
} from '../../utils/relationshipDetector';
import type { RelationshipReviewResult } from './RelationshipReview';
import { RelationshipReview } from './RelationshipReview';
import { IntentCapturePanel } from './IntentCapturePanel';
import './UploadData.css';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface UploadDataProps {
  staticPlaceholders: string[];
  tables:             TableInfo[];
  onClose:            () => void;
  onConfirm: (
    ir:                      CanonicalDocument,
    fieldMapping:            FieldMapping,
    tableCollectionBindings: TableCollectionBindings,
    collectionMappings:      CollectionMappings,
    /** New: full RuntimeDataStructure for callers adopting the new schema */
    rds?:                    RuntimeDataStructure,
  ) => void;
}

type Phase =
  | 'intent'      // Phase 0: ask flat or relational
  | 'upload'      // Phase 1: dropzone
  | 'review'      // Phase 1.5: relationship review (relational only)
  | 'mapping';    // Phase 2: confirm mappings

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function removeEmptyMappings(mapping: FieldMapping): FieldMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, v]) => v.trim() !== ''),
  );
}

function collectionSummary(collections: CanonicalDocument['collections']): string {
  return Object.entries(collections)
    .map(([k, c]) => `${k} (${c.rows.length})`)
    .join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const UploadData: React.FC<UploadDataProps> = ({
  staticPlaceholders,
  tables,
  onClose,
  onConfirm,
}) => {
  const [phase,   setPhase]   = useState<Phase>('intent');
  const [intent,  setIntent]  = useState<UploadIntent>('unknown');
  const [ir,      setIr]      = useState<CanonicalDocument | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Relationship detection result — set after parse when intent === 'relational'
  const [scoredRelationships, setScoredRelationships] = useState<ScoredRelationshipMap | null>(null);
  // Approved scoping rules from RelationshipReview
  const [reviewResult, setReviewResult] = useState<RelationshipReviewResult | null>(null);

  const [fieldMapping,            setFieldMapping]            = useState<FieldMapping>({});
  const [tableCollectionBindings, setTableCollectionBindings] = useState<TableCollectionBindings>({});
  const [collectionMappings,      setCollectionMappings]      = useState<CollectionMappings>({});
  const [metaValues,              setMetaValues]              = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const classification = useMemo(() => {
    if (!ir) return null;
    return classifyPlaceholders(staticPlaceholders, ir);
  }, [ir, staticPlaceholders]);

  const collectionKeys = ir ? Object.keys(ir.collections) : [];

  const missingMetaCount = classification
    ? classification.trueMetadata.filter(ph => !(metaValues[ph] ?? '').trim()).length
    : 0;

  // Detect the driver key: collection with the most detected related children,
  // fallback to the smallest collection by row count.
  const autoDriverKey = useMemo((): string | undefined => {
    if (!ir || !scoredRelationships) return collectionKeys[0];
    const withRelated = Object.entries(scoredRelationships)
      .filter(([k, rel]) => k !== '_meta' && (rel as any).relatedCollections?.length > 0)
      .sort(([, a], [, b]) => (a as any).rowCount - (b as any).rowCount);
    if (withRelated.length > 0) return withRelated[0][0];
    return collectionKeys.reduce(
      (best, k) =>
        !best || (ir.collections[k]?.rows.length ?? 0) <= (ir.collections[best]?.rows.length ?? 0)
          ? k : best,
      collectionKeys[0],
    );
  }, [ir, scoredRelationships, collectionKeys]);

  // ── Init mappings ─────────────────────────────────────────────────────────

  const initMappings = useCallback((doc: CanonicalDocument) => {
    const { fieldMapping, tableCollectionBindings, collectionMappings } =
      buildInitialMappings(doc, staticPlaceholders, tables);
    setFieldMapping(fieldMapping);
    setTableCollectionBindings(tableCollectionBindings);
    setCollectionMappings(collectionMappings);
    setMetaValues({});
  }, [staticPlaceholders, tables]);

  // ── Intent selection ──────────────────────────────────────────────────────

  const handleIntentSelect = (selected: UploadIntent) => {
    setIntent(selected);
    setPhase('upload');
  };

  // ── File parsing ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setParsing(true);
    try {
      const doc = await parseFile(file);
      setIr(doc);
      initMappings(doc);

      if (intent === 'relational' && Object.keys(doc.collections).length > 1) {
        // Run confidence-scored detection
        const scored = detectRelationshipsScored(doc);
        setScoredRelationships(scored);

        // Warn if only one collection found despite relational intent
        if (Object.keys(doc.collections).length <= 1) {
          setError('Only one collection found — is your data split across multiple sheets?');
        }

        setPhase('review');
      } else {
        // flat intent or single collection — skip review
        setScoredRelationships(null);
        setReviewResult(null);
        setPhase('mapping');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed.');
    } finally {
      setParsing(false);
    }
  }, [intent, initMappings]);

  const onDrop = useCallback(
    (files: File[]) => { if (files[0]) handleFile(files[0]); },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv':                                                            ['.csv'],
      'application/vnd.ms-excel':                                           ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json':                                                   ['.json'],
    },
    maxFiles: 1,
    multiple: false,
    noClick:  true,
  });

  // ── Relationship review confirm ───────────────────────────────────────────

  const handleReviewConfirm = (result: RelationshipReviewResult) => {
    setReviewResult(result);
    setPhase('mapping');
  };

  // ── Collection binding change ─────────────────────────────────────────────

  const handleCollectionChange = (tableId: string, collKey: string) => {
    setTableCollectionBindings(prev => ({ ...prev, [tableId]: collKey }));
    if (ir && collKey) {
      const tableInfo = tables.find(t => t.id === tableId);
      const col       = ir.collections[collKey];
      if (tableInfo && col) {
        const autoMapped = autoMapCollectionFields(tableInfo.placeholders, col.columns);
        setCollectionMappings(prev => ({
          ...prev,
          [collKey]: { ...(prev[collKey] ?? {}), ...autoMapped },
        }));
      }
    }
  };

  // ── Final confirm — assembles RuntimeDataStructure ────────────────────────

  const handleConfirm = () => {
    if (!ir) return;

    // Inject true-metadata values into ir.fields
    const enrichedFields = { ...ir.fields };
    if (classification) {
      for (const ph of classification.trueMetadata) {
        const v = (metaValues[ph] ?? '').trim();
        if (v) enrichedFields[ph] = v;
      }
    }
    const enrichedIr: CanonicalDocument = { ...ir, fields: enrichedFields };

    // Build RuntimeDataStructure
    const driverKey = intent === 'flat' ? undefined : (autoDriverKey ?? collectionKeys[0]);
    const executionMode = intent === 'flat' ? 'single' : intent === 'per-row' ? 'per-row' : 'relational';

    const rds = toRuntimeDataStructure(enrichedIr, intent, executionMode, driverKey);

    // Apply approved scoping rules from review
    if (reviewResult) {
      for (const [collKey, rule] of Object.entries(reviewResult.scopingRules)) {
        if (rds.collections[collKey]) {
          rds.collections[collKey] = {
            ...rds.collections[collKey],
            role: 'related' as CollectionRole,
            scopingRule: rule,
          };
        }
      }
      // Mark rejected collections as standalone
      for (const [collKey, state] of Object.entries(reviewResult.approvals)) {
        if (state === 'rejected' && rds.collections[collKey]) {
          rds.collections[collKey] = {
            ...rds.collections[collKey],
            role: 'standalone' as CollectionRole,
            scopingRule: undefined,
          };
        }
      }
      rds.relationshipApprovals = reviewResult.approvals;
    }

    onConfirm(
      enrichedIr,
      removeEmptyMappings(fieldMapping),
      tableCollectionBindings,
      collectionMappings,
      rds,
    );
  };

  // ── Phase header labels ───────────────────────────────────────────────────

  const phaseTitle: Record<Phase, string> = {
    intent:  'Bind data',
    upload:  'Upload file',
    review:  'Review relationships',
    mapping: 'Confirm mapping',
  };

  const phaseSub: Record<Phase, string> = {
    intent:  'Map your data source to template placeholders',
    upload:  'Drop a file to get started',
    review:  'Confirm how your collections relate before mapping',
    mapping: 'Review auto-detected mappings',
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderPhaseIndicator = () => {
    const phases: Phase[] = ['intent', 'upload', 'review', 'mapping'];
    const labels          = ['Intent', 'Upload', 'Review', 'Map'];
    const showReview      = intent === 'relational';
    const visiblePhases   = showReview ? phases : phases.filter(p => p !== 'review');
    const visibleLabels   = showReview ? labels : labels.filter((_, i) => phases[i] !== 'review');


    return (
      <div className="up-phase-bar">
        {visiblePhases.map((p, i) => (
          <React.Fragment key={p}>
            <div className={`up-phase-step ${phase === p ? 'up-phase-step--active' : ''} ${visiblePhases.indexOf(phase) > i ? 'up-phase-step--done' : ''}`}>
              <span className="up-phase-dot">{visiblePhases.indexOf(phase) > i ? '✓' : i + 1}</span>
              <span className="up-phase-label">{visibleLabels[i]}</span>
            </div>
            {i < visiblePhases.length - 1 && (
              <div className={`up-phase-line ${visiblePhases.indexOf(phase) > i ? 'up-phase-line--done' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // ── Phase: review ─────────────────────────────────────────────────────────

  if (phase === 'review' && ir && autoDriverKey && scoredRelationships) {
    return (
      <div className="upload-panel">
        <div className="upload-panel-card upload-panel-card--wide">
          <div className="upload-panel-header">
            <div>
              <h2>{phaseTitle.review}</h2>
              <p>{phaseSub.review}</p>
            </div>
            <button className="upload-close" type="button" onClick={onClose} aria-label="Close">✕</button>
          </div>
          {renderPhaseIndicator()}
          <RelationshipReview
            ir={ir}
            driverKey={autoDriverKey}
            relationships={scoredRelationships}
            onConfirm={handleReviewConfirm}
            onBack={() => setPhase('upload')}
          />
        </div>
      </div>
    );
  }

  // ── Phase: intent + upload + mapping ──────────────────────────────────────

  return (
    <div className="upload-panel">
      <div className="upload-panel-card">

        {/* Header */}
        <div className="upload-panel-header">
          <div>
            <h2>{phaseTitle[phase]}</h2>
            <p>{phaseSub[phase]}</p>
          </div>
          <button className="upload-close" type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Phase indicator (after intent is chosen) */}
        {phase !== 'intent' && renderPhaseIndicator()}

        {/* ── Phase 0: intent capture ──────────────────────────────── */}
        {phase === 'intent' && (
          <IntentCapturePanel onSelect={handleIntentSelect} />
        )}

        {/* ── Phase 1: upload ──────────────────────────────────────── */}
        {phase === 'upload' && (
          <>
            {/* Intent badge */}
            <div className="up-intent-bar">
              <span className={`up-intent-chip ${intent === 'flat' ? 'up-intent-chip--flat' : 'up-intent-chip--relational'}`}>
                {intent === 'flat' ? '⊟ Flat — one row per PDF' : '⊞ Relational — linked sheets'}
              </span>
              <button
                className="up-intent-change"
                onClick={() => { setPhase('intent'); setIr(null); setError(null); }}
                type="button"
              >
                Change
              </button>
            </div>

            {/* File bar (if already uploaded) */}
            {ir && (
              <div className="upload-file-bar">
                <div className="upload-file-icon">📄</div>
                <div className="upload-file-info">
                  <div className="upload-file-name">{ir.source?.fileName ?? 'Uploaded file'}</div>
                  <div className="upload-file-meta">
                    {collectionKeys.length} collection{collectionKeys.length !== 1 ? 's' : ''} · {collectionSummary(ir.collections)}
                  </div>
                </div>
                <div className="upload-file-pills">
                  {collectionKeys.map(k => (
                    <span key={k} className="up-pill up-pill-green">
                      {k} · {ir.collections[k].rows.length}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dropzone */}
            <div
              {...getRootProps()}
              className={`upload-dropzone ${isDragActive ? 'active' : ''} ${parsing ? 'parsing' : ''}`}
            >
              <input {...getInputProps()} ref={fileInputRef} />
              <div className="upload-content">
                <div className="upload-icon">📁</div>
                <h3>{ir ? 'Replace file' : 'Drop a file here'}</h3>
                <p>CSV, Excel (.xlsx / .xls), or JSON</p>
                <button
                  type="button"
                  className="upload-browse-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse file
                </button>
              </div>
              {parsing && (
                <div className="upload-progress">
                  <div className="upload-spinner" />
                  <p style={{ fontSize: 12, color: '#64748b' }}>Parsing…</p>
                </div>
              )}
            </div>

            {error && <div className="upload-error" style={{ margin: '0 20px 12px' }}>{error}</div>}

            {ir && intent === 'relational' && Object.keys(ir.collections).length <= 1 && (
              <div className="upload-warning up-single-coll-warn">
                ⚠ Only one collection found. Expected multiple sheets for relational data.
                Is your data split across sheets in the file?
              </div>
            )}
          </>
        )}

        {/* ── Phase 2: mapping ─────────────────────────────────────── */}
        {phase === 'mapping' && ir && (
          <>
            {/* Relationship summary (if relational and review done) */}
            {reviewResult && Object.keys(reviewResult.scopingRules).length > 0 && (
              <div className="up-section up-rel-summary">
                <div className="up-section-head">
                  <span className="up-section-label">Relationships confirmed</span>
                  <span className="up-pill up-pill-green">
                    {Object.keys(reviewResult.scopingRules).length} linked
                  </span>
                </div>
                <div className="up-rel-chips">
                  {Object.entries(reviewResult.scopingRules).map(([collKey, rule]) => (
                    <div key={collKey} className="up-rel-chip">
                      <span className="up-rel-chip-driver">{autoDriverKey}</span>
                      <span className="up-rel-chip-arrow">→</span>
                      <span className="up-rel-chip-child">{collKey}</span>
                      <span className="up-rel-chip-keys">
                        via {rule.driverRowField} · {rule.filterColumn}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 1: collection-scalar fields */}
            {classification && classification.collectionScalars.length > 0 && (
              <div className="up-section">
                <div className="up-section-head">
                  <span className="up-section-label">Fields from data</span>
                  <span className="up-pill up-pill-green">
                    {classification.collectionScalars.length} auto-resolved
                  </span>
                </div>
                <p className="up-section-hint">
                  These resolve automatically per record during export — no action needed.
                </p>
                <div className="up-field-list">
                  {classification.collectionScalars.map(info => (
                    <div key={info.placeholder} className="up-field-row">
                      <span className="up-field-key">{`{{${info.placeholder}}}`}</span>
                      <span className="up-field-source">
                        from <code>{info.collectionKey}.{info.columnName}</code>
                      </span>
                      <span className="up-badge up-badge-auto">auto</span>
                    </div>
                  ))}
                  {classification.alreadyResolved.map(ph => (
                    <div key={ph} className="up-field-row">
                      <span className="up-field-key">{`{{${ph}}}`}</span>
                      <span className="up-field-source">from data fields</span>
                      <span className="up-badge up-badge-auto">auto</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 2: true-metadata */}
            {classification && classification.trueMetadata.length > 0 && (
              <div className="up-section">
                <div className="up-section-head">
                  <span className="up-section-label">Document-level fields</span>
                  <span className={`up-pill ${missingMetaCount > 0 ? 'up-pill-amber' : 'up-pill-green'}`}>
                    {missingMetaCount > 0 ? `${missingMetaCount} need values` : 'all set'}
                  </span>
                </div>
                <p className="up-section-hint">
                  Not in your data — same value across all documents. Saved to template.
                </p>
                <div className="up-field-list">
                  {classification.trueMetadata.map(ph => {
                    const v     = metaValues[ph] ?? '';
                    const isSet = v.trim().length > 0;
                    return (
                      <div key={ph} className="up-meta-row">
                        <span className="up-field-key">{`{{${ph}}}`}</span>
                        <input
                          className="up-meta-input"
                          type="text"
                          value={v}
                          placeholder="Enter value…"
                          onChange={e => setMetaValues(prev => ({ ...prev, [ph]: e.target.value }))}
                        />
                        <span className={`up-badge ${isSet ? 'up-badge-set' : 'up-badge-required'}`}>
                          {isSet ? 'set' : 'required'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Section 3: table data sources */}
            {tables.length > 0 && (
              <div className="up-section">
                <div className="up-section-head">
                  <span className="up-section-label">Table data sources</span>
                  <span className="up-pill up-pill-gray">{tables.length} table{tables.length !== 1 ? 's' : ''}</span>
                </div>
                <p className="up-section-hint">
                  Choose which collection provides rows for each table.
                </p>
                {tables.map(table => {
                  const boundCollKey = tableCollectionBindings[table.id] ?? '';
                  const boundCol     = boundCollKey ? ir.collections[boundCollKey] : null;
                  const colHeaders   = boundCol?.columns ?? [];
                  const colMap       = collectionMappings[boundCollKey] ?? {};
                  return (
                    <div key={table.id} className="up-table-card">
                      <div className="up-table-card-head">
                        <span>⊞</span>
                        <span>{table.label}</span>
                        {boundCol && (
                          <span className="up-pill up-pill-green" style={{ marginLeft: 'auto' }}>
                            {boundCollKey} · {boundCol.rows.length} rows
                          </span>
                        )}
                      </div>
                      <div className="up-table-card-body">
                        <div className="up-coll-row">
                          <span className="up-coll-label">Collection</span>
                          <select
                            className="up-coll-select"
                            value={boundCollKey}
                            onChange={e => handleCollectionChange(table.id, e.target.value)}
                          >
                            <option value="">— select —</option>
                            {collectionKeys.map(k => (
                              <option key={k} value={k}>
                                {k} ({ir.collections[k].rows.length} rows)
                              </option>
                            ))}
                          </select>
                        </div>
                        {boundCol && table.placeholders.length > 0 && (
                          <div className="up-col-map-grid">
                            {table.placeholders.map(ph => (
                              <div key={ph} className="up-col-map-row">
                                <span className="up-col-map-key">{`{{${ph}}}`}</span>
                                <span className="up-col-map-arrow">→</span>
                                <select
                                  className="up-col-map-sel"
                                  value={colMap[ph] ?? ''}
                                  onChange={e =>
                                    setCollectionMappings(prev => ({
                                      ...prev,
                                      [boundCollKey]: { ...(prev[boundCollKey] ?? {}), [ph]: e.target.value },
                                    }))
                                  }
                                >
                                  <option value="">— column —</option>
                                  {colHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        {phase !== 'intent' && phase !== 'review' && (
          <div className="upload-footer">
            <span className={`upload-footer-hint ${phase === 'mapping' && missingMetaCount === 0 && ir ? 'hint-ready' : ''}`}>
              {phase === 'upload'
                ? (ir ? 'File parsed — click Next to continue' : 'Upload a file to get started')
                : missingMetaCount > 0
                  ? `${missingMetaCount} document-level field${missingMetaCount > 1 ? 's' : ''} need values`
                  : 'All fields resolved — ready to confirm'
              }
            </span>
            <div className="upload-footer-actions">
              <button type="button" className="upload-btn-secondary" onClick={() => {
                if (phase === 'mapping') {
                  setPhase(intent === 'relational' && ir && Object.keys(ir.collections).length > 1 ? 'review' : 'upload');
                } else {
                  setPhase('intent');
                }
              }}>
                ← Back
              </button>
              {phase === 'upload' && (
                <button
                  type="button"
                  className="upload-btn-primary"
                  disabled={!ir}
                  onClick={() => {
                    if (!ir) return;
                    if (intent === 'relational' && Object.keys(ir.collections).length > 1 && scoredRelationships) {
                      setPhase('review');
                    } else {
                      setPhase('mapping');
                    }
                  }}
                >
                  Next →
                </button>
              )}
              {phase === 'mapping' && (
                <button
                  type="button"
                  className="upload-btn-primary"
                  onClick={handleConfirm}
                  disabled={!ir}
                >
                  Confirm mapping
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadData;