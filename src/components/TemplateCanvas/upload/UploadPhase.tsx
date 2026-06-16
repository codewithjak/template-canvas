/**
 * UploadPhase.tsx
 *
 * Phase 1 of the wizard: drop (or browse to) a data file. Shows the chosen
 * intent, a summary of the parsed file if one is loaded, the drop area itself,
 * and any parse error or single-collection warning.
 *
 * The drop-area plumbing (getRootProps / getInputProps / isDragActive) is
 * created by react-dropzone in the parent and passed in, because the parent
 * owns the parsing.
 */

import type { RefObject } from 'react';
import type { DropzoneInputProps, DropzoneRootProps } from 'react-dropzone';
import type { CanonicalDocument } from '../../../types/dataSource';
import type { UploadIntent } from '../../../types/runtimeDataStructure';

interface Props {
  intent: UploadIntent;
  ir: CanonicalDocument | null;
  parsing: boolean;
  error: string | null;
  collectionKeys: string[];
  onChangeIntent: () => void;
  getRootProps: <T extends DropzoneRootProps>(props?: T) => T;
  getInputProps: <T extends DropzoneInputProps>(props?: T) => T;
  isDragActive: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

/** A short "sheet (rows) · sheet (rows)" summary of the parsed collections. */
function collectionSummary(collections: CanonicalDocument['collections']): string {
  return Object.entries(collections)
    .map(([k, c]) => `${k} (${c.rows.length})`)
    .join(' · ');
}

function UploadPhase({
  intent,
  ir,
  parsing,
  error,
  collectionKeys,
  onChangeIntent,
  getRootProps,
  getInputProps,
  isDragActive,
  fileInputRef,
}: Props) {
  const isRelational = intent === 'relational';

  return (
    <>
      {/* Intent badge */}
      <div className="up-intent-bar">
        <span className={`up-intent-chip ${intent === 'flat' ? 'up-intent-chip--flat' : 'up-intent-chip--relational'}`}>
          {intent === 'flat' ? '⊟ Flat — one row per PDF' : '⊞ Relational — linked sheets'}
        </span>
        <button className="up-intent-change" onClick={onChangeIntent} type="button">
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
            {collectionKeys.map((k) => (
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

      {ir && isRelational && Object.keys(ir.collections).length <= 1 && (
        <div className="upload-warning up-single-coll-warn">
          ⚠ Only one collection found. Expected multiple sheets for relational data.
          Is your data split across sheets in the file?
        </div>
      )}
    </>
  );
}

export default UploadPhase;
