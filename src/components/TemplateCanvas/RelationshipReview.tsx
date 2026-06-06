/**
 * RelationshipReview.tsx
 *
 * Shown between the upload step and mapping step when uploadIntent === 'relational'
 * and the IR has more than one collection.
 *
 * Renders each detected relationship with:
 *   - Confidence badge (auto / suggest / uncertain / none)
 *   - Approve / Edit / Reject actions
 *   - Blocks proceeding if any relationship is below AUTO_COMMIT without action
 *
 * Auto-commit tier (≥ 0.95): pre-approved, green badge, user can still override.
 * Suggest tier (0.70–0.94):  shown with "approve" CTA, blocks until actioned.
 * Uncertain tier (< 0.70):   launches guided flow inline.
 * No relationship:           shown as standalone with option to manually link.
 */

import React, { useState, useMemo } from 'react';
import type { RelationshipMap, RelatedCollection } from '../../utils/relationshipDetector';
import type { CanonicalDocument } from '../../types/dataSource';
import {
  getConfidenceTier,
  type ConfidenceTier,
  type RelationshipApprovalState,
} from '../../types/runtimeDataStructure';
import { RelationshipBuilder } from './RelationshipBuilder';
import './RelationshipReview.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ApprovalEntry {
  rel:      RelatedCollection;
  state:    RelationshipApprovalState;
  /** Override FK/PK set by user if they edited */
  editedFilterColumn?:   string;
  editedDriverRowField?: string;
}

export interface RelationshipReviewResult {
  approvals:     Record<string, RelationshipApprovalState>;
  /** Final scoping rules — may include user edits */
  scopingRules:  Record<string, {
    filterColumn:   string;
    driverRowField: string;
    confidence:     number;
    detectedBy:     'explicit-key' | 'value-intersection' | 'user-defined';
  }>;
}

interface RelationshipReviewProps {
  ir:            CanonicalDocument;
  driverKey:     string;
  relationships: RelationshipMap;
  onConfirm:     (result: RelationshipReviewResult) => void;
  onBack:        () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence badge config
// ─────────────────────────────────────────────────────────────────────────────

const TIER_CONFIG: Record<ConfidenceTier, {
  label:    string;
  cls:      string;
  dotCls:   string;
  pct:      (c: number) => string;
}> = {
  auto: {
    label:  'High confidence',
    cls:    'rr-badge--auto',
    dotCls: 'rr-dot--auto',
    pct:    c => `${Math.round(c * 100)}%`,
  },
  suggest: {
    label:  'Likely match',
    cls:    'rr-badge--suggest',
    dotCls: 'rr-dot--suggest',
    pct:    c => `${Math.round(c * 100)}%`,
  },
  uncertain: {
    label:  'Uncertain',
    cls:    'rr-badge--uncertain',
    dotCls: 'rr-dot--uncertain',
    pct:    c => `${Math.round(c * 100)}%`,
  },
  none: {
    label:  'No match',
    cls:    'rr-badge--none',
    dotCls: 'rr-dot--none',
    pct:    () => '—',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Single relationship row
// ─────────────────────────────────────────────────────────────────────────────

interface RelRowProps {
  ir:        CanonicalDocument;
  driverKey: string;
  entry:     ApprovalEntry;
  onChange:  (collKey: string, update: Partial<ApprovalEntry>) => void;
}

const RelRow: React.FC<RelRowProps> = ({ ir, driverKey, entry, onChange }) => {
  const { rel, state } = entry;
  const tier   = getConfidenceTier(rel.confidence);
  const config = TIER_CONFIG[tier];
  const [showBuilder, setShowBuilder] = useState(
    tier === 'uncertain' && state === 'pending',
  );

  const fkCol  = entry.editedFilterColumn   ?? rel.foreignKey;
  const pkCol  = entry.editedDriverRowField ?? rel.primaryKey;

  const handleBuilderComplete = (result: {
    filterColumn: string; driverRowField: string;
  }) => {
    onChange(rel.collectionKey, {
      state:                'edited',
      editedFilterColumn:   result.filterColumn,
      editedDriverRowField: result.driverRowField,
    });
    setShowBuilder(false);
  };

  return (
    <div className={`rr-row rr-row--${state}`}>
      <div className="rr-row-top">
        {/* Left: collection info */}
        <div className="rr-row-left">
          <div className="rr-coll-name">
            <span className={`rr-dot ${config.dotCls}`} />
            {rel.collectionKey}
          </div>
          <div className="rr-coll-meta">
            {ir.collections[rel.collectionKey]?.rows.length ?? 0} rows
            {' · '}avg {rel.avgRowsPerParent} per {driverKey} record
          </div>
        </div>

        {/* Center: join display */}
        <div className="rr-join">
          <span className="rr-join-key">{driverKey}.{pkCol}</span>
          <span className="rr-join-arrow">→</span>
          <span className="rr-join-key">{rel.collectionKey}.{fkCol}</span>
        </div>

        {/* Right: badge + actions */}
        <div className="rr-row-right">
          <span className={`rr-badge ${config.cls}`}>
            {config.label} · {config.pct(rel.confidence)}
          </span>

          <div className="rr-actions">
            {state === 'pending' && tier !== 'auto' && (
              <button
                className="rr-btn rr-btn--approve"
                onClick={() => onChange(rel.collectionKey, { state: 'approved' })}
                type="button"
              >
                Approve
              </button>
            )}
            {(state === 'approved' || tier === 'auto') && (
              <span className="rr-status rr-status--approved">✓ Approved</span>
            )}
            {state === 'edited' && (
              <span className="rr-status rr-status--edited">✓ Edited</span>
            )}
            {state === 'rejected' && (
              <span className="rr-status rr-status--rejected">✕ Standalone</span>
            )}

            {state !== 'rejected' && (
              <button
                className="rr-btn rr-btn--edit"
                onClick={() => setShowBuilder(v => !v)}
                type="button"
              >
                {showBuilder ? 'Hide' : 'Edit link'}
              </button>
            )}

            {state !== 'rejected' ? (
              <button
                className="rr-btn rr-btn--reject"
                onClick={() => {
                  setShowBuilder(false);
                  onChange(rel.collectionKey, { state: 'rejected' });
                }}
                type="button"
              >
                Standalone
              </button>
            ) : (
              <button
                className="rr-btn rr-btn--undo"
                onClick={() => onChange(rel.collectionKey, {
                  state: tier === 'auto' ? 'approved' : 'pending',
                })}
                type="button"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Explanation */}
      {rel.explanation && state !== 'rejected' && (
        <div className="rr-explanation">{rel.explanation}</div>
      )}

      {/* Inline guided builder */}
      {showBuilder && state !== 'rejected' && (
        <div className="rr-builder-inline">
          <RelationshipBuilder
            ir={ir}
            driverKey={driverKey}
            childKey={rel.collectionKey}
            initialFilterColumn={fkCol}
            initialDriverRowField={pkCol}
            onComplete={handleBuilderComplete}
            onCancel={() => setShowBuilder(false)}
          />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Unlinked collection row
// ─────────────────────────────────────────────────────────────────────────────

interface UnlinkedRowProps {
  ir:        CanonicalDocument;
  driverKey: string;
  collKey:   string;
  onLinked:  (collKey: string, filterColumn: string, driverRowField: string) => void;
}

const UnlinkedRow: React.FC<UnlinkedRowProps> = ({ ir, driverKey, collKey, onLinked }) => {
  const [showBuilder, setShowBuilder] = useState(false);
  const [linked, setLinked]           = useState(false);

  if (linked) {
    return (
      <div className="rr-row rr-row--approved">
        <div className="rr-row-top">
          <div className="rr-row-left">
            <div className="rr-coll-name">
              <span className="rr-dot rr-dot--auto" />
              {collKey}
            </div>
          </div>
          <div className="rr-row-right">
            <span className="rr-status rr-status--approved">✓ Linked manually</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rr-row rr-row--unlinked">
      <div className="rr-row-top">
        <div className="rr-row-left">
          <div className="rr-coll-name">
            <span className="rr-dot rr-dot--none" />
            {collKey}
          </div>
          <div className="rr-coll-meta">
            {ir.collections[collKey]?.rows.length ?? 0} rows · no relationship detected
          </div>
        </div>
        <div className="rr-row-right">
          <span className="rr-badge rr-badge--none">Standalone</span>
          <button
            className="rr-btn rr-btn--edit"
            onClick={() => setShowBuilder(v => !v)}
            type="button"
          >
            Link manually
          </button>
        </div>
      </div>

      {showBuilder && (
        <div className="rr-builder-inline">
          <RelationshipBuilder
            ir={ir}
            driverKey={driverKey}
            childKey={collKey}
            onComplete={({ filterColumn, driverRowField }) => {
              onLinked(collKey, filterColumn, driverRowField);
              setLinked(true);
              setShowBuilder(false);
            }}
            onCancel={() => setShowBuilder(false)}
          />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export const RelationshipReview: React.FC<RelationshipReviewProps> = ({
  ir,
  driverKey,
  relationships,
  onConfirm,
  onBack,
}) => {
  const driverRel = relationships[driverKey];
  const relatedList = driverRel?.relatedCollections ?? [];
  const unlinkedList = driverRel?.unlinkedCollections ?? [];

  // Initialise approval entries — auto-commit tier starts as 'approved'
  const [entries, setEntries] = useState<Record<string, ApprovalEntry>>(() => {
    const init: Record<string, ApprovalEntry> = {};
    for (const rel of relatedList) {
      const tier = getConfidenceTier(rel.confidence);
      init[rel.collectionKey] = {
        rel,
        state: tier === 'auto' ? 'approved' : 'pending',
      };
    }
    return init;
  });

  const [manualLinks, setManualLinks] = useState<Record<string, {
    filterColumn: string; driverRowField: string;
  }>>({});

  const updateEntry = (collKey: string, update: Partial<ApprovalEntry>) => {
    setEntries(prev => ({ ...prev, [collKey]: { ...prev[collKey], ...update } }));
  };

  // Block proceeding if any non-rejected relationship is still 'pending'
  const pendingCount = useMemo(
    () => Object.values(entries).filter(e => e.state === 'pending').length,
    [entries],
  );

  const handleConfirm = () => {
    const approvals: Record<string, RelationshipApprovalState> = {};
    const scopingRules: RelationshipReviewResult['scopingRules'] = {};

    for (const [collKey, entry] of Object.entries(entries)) {
      approvals[collKey] = entry.state;
      if (entry.state !== 'rejected') {
        scopingRules[collKey] = {
          filterColumn:   entry.editedFilterColumn   ?? entry.rel.foreignKey,
          driverRowField: entry.editedDriverRowField ?? entry.rel.primaryKey,
          confidence:     entry.state === 'edited' ? 1.0 : entry.rel.confidence,
          detectedBy:     entry.state === 'edited' ? 'user-defined' : entry.rel.detectedBy,
        };
      }
    }

    // Include manually linked collections
    for (const [collKey, link] of Object.entries(manualLinks)) {
      approvals[collKey]    = 'approved';
      scopingRules[collKey] = { ...link, confidence: 1.0, detectedBy: 'user-defined' };
    }

    onConfirm({ approvals, scopingRules });
  };

  const totalCount  = relatedList.length + unlinkedList.length;
  const resolvedCount = Object.values(entries).filter(
    e => e.state !== 'pending',
  ).length + Object.keys(manualLinks).length;

  return (
    <div className="rr-root">
      {/* Header */}
      <div className="rr-header">
        <div>
          <h2 className="rr-title">Review relationships</h2>
          <p className="rr-subtitle">
            We detected {relatedList.length} relationship{relatedList.length !== 1 ? 's' : ''} between{' '}
            <strong>{driverKey}</strong> and other collections.
            {pendingCount > 0 && (
              <span className="rr-pending-note">
                {' '}{pendingCount} need{pendingCount === 1 ? 's' : ''} your approval.
              </span>
            )}
          </p>
        </div>
        <div className="rr-progress-pill">
          {resolvedCount}/{totalCount} resolved
        </div>
      </div>

      {/* Driver summary */}
      <div className="rr-driver-bar">
        <span className="rr-driver-dot" />
        <span className="rr-driver-label">Driver: <strong>{driverKey}</strong></span>
        <span className="rr-driver-meta">
          {ir.collections[driverKey]?.rows.length ?? 0} records · one PDF per record
        </span>
      </div>

      {/* Relationship rows */}
      <div className="rr-body">
        {relatedList.map(rel => (
          <RelRow
            key={rel.collectionKey}
            ir={ir}
            driverKey={driverKey}
            entry={entries[rel.collectionKey]}
            onChange={updateEntry}
          />
        ))}

        {unlinkedList.map(collKey => (
          <UnlinkedRow
            key={collKey}
            ir={ir}
            driverKey={driverKey}
            collKey={collKey}
            onLinked={(ck, fc, drf) =>
              setManualLinks(prev => ({ ...prev, [ck]: { filterColumn: fc, driverRowField: drf } }))
            }
          />
        ))}

        {relatedList.length === 0 && unlinkedList.length === 0 && (
          <div className="rr-empty">
            Only one collection found — no relationships to review.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="rr-footer">
        <button className="rr-btn-secondary" onClick={onBack} type="button">
          ← Back
        </button>
        <button
          className="rr-btn-primary"
          onClick={handleConfirm}
          disabled={pendingCount > 0}
          type="button"
          title={pendingCount > 0
            ? `${pendingCount} relationship${pendingCount > 1 ? 's' : ''} still need review`
            : undefined
          }
        >
          {pendingCount > 0
            ? `${pendingCount} pending — review first`
            : 'Confirm relationships →'
          }
        </button>
      </div>
    </div>
  );
};