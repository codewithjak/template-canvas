/**
 * UploadData.tsx
 * Redesigned upload panel that handles the new ParsedDataSource structure:
 *   - Section 1: Static field mapping  (template placeholder → metadata key)
 *   - Section 2: Per-table mapping     (collection picker + column mapping)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type { ParsedDataSource, BoundData, TableInfo } from '../../types/dataSource';
import {
  buildInitialBoundData,
  autoMapCollectionFields,
} from '../../services/dataSourceService';
import './UploadData.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface UploadDataProps {
  staticPlaceholders: string[];
  tables: TableInfo[];
  onClose: () => void;
  onDataMapped: (boundData: BoundData) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function summariseCollections(collections: ParsedDataSource['collections']) {
  return Object.entries(collections)
    .map(([k, c]) => `${k} (${c.rows.length} rows)`)
    .join(', ');
}

// ── Component ─────────────────────────────────────────────────────────────────

const UploadData: React.FC<UploadDataProps> = ({
  staticPlaceholders,
  tables,
  onClose,
  onDataMapped,
}) => {
  const [source, setSource] = useState<ParsedDataSource | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mapping state
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [tableCollectionBindings, setTableCollectionBindings] = useState<Record<string, string>>({});
  const [collectionMappings, setCollectionMappings] = useState<Record<string, Record<string, string>>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // ── Initialise mappings when source loads ─────────────────────────────────

  const initMappings = useCallback(
    (src: ParsedDataSource) => {
      const initial = buildInitialBoundData(src, staticPlaceholders, tables);
      setFieldMapping(initial.fieldMapping);
      setTableCollectionBindings(initial.tableCollectionBindings);
      setCollectionMappings(initial.collectionMappings);
    },
    [staticPlaceholders, tables]
  );

  // ── File parsing ──────────────────────────────────────────────────────────

  const parseFile = useCallback(
    async (file: File) => {
      setError(null);
      setParsing(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE}/parse-data`, { method: 'POST', body: formData });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Unable to parse file.');
        }
        const data = await res.json();
        const src: ParsedDataSource = {
          metadata: data.metadata || {},
          collections: data.collections || {},
          fileName: data.fileName,
          fileType: data.fileType,
        };
        setSource(src);
        initMappings(src);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Parse failed.');
      } finally {
        setParsing(false);
      }
    },
    [initMappings]
  );

  const onDrop = useCallback(
    (files: File[]) => { if (files[0]) parseFile(files[0]); },
    [parseFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/json': ['.json'],
    },
    maxFiles: 1,
    multiple: false,
    noClick: true,
  });

  // ── Collection binding change ─────────────────────────────────────────────

  const handleCollectionChange = (tableId: string, collKey: string) => {
    setTableCollectionBindings(prev => ({ ...prev, [tableId]: collKey }));

    // Auto-remap columns for the newly selected collection
    if (source && collKey) {
      const tableInfo = tables.find(t => t.id === tableId);
      const col = source.collections[collKey];
      if (tableInfo && col) {
        const autoMapped = autoMapCollectionFields(tableInfo.placeholders, col.headers);
        setCollectionMappings(prev => ({
          ...prev,
          [collKey]: { ...(prev[collKey] || {}), ...autoMapped },
        }));
      }
    }
  };

  // ── Confirm ───────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!source) return;
    onDataMapped({ source, fieldMapping, tableCollectionBindings, collectionMappings });
  };

  const canConfirm =
    !!source &&
    (staticPlaceholders.length === 0 || Object.values(fieldMapping).some(v => v)) ||
    (tables.length === 0 && !!source);

  // ── Render ────────────────────────────────────────────────────────────────

  const metadataKeys = source ? Object.keys(source.metadata) : [];
  const collectionKeys = source ? Object.keys(source.collections) : [];

  return (
    <div className="upload-panel">
      <div className="upload-panel-card">

        {/* Header */}
        <div className="upload-panel-header">
          <div>
            <h2>Upload Data</h2>
            <p>Upload CSV, Excel, or JSON — map metadata fields and table columns to your template.</p>
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
            <button type="button" className="upload-browse-btn" onClick={() => fileInputRef.current?.click()}>
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
        {source && (
          <div className="upload-summary">
            <div className="upload-summary-row">
              <div><p className="upload-summary-label">File</p><strong>{source.fileName}</strong></div>
              <div>
                <p className="upload-summary-label">Metadata fields</p>
                <strong>{metadataKeys.length}</strong>
              </div>
              <div>
                <p className="upload-summary-label">Collections</p>
                <strong>{collectionKeys.length === 0 ? 'none' : summariseCollections(source.collections)}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── Section 1: Static field mapping ───────────────────────────── */}
        {source && staticPlaceholders.length > 0 && (
          <div className="mapping-panel">
            <div className="mapping-panel-header">
              <h3>Static field mapping</h3>
              <p>Map each template placeholder to a metadata field from your file.</p>
            </div>
            <div className="mapping-grid">
              {staticPlaceholders.map(ph => (
                <label key={ph} className="mapping-row">
                  <span title={ph}>{ph}</span>
                  <select
                    value={fieldMapping[ph] ?? ''}
                    onChange={e => setFieldMapping(prev => ({ ...prev, [ph]: e.target.value }))}
                  >
                    <option value="">— select —</option>
                    {metadataKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Section 2: Per-table collection + column mapping ──────────── */}
        {source && tables.length > 0 && (
          <>
            {tables.map(table => {
              const boundCollKey = tableCollectionBindings[table.id] || '';
              const boundCollection = boundCollKey ? source.collections[boundCollKey] : null;
              const colHeaders = boundCollection?.headers || [];
              const colMap = collectionMappings[boundCollKey] || {};

              return (
                <div key={table.id} className="mapping-panel">
                  <div className="mapping-panel-header">
                    <h3>{table.label} — data source</h3>
                    <p>Choose which collection provides rows for this table, then map columns.</p>
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
                            {k} ({source.collections[k].rows.length} rows)
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {/* Column mapping */}
                  {boundCollection && table.placeholders.length > 0 && (
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
                                  [boundCollKey]: { ...(prev[boundCollKey] || {}), [ph]: e.target.value },
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

                  {boundCollKey && collectionKeys.length > 0 && !boundCollection && (
                    <p className="upload-error" style={{ marginTop: 8 }}>
                      Collection "{boundCollKey}" not found in uploaded file.
                    </p>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Actions */}
        <div className="upload-actions">
          <button type="button" className="upload-secondary" onClick={onClose}>Cancel</button>
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