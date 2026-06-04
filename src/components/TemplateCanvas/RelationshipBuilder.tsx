/**
 * RelationshipBuilder.tsx
 *
 * Four-step guided wizard for manually establishing a relationship between
 * a driver collection and a child collection.
 *
 * Used in two contexts:
 *   1. From RelationshipReview when confidence is 'uncertain' or 'none'
 *   2. When the user clicks "Edit link" on an existing suggestion
 *
 * Steps:
 *   1. Overview    — shows both collections as cards
 *   2. Link        — column selector: driver.PK matches child.FK
 *   3. Preview     — live join preview using buildRenderContext logic client-side
 *   4. Confirm     — writes ScopingRule with user-defined confidence: 1.0
 *
 * The join preview (Step 3) runs entirely client-side in useMemo — no network
 * call needed. The same filtering logic used by buildRenderContext is reused
 * directly here, eliminating the dual-implementation problem.
 */

import React, { useState, useMemo } from 'react';
import type { CanonicalDocument } from '../../types/dataSource';
import './RelationshipBuilder.css';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RelationshipBuilderProps {
  ir:                     CanonicalDocument;
  driverKey:              string;
  childKey:               string;
  initialFilterColumn?:   string;
  initialDriverRowField?: string;
  onComplete: (result: {
    filterColumn:   string;
    driverRowField: string;
  }) => void;
  onCancel: () => void;
}

type Step = 1 | 2 | 3;

// ─────────────────────────────────────────────────────────────────────────────
// Identifier column heuristic
// ─────────────────────────────────────────────────────────────────────────────

const ID_SUFFIXES = ['_id', '_number', '_code', '_key', '_ref', '_no'];

function scoreColumn(col: string, collectionName: string): number {
  const lower = col.toLowerCase();
  const collLower = collectionName.toLowerCase();
  if (lower === 'id' || lower === collLower + '_id') return 10;
  if (ID_SUFFIXES.some(s => lower.endsWith(s))) return 8;
  if (lower.includes(collLower)) return 6;
  if (lower.includes('_id') || lower.includes('_code')) return 4;
  return 0;
}

function sortedColumns(columns: string[], collectionName: string): string[] {
  return [...columns].sort(
    (a, b) => scoreColumn(b, collectionName) - scoreColumn(a, collectionName),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator
// ─────────────────────────────────────────────────────────────────────────────

const StepIndicator: React.FC<{ current: Step }> = ({ current }) => {
  const steps = [
    { n: 1 as Step, label: 'Overview' },
    { n: 2 as Step, label: 'Link columns' },
    { n: 3 as Step, label: 'Preview' },
  ];
  return (
    <div className="rb-steps">
      {steps.map((s, i) => (
        <React.Fragment key={s.n}>
          <div className={`rb-step ${current === s.n ? 'rb-step--active' : ''} ${current > s.n ? 'rb-step--done' : ''}`}>
            <div className="rb-step-dot">
              {current > s.n ? '✓' : s.n}
            </div>
            <span className="rb-step-label">{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`rb-step-line ${current > s.n ? 'rb-step-line--done' : ''}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export const RelationshipBuilder: React.FC<RelationshipBuilderProps> = ({
  ir,
  driverKey,
  childKey,
  initialFilterColumn,
  initialDriverRowField,
  onComplete,
  onCancel,
}) => {
  const [step, setStep] = useState<Step>(1);

  const driverColl = ir.collections[driverKey];
  const childColl  = ir.collections[childKey];

  const driverColumns = useMemo(
    () => driverColl ? sortedColumns(
      driverColl.columns ?? Object.keys(driverColl.rows[0] ?? {}),
      driverKey,
    ) : [],
    [driverColl, driverKey],
  );

  const childColumns = useMemo(
    () => childColl ? sortedColumns(
      childColl.columns ?? Object.keys(childColl.rows[0] ?? {}),
      childKey,
    ) : [],
    [childColl, childKey],
  );

  const [driverField,  setDriverField]  = useState<string>(
    initialDriverRowField ?? driverColumns[0] ?? '',
  );
  const [filterColumn, setFilterColumn] = useState<string>(
    initialFilterColumn ?? childColumns[0] ?? '',
  );

  // ── Live join preview — client-side, no network call ──────────────────────
  const joinPreview = useMemo(() => {
    if (!driverColl || !childColl || !driverField || !filterColumn) return null;

    const previews: Array<{
      driverRow:   Record<string, unknown>;
      matchedRows: Record<string, unknown>[];
    }> = [];

    for (const driverRow of driverColl.rows.slice(0, 3)) {
      const matchValue  = String(driverRow[driverField] ?? '');
      const matchedRows = childColl.rows.filter(
        r => String(r[filterColumn] ?? '') === matchValue,
      );
      previews.push({ driverRow, matchedRows });
    }

    const totalMatched = childColl.rows.filter(r => {
      const driverValues = new Set(
        driverColl.rows.map(dr => String(dr[driverField] ?? '')),
      );
      return driverValues.has(String(r[filterColumn] ?? ''));
    }).length;

    return {
      previews,
      totalMatched,
      coverage: childColl.rows.length > 0
        ? totalMatched / childColl.rows.length : 0,
    };
  }, [driverColl, childColl, driverField, filterColumn]);

  const coverageGood = (joinPreview?.coverage ?? 0) >= 0.8;

  // ── Step renders ──────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="rb-step-content">
      <p className="rb-step-desc">
        These are the two collections we'll link. The driver has one record per document.
        Related rows in <strong>{childKey}</strong> will be scoped per record.
      </p>

      <div className="rb-coll-cards">
        <div className="rb-coll-card rb-coll-card--driver">
          <div className="rb-coll-card-header">
            <span className="rb-coll-role">Driver</span>
            <span className="rb-coll-name">{driverKey}</span>
          </div>
          <div className="rb-coll-stats">
            {driverColl?.rows.length ?? 0} records · {driverColumns.length} columns
          </div>
          <div className="rb-coll-cols">
            {driverColumns.slice(0, 5).map(c => (
              <span key={c} className="rb-col-chip">{c}</span>
            ))}
            {driverColumns.length > 5 && (
              <span className="rb-col-more">+{driverColumns.length - 5}</span>
            )}
          </div>
        </div>

        <div className="rb-coll-link-arrow">
          <div className="rb-arrow-line" />
          <div className="rb-arrow-head">→</div>
        </div>

        <div className="rb-coll-card rb-coll-card--child">
          <div className="rb-coll-card-header">
            <span className="rb-coll-role rb-coll-role--child">Related</span>
            <span className="rb-coll-name">{childKey}</span>
          </div>
          <div className="rb-coll-stats">
            {childColl?.rows.length ?? 0} rows · {childColumns.length} columns
          </div>
          <div className="rb-coll-cols">
            {childColumns.slice(0, 5).map(c => (
              <span key={c} className="rb-col-chip">{c}</span>
            ))}
            {childColumns.length > 5 && (
              <span className="rb-col-more">+{childColumns.length - 5}</span>
            )}
          </div>
        </div>
      </div>

      <div className="rb-nav">
        <button className="rb-btn-secondary" onClick={onCancel} type="button">Cancel</button>
        <button className="rb-btn-primary" onClick={() => setStep(2)} type="button">
          Choose columns →
        </button>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="rb-step-content">
      <p className="rb-step-desc">
        Pick the columns that link these two collections. The driver column is the
        primary key; the related column is the foreign key.
      </p>

      <div className="rb-col-selector">
        <div className="rb-col-selector-side">
          <label className="rb-col-label">{driverKey} (primary key)</label>
          <select
            className="rb-col-select"
            value={driverField}
            onChange={e => setDriverField(e.target.value)}
          >
            {driverColumns.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {driverColl && driverField && (
            <div className="rb-col-sample">
              {driverColl.rows.slice(0, 3).map((r, i) => (
                <span key={i} className="rb-sample-val">
                  {String(r[driverField] ?? '—')}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="rb-col-selector-arrow">
          <span>matches</span>
        </div>

        <div className="rb-col-selector-side">
          <label className="rb-col-label">{childKey} (foreign key)</label>
          <select
            className="rb-col-select"
            value={filterColumn}
            onChange={e => setFilterColumn(e.target.value)}
          >
            {childColumns.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {childColl && filterColumn && (
            <div className="rb-col-sample">
              {[...new Set(childColl.rows.map(r => String(r[filterColumn] ?? '')))].slice(0, 3).map((v, i) => (
                <span key={i} className="rb-sample-val">{v || '—'}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rb-nav">
        <button className="rb-btn-secondary" onClick={() => setStep(1)} type="button">← Back</button>
        <button
          className="rb-btn-primary"
          onClick={() => setStep(3)}
          disabled={!driverField || !filterColumn}
          type="button"
        >
          Preview join →
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="rb-step-content">
      <div className="rb-preview-header">
        <p className="rb-step-desc" style={{ margin: 0 }}>
          Showing the first 3 {driverKey} records with their matched {childKey} rows.
        </p>
        {joinPreview && (
          <span className={`rb-coverage-badge ${coverageGood ? 'rb-coverage--good' : 'rb-coverage--warn'}`}>
            {Math.round((joinPreview.coverage) * 100)}% coverage
          </span>
        )}
      </div>

      {!coverageGood && joinPreview && (
        <div className="rb-coverage-warning">
          ⚠ Only {joinPreview.totalMatched} of {childColl?.rows.length ?? 0} child rows
          match a driver record. Check the column selection.
        </div>
      )}

      <div className="rb-join-previews">
        {joinPreview?.previews.map(({ driverRow, matchedRows }, i) => (
          <div key={i} className="rb-join-block">
            <div className="rb-join-driver">
              <span className="rb-join-driver-label">{driverKey}</span>
              {Object.entries(driverRow).slice(0, 4).map(([k, v]) => (
                <span key={k} className="rb-join-field">
                  <span className="rb-join-field-key">{k}:</span>
                  <span className="rb-join-field-val">{String(v ?? '')}</span>
                </span>
              ))}
            </div>
            <div className="rb-join-arrow-down">↓ {matchedRows.length} row{matchedRows.length !== 1 ? 's' : ''}</div>
            {matchedRows.length > 0 ? (
              <div className="rb-join-children">
                {matchedRows.slice(0, 3).map((row, j) => (
                  <div key={j} className="rb-join-child-row">
                    {Object.entries(row).slice(0, 4).map(([k, v]) => (
                      <span key={k} className="rb-join-field">
                        <span className="rb-join-field-key">{k}:</span>
                        <span className="rb-join-field-val">{String(v ?? '')}</span>
                      </span>
                    ))}
                  </div>
                ))}
                {matchedRows.length > 3 && (
                  <div className="rb-join-more">+{matchedRows.length - 3} more</div>
                )}
              </div>
            ) : (
              <div className="rb-join-empty">No matching rows</div>
            )}
          </div>
        ))}
      </div>

      <div className="rb-nav">
        <button className="rb-btn-secondary" onClick={() => setStep(2)} type="button">← Edit columns</button>
        <button
          className="rb-btn-primary"
          onClick={() => onComplete({ filterColumn, driverRowField: driverField })}
          type="button"
        >
          Confirm link ✓
        </button>
      </div>
    </div>
  );

  return (
    <div className="rb-root">
      <StepIndicator current={step} />
      <div className="rb-body">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
};