/**
 * DataStructureViewer.tsx
 *
 * On-demand data relationship inspector — shown only in bulk export mode
 * when the user clicks "View structure". Not part of the upload flow.
 *
 * CHANGES FROM PREVIOUS VERSION
 * ──────────────────────────────
 * - Removed from the upload flow entirely (no more "Proceed to mapping" step)
 * - "Back" button renamed to "Close" — there's no flow to go back to
 * - onConfirm renamed to onClose for clarity (both buttons do the same thing)
 * - Props simplified: onClose only, onConfirm removed
 * - Minor: description text updated to reflect the new context
 */

import React, { useState, useMemo } from 'react';
import type { CanonicalDocument } from '../../types/dataSource';
import { detectRelationships } from '../../utils/relationshipDetector';
import './DataStructureViewer.css';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface DataStructureViewerProps {
  ir:      CanonicalDocument;
  onClose: () => void;
  /** @deprecated kept for backward compat — same as onClose */
  onConfirm?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// TreeNode
// ─────────────────────────────────────────────────────────────────────────────

interface TreeNodeProps {
  nodeKey:  string;
  value:    unknown;
  depth:    number;
  isLast?:  boolean;
  hideKey?: boolean;
}

function formatPrimitive(v: unknown): { text: string; cls: string } {
  if (v === null || v === undefined) return { text: 'null',       cls: 'dsv-null' };
  if (typeof v === 'boolean')         return { text: String(v),   cls: 'dsv-bool' };
  if (typeof v === 'number')          return { text: String(v),   cls: 'dsv-num'  };
  return { text: `"${String(v)}"`, cls: 'dsv-str' };
}

function inlinePreview(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.length} item${value.length !== 1 ? 's' : ''}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as object).slice(0, 2);
    const parts   = entries.map(([k, v]) => {
      const vStr = typeof v === 'string'  ? `"${v}"`
                 : typeof v === 'number'  ? String(v)
                 : typeof v === 'boolean' ? String(v)
                 : Array.isArray(v)       ? `[…]`
                 : v && typeof v === 'object' ? `{…}` : 'null';
      return `${k}: ${vStr}`;
    });
    const extra = Object.keys(value as object).length > 2
      ? `, … +${Object.keys(value as object).length - 2}` : '';
    return `{ ${parts.join(', ')}${extra} }`;
  }
  return String(value);
}

function TreeNode({ nodeKey, value, depth, isLast, hideKey }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const isArr  = Array.isArray(value);
  const isObj  = !isArr && value !== null && typeof value === 'object';
  const isPrim = !isArr && !isObj;

  const keyLabel = hideKey || nodeKey === ''
    ? null
    : <span className="dsv-key">&quot;{nodeKey}&quot;<span className="dsv-colon">: </span></span>;

  if (isPrim) {
    const { text, cls } = formatPrimitive(value);
    return (
      <div className="dsv-leaf">
        {keyLabel}
        <span className={cls}>{text}</span>
        {!isLast && <span className="dsv-punct">,</span>}
      </div>
    );
  }

  const open  = isArr ? '[' : '{';
  const close = isArr ? ']' : '}';
  const items = isArr
    ? (value as unknown[])
    : Object.entries(value as Record<string, unknown>);

  return (
    <div className="dsv-node">
      <div
        className="dsv-row"
        onClick={() => setExpanded(e => !e)}
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setExpanded(v => !v)}
      >
        <span className="dsv-toggle" aria-hidden="true">{expanded ? '−' : '+'}</span>
        {keyLabel}
        {expanded ? (
          <span className="dsv-punct">{open}</span>
        ) : (
          <>
            <span className="dsv-preview">{inlinePreview(value)}</span>
            {!isLast && <span className="dsv-punct">,</span>}
          </>
        )}
      </div>

      {expanded && (
        <div className="dsv-children">
          {isArr
            ? (items as unknown[]).map((item, i) => (
                <TreeNode
                  key={i}
                  nodeKey={String(i)}
                  value={item}
                  depth={depth + 1}
                  isLast={i === (items as unknown[]).length - 1}
                  hideKey={typeof item === 'object' && item !== null}
                />
              ))
            : (items as [string, unknown][]).map(([k, v], i, arr) => (
                <TreeNode
                  key={k}
                  nodeKey={k}
                  value={v}
                  depth={depth + 1}
                  isLast={i === arr.length - 1}
                />
              ))
          }
          <div className="dsv-close">
            <span className="dsv-punct">{close}</span>
            {!isLast && <span className="dsv-punct">,</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const DataStructureViewer: React.FC<DataStructureViewerProps> = ({ ir, onClose }) => {
  const [currentRecordIdx, setCurrentRecordIdx] = useState(0);

  const relationships = useMemo(() => detectRelationships(ir), [ir]);

  const driverKey = useMemo((): string | null => {
    const keys = Object.keys(ir.collections);
    if (keys.length === 0) return null;

    const withRelated = Object.entries(relationships)
      .filter(([, rel]) => rel.relatedCollections.length > 0)
      .sort(([, a], [, b]) => a.rowCount - b.rowCount);

    if (withRelated.length > 0) return withRelated[0][0];

    return keys.reduce((a, b) =>
      ir.collections[a].rows.length <= ir.collections[b].rows.length ? a : b
    );
  }, [relationships, ir.collections]);

  const driverRows = useMemo(
    () => (driverKey ? ir.collections[driverKey]?.rows ?? [] : []),
    [driverKey, ir.collections],
  );

  const totalRecords = driverRows.length;

  const navigatorData = useMemo((): Record<string, unknown> | null => {
    if (!driverKey || driverRows.length === 0) return null;

    const row       = driverRows[Math.min(currentRecordIdx, driverRows.length - 1)];
    const driverRel = relationships[driverKey];
    const data: Record<string, unknown> = { ...row };

    for (const [collKey, coll] of Object.entries(ir.collections)) {
      if (collKey === driverKey) continue;

      const relDef = driverRel?.relatedCollections.find(r => r.collectionKey === collKey);

      if (relDef) {
        const joinVal = String((row as Record<string, unknown>)[relDef.primaryKey] ?? '');
        data[collKey] = coll.rows.filter(
          r => String((r as Record<string, unknown>)[relDef.foreignKey] ?? '') === joinVal,
        );
      } else {
        data[collKey] = coll.rows;
      }
    }

    return data;
  }, [driverKey, driverRows, currentRecordIdx, ir.collections, relationships]);

  const driverRel    = driverKey ? relationships[driverKey] : undefined;
  const relatedColls = driverRel?.relatedCollections ?? [];
  const canNavigate  = totalRecords > 1;

  return (
    <div className="dsv-root">

      <div className="dsv-header">
        <h3>Data Structure</h3>
        <p className="dsv-description">
          Inspect collection relationships before bulk export.
          {canNavigate && ' Navigate records to verify that related rows update correctly.'}
        </p>
      </div>

      {driverKey && (
        <div className="dsv-rel-bar">
          <div className="dsv-rel-item dsv-rel-driver">
            <span className="dsv-rel-dot dsv-dot-driver" />
            <span className="dsv-rel-name">{driverKey}</span>
            <span className="dsv-rel-meta">{totalRecords} records · 1 PDF per record</span>
          </div>
          {relatedColls.map(rel => (
            <div key={rel.collectionKey} className="dsv-rel-item dsv-rel-related">
              <span className="dsv-rel-dot dsv-dot-related" />
              <span className="dsv-rel-name">{rel.collectionKey}</span>
              <span className="dsv-rel-meta">
                ~{rel.avgRowsPerParent} rows per record · linked by{' '}
                <code className="dsv-code">{rel.foreignKey}</code>
              </span>
            </div>
          ))}
          {relatedColls.length === 0 && (
            <span className="dsv-rel-none">No related collections detected</span>
          )}
        </div>
      )}

      {canNavigate && (
        <div className="dsv-nav-bar">
          <button
            className="dsv-nav-btn"
            onClick={() => setCurrentRecordIdx(i => Math.max(0, i - 1))}
            disabled={currentRecordIdx === 0}
            aria-label="Previous record"
          >‹</button>
          <span className="dsv-nav-label">
            record {currentRecordIdx + 1} of {totalRecords}
            {driverKey && <span className="dsv-nav-coll"> ({driverKey})</span>}
          </span>
          <button
            className="dsv-nav-btn"
            onClick={() => setCurrentRecordIdx(i => Math.min(totalRecords - 1, i + 1))}
            disabled={currentRecordIdx === totalRecords - 1}
            aria-label="Next record"
          >›</button>
        </div>
      )}

      <div className="dsv-tree" role="tree" aria-label="data structure tree">
        {navigatorData ? (
          <TreeNode nodeKey="" value={navigatorData} depth={0} hideKey isLast />
        ) : (
          <div className="dsv-empty">No data to preview.</div>
        )}
      </div>

      <div className="dsv-footer">
        <button className="dsv-btn dsv-btn-confirm" onClick={onClose}>
          Close
        </button>
      </div>

    </div>
  );
};

export default DataStructureViewer;