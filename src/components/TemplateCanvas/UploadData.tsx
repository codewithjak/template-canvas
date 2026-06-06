/**
 * UploadData.tsx
 *
 * Upload UI rewritten against the CanonicalDocument IR.
 * No ParsedDataSource. No BoundData. No metadata aliases.
 *
 * Flow
 * ────
 *  1. User drops a file → POST /parse-data → CanonicalDocument
 *  2. Auto-map static placeholders → ir.fields keys
 *  3. Auto-map table placeholders  → collection column names
 *  4. User can refine mappings via dropdowns / fallback inputs
 *  5. Confirm → onConfirm(ir, fieldMapping, tableCollectionBindings, collectionMappings)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type {
  CanonicalDocument,
  FieldMapping,
  TableCollectionBindings,
  CollectionMappings,
  TableInfo,
} from '../../types/dataSource';
import {
  buildInitialMappings,
  autoMapCollectionFields,
} from '../../services/mappingEngine';
import { parseFile } from '../../services/dataSourceService';
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
  ) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function summariseCollections(collections: CanonicalDocument['collections']): string {
  return Object.entries(collections)
    .map(([k, c]) => `${k} (${c.rows.length} rows)`)
    .join(', ') || 'none';
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
  const [ir,      setIr]      = useState<CanonicalDocument | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Mapping state
  const [fieldMapping,            setFieldMapping]            = useState<FieldMapping>({});
  const [tableCollectionBindings, setTableCollectionBindings] = useState<TableCollectionBindings>({});
  const [collectionMappings,      setCollectionMappings]      = useState<CollectionMappings>({});

  // Fallback values: placeholder → hardcoded string typed by the user
  // Used when the dropdown is left at "— select —"
  const [staticFallbacks, setStaticFallbacks] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Init mappings when IR loads ───────────────────────────────────────────

  const initMappings = useCallback((doc: CanonicalDocument) => {
    const { fieldMapping, tableCollectionBindings, collectionMappings } =
      buildInitialMappings(doc, staticPlaceholders, tables);
    setFieldMapping(fieldMapping);
    setTableCollectionBindings(tableCollectionBindings);
    setCollectionMappings(collectionMappings);
    setStaticFallbacks({});
  }, [staticPlaceholders, tables]);

  // ── File parsing ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setParsing(true);
    try {
      const doc = await parseFile(file);
      setIr(doc);
      initMappings(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse failed.');
    } finally {
      setParsing(false);
    }
  }, [initMappings]);

  const onDrop = useCallback(
    (files: File[]) => { if (files[0]) handleFile(files[0]); },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv':                                                              ['.csv'],
      'application/vnd.ms-excel':                                             ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':   ['.xlsx'],
      'application/json':                                                     ['.json'],
    },
    maxFiles: 1,
    multiple: false,
    noClick:  true,
  });

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

  // ── Confirm ───────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!ir) return;

    // Inject fallback values directly into ir.fields so replacePlaceholders
    // resolves them without any extra logic: dataKey = fieldMapping[key] || key
    const enrichedFields = { ...ir.fields };
    for (const ph of staticPlaceholders) {
      if (!fieldMapping[ph] && staticFallbacks[ph]) {
        enrichedFields[ph] = staticFallbacks[ph];
      }
    }

    const enrichedIr: CanonicalDocument = { ...ir, fields: enrichedFields };
    onConfirm(enrichedIr, fieldMapping, tableCollectionBindings, collectionMappings);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const fieldKeys      = ir ? Object.keys(ir.fields)       : [];
  const collectionKeys = ir ? Object.keys(ir.collections)  : [];

  const canConfirm = !!ir && (
    staticPlaceholders.length === 0 ||
    staticPlaceholders.some(ph =>
      fieldMapping[ph] || (staticFallbacks[ph] ?? '') !== ''
    ) ||
    tables.length === 0
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="upload-panel">
      <div className="upload-panel-card">

        {/* Header */}
        <div className="upload-panel-header">
          <div>
            <h2>Upload Data</h2>
            <p>Upload CSV, Excel, or JSON — map fields and table columns to your template.</p>
          </div>
          <button className="upload-close" type="button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`upload-dropzone ${isDragActive ? 'active' : ''} ${parsing ? 'parsing' : ''}`}
        >
          <input {...getInputProps()} ref={fileInputRef} />
          <div className="upload-content">
            <div className="upload-icon">📁</div>
            <h3>Drop a file here</h3>
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
              <p>Parsing…</p>
            </div>
          )}
        </div>

        {error && <div className="upload-error">{error}</div>}

        {/* File summary */}
        {ir && (
          <div className="upload-summary">
            <div className="upload-summary-row">
              <div>
                <p className="upload-summary-label">File</p>
                <strong>{ir.source?.fileName ?? '—'}</strong>
              </div>
              <div>
                <p className="upload-summary-label">Fields</p>
                <strong>{fieldKeys.length}</strong>
              </div>
              <div>
                <p className="upload-summary-label">Collections</p>
                <strong>{summariseCollections(ir.collections)}</strong>
              </div>
            </div>
            {(ir.source?.warnings?.length ?? 0) > 0 && (
              <div className="upload-warnings">
                {ir.source!.warnings!.map((w, i) => (
                  <p key={i} className="upload-warning">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Section 1: Static field mapping ───────────────────────────── */}
        {ir && staticPlaceholders.length > 0 && (
          <div className="mapping-panel">
            <div className="mapping-panel-header">
              <h3>Static field mapping</h3>
              <p>
                Map each placeholder to a field from your file, or type a value directly.
              </p>
            </div>
            <div className="mapping-grid">
              {staticPlaceholders.map(ph => {
                const isMapped = !!fieldMapping[ph];
                const fallback = staticFallbacks[ph] ?? '';
                return (
                  <div key={ph} className="mapping-row-group">
                    <span className="mapping-placeholder-label" title={ph}>{ph}</span>

                    {/* Dropdown — map to ir.fields key */}
                    <select
                      className="mapping-select"
                      value={fieldMapping[ph] ?? ''}
                      onChange={e => {
                        setFieldMapping(prev => ({ ...prev, [ph]: e.target.value }));
                        if (e.target.value) {
                          setStaticFallbacks(prev => ({ ...prev, [ph]: '' }));
                        }
                      }}
                    >
                      <option value="">— select —</option>
                      {fieldKeys.map(k => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>

                    {/* Fallback text input — shown when nothing selected */}
                    {!isMapped && (
                      <input
                        type="text"
                        className="mapping-fallback-input"
                        placeholder="or type a value…"
                        value={fallback}
                        onChange={e =>
                          setStaticFallbacks(prev => ({ ...prev, [ph]: e.target.value }))
                        }
                      />
                    )}

                    <span
                      className={`mapping-status ${
                        isMapped  ? 'mapping-status--mapped'   :
                        fallback  ? 'mapping-status--fallback' :
                                    'mapping-status--empty'
                      }`}
                    >
                      {isMapped ? '✓ file' : fallback ? '✓ manual' : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Section 2: Per-table collection + column mapping ──────────── */}
        {ir && tables.length > 0 && tables.map(table => {
          const boundCollKey  = tableCollectionBindings[table.id] ?? '';
          const boundCol      = boundCollKey ? ir.collections[boundCollKey] : null;
          const colHeaders    = boundCol?.columns ?? [];
          const colMap        = collectionMappings[boundCollKey] ?? {};

          return (
            <div key={table.id} className="mapping-panel">
              <div className="mapping-panel-header">
                <h3>{table.label} — data source</h3>
                <p>Choose which collection provides rows, then map columns.</p>
              </div>

              {/* Collection picker */}
              <div className="mapping-collection-picker">
                <label className="mapping-row">
                  <span>Collection</span>
                  <select
                    value={boundCollKey}
                    onChange={e => handleCollectionChange(table.id, e.target.value)}
                  >
                    <option value="">— none —</option>
                    {collectionKeys.map(k => (
                      <option key={k} value={k}>
                        {k} ({ir.collections[k].rows.length} rows)
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Column mapping */}
              {boundCol && table.placeholders.length > 0 && (
                <>
                  <p className="mapping-subheading">Column mapping</p>
                  <div className="mapping-grid">
                    {table.placeholders.map(ph => (
                      <label key={ph} className="mapping-row">
                        <span title={ph}>{ph}</span>
                        <select
                          value={colMap[ph] ?? ''}
                          onChange={e =>
                            setCollectionMappings(prev => ({
                              ...prev,
                              [boundCollKey]: {
                                ...(prev[boundCollKey] ?? {}),
                                [ph]: e.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">— select column —</option>
                          {colHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {boundCollKey && !boundCol && (
                <p className="upload-error" style={{ marginTop: 8 }}>
                  Collection "{boundCollKey}" not found in uploaded file.
                </p>
              )}
            </div>
          );
        })}

        {/* Actions */}
        <div className="upload-actions">
          <button type="button" className="upload-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="upload-confirm"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            Confirm mapping
          </button>
        </div>

      </div>
    </div>
  );
};

export default UploadData;