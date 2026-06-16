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
import type { Phase } from './upload/types';
import PhaseIndicator from './upload/PhaseIndicator';
import UploadPhase from './upload/UploadPhase';
import MappingPhase from './upload/MappingPhase';
import UploadFooter from './upload/UploadFooter';
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function removeEmptyMappings(mapping: FieldMapping): FieldMapping {
  return Object.fromEntries(
    Object.entries(mapping).filter(([, v]) => v.trim() !== ''),
  );
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

  // ── Mapping edits ─────────────────────────────────────────────────────────

  const handleMetaChange = (placeholder: string, value: string) =>
    setMetaValues(prev => ({ ...prev, [placeholder]: value }));

  const handleColumnMapChange = (collKey: string, placeholder: string, columnName: string) =>
    setCollectionMappings(prev => ({
      ...prev,
      [collKey]: { ...(prev[collKey] ?? {}), [placeholder]: columnName },
    }));

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
          <PhaseIndicator phase={phase} intent={intent} />
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
        {phase !== 'intent' && <PhaseIndicator phase={phase} intent={intent} />}

        {/* ── Phase 0: intent capture ──────────────────────────────── */}
        {phase === 'intent' && (
          <IntentCapturePanel onSelect={handleIntentSelect} />
        )}

        {/* ── Phase 1: upload ──────────────────────────────────────── */}
        {phase === 'upload' && (
          <UploadPhase
            intent={intent}
            ir={ir}
            parsing={parsing}
            error={error}
            collectionKeys={collectionKeys}
            onChangeIntent={() => { setPhase('intent'); setIr(null); setError(null); }}
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            isDragActive={isDragActive}
            fileInputRef={fileInputRef}
          />
        )}

        {/* ── Phase 2: mapping ─────────────────────────────────────── */}
        {phase === 'mapping' && ir && (
          <MappingPhase
            ir={ir}
            classification={classification}
            reviewResult={reviewResult}
            autoDriverKey={autoDriverKey}
            tables={tables}
            collectionKeys={collectionKeys}
            tableCollectionBindings={tableCollectionBindings}
            collectionMappings={collectionMappings}
            metaValues={metaValues}
            missingMetaCount={missingMetaCount}
            onMetaChange={handleMetaChange}
            onCollectionChange={handleCollectionChange}
            onColumnMapChange={handleColumnMapChange}
          />
        )}

        {/* Footer */}
        {phase !== 'intent' && phase !== 'review' && (
          <UploadFooter
            phase={phase}
            hint={
              phase === 'upload'
                ? (ir ? 'File parsed — click Next to continue' : 'Upload a file to get started')
                : missingMetaCount > 0
                  ? `${missingMetaCount} document-level field${missingMetaCount > 1 ? 's' : ''} need values`
                  : 'All fields resolved — ready to confirm'
            }
            hintReady={phase === 'mapping' && missingMetaCount === 0 && !!ir}
            nextDisabled={!ir}
            confirmDisabled={!ir}
            onBack={() => {
              if (phase === 'mapping') {
                setPhase(intent === 'relational' && ir && Object.keys(ir.collections).length > 1 ? 'review' : 'upload');
              } else {
                setPhase('intent');
              }
            }}
            onNext={() => {
              if (!ir) return;
              if (intent === 'relational' && Object.keys(ir.collections).length > 1 && scoredRelationships) {
                setPhase('review');
              } else {
                setPhase('mapping');
              }
            }}
            onConfirm={handleConfirm}
          />
        )}
      </div>
    </div>
  );
};

export default UploadData;