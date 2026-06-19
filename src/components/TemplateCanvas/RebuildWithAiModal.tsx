/**
 * RebuildWithAiModal.tsx
 *
 * The "Rebuild with Mapdoc AI" experience: upload one PDF, watch the pipeline
 * run step-by-step, then review a fidelity report before opening the rebuilt
 * template in the editor.
 *
 * It owns the whole flow itself (calls importPdfAsTemplate, drives progress off
 * the service's onProgress callback) and hands the finished result to the parent
 * via onApply — replacing the old hidden-input + alert() path. Each PDF_IMPORT_STEPS
 * entry is one real awaited boundary in the service, so the progress is honest.
 */

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  importPdfAsTemplate,
  PDF_IMPORT_STEPS,
  type PdfImportResult,
  type PdfImportStage,
} from '../../services/pdfImportService';
import './RebuildWithAiModal.css';

interface Props {
  /** Called when the user accepts the rebuilt template ("Open in editor"). */
  onApply: (result: PdfImportResult) => void;
  onClose: () => void;
}

type Phase = 'idle' | 'processing' | 'success' | 'error';

const RebuildWithAiModal: React.FC<Props> = ({ onApply, onClose }) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<PdfImportStage | null>(null);
  const [result, setResult] = useState<PdfImportResult | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) setFile(files[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
    disabled: phase === 'processing',
  });

  const run = async () => {
    if (!file) return;
    setPhase('processing');
    setError('');
    setStage(null);
    try {
      const res = await importPdfAsTemplate(file, { onProgress: setStage });
      setResult(res);
      setPhase('success');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setStage(null);
    setResult(null);
    setError('');
  };

  // The backdrop and close button are inert while the pipeline is running, so a
  // stray click can't orphan an in-flight rebuild.
  const closable = phase !== 'processing';
  const handleBackdrop = () => { if (closable) onClose(); };

  const currentIndex = stage ? PDF_IMPORT_STEPS.findIndex(s => s.id === stage) : -1;

  return (
    <div className="rai-backdrop" onClick={handleBackdrop}>
      <div className="rai-card" onClick={e => e.stopPropagation()}>
        <div className="rai-header">
          <div className="rai-title-wrap">
            <span className="rai-spark" aria-hidden>✦</span>
            <h2 className="rai-title">Rebuild with Mapdoc AI</h2>
          </div>
          {closable && (
            <button className="rai-close" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>

        <div className="rai-body">
          {phase === 'idle' && (
            <>
              <p className="rai-lead">
                Upload a PDF and Mapdoc AI rebuilds it as an editable, tokenized
                template — fields become <code>{'{{placeholders}}'}</code> you can
                link to a data source.
              </p>

              <div
                {...getRootProps()}
                className={`rai-drop ${isDragActive ? 'rai-drop--active' : ''} ${file ? 'rai-drop--has-file' : ''}`}
              >
                <input {...getInputProps()} />
                {file ? (
                  <>
                    <span className="rai-file-icon" aria-hidden>📄</span>
                    <span className="rai-file-name">{file.name}</span>
                    <span className="rai-file-swap">Click or drop to choose a different PDF</span>
                  </>
                ) : (
                  <>
                    <span className="rai-drop-icon" aria-hidden>⬆</span>
                    <span className="rai-drop-title">
                      {isDragActive ? 'Drop the PDF here' : 'Drag a PDF here, or click to browse'}
                    </span>
                    <span className="rai-drop-sub">PDF files only · one at a time</span>
                  </>
                )}
              </div>
            </>
          )}

          {phase === 'processing' && (
            <ul className="rai-steps">
              {PDF_IMPORT_STEPS.map((step, i) => {
                const state =
                  i < currentIndex ? 'done' : i === currentIndex ? 'active' : 'pending';
                return (
                  <li key={step.id} className={`rai-step rai-step--${state}`}>
                    <span className="rai-step-marker" aria-hidden>
                      {state === 'done' ? '✓' : state === 'active' ? <span className="rai-spinner" /> : i + 1}
                    </span>
                    <span className="rai-step-text">
                      <span className="rai-step-label">{step.label}</span>
                      {state === 'active' && <span className="rai-step-hint">{step.hint}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {phase === 'success' && result && (
            <div className="rai-result">
              <div className="rai-result-head">
                <span className="rai-result-check" aria-hidden>✓</span>
                <span className="rai-result-title">
                  Rebuilt {result.report.coverage.mapped} element
                  {result.report.coverage.mapped === 1 ? '' : 's'}
                </span>
              </div>

              <ul className="rai-stats">
                <li><strong>{result.report.coverage.mapped}</strong> mapped</li>
                <li><strong>{result.report.coverage.approximated}</strong> approximated</li>
                <li><strong>{result.report.coverage.dropped}</strong> skipped</li>
                {result.report.lowConfidence.length > 0 && (
                  <li><strong>{result.report.lowConfidence.length}</strong> to review</li>
                )}
              </ul>

              {result.match?.key && result.match.name && (
                <p className="rai-note">
                  Token names aligned to your “{result.match.name}” template.
                </p>
              )}
              <p className="rai-note rai-note--muted">
                This is an AI draft — link a data source to fill it, and review any
                flagged elements.
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="rai-error">
              <span className="rai-error-icon" aria-hidden>⚠</span>
              <p className="rai-error-msg">{error}</p>
            </div>
          )}
        </div>

        <div className="rai-actions">
          {phase === 'idle' && (
            <>
              <button className="rai-btn rai-btn--ghost" onClick={onClose}>Cancel</button>
              <button className="rai-btn rai-btn--primary" onClick={run} disabled={!file}>
                Rebuild
              </button>
            </>
          )}
          {phase === 'processing' && (
            <span className="rai-running">Rebuilding… this won’t take long.</span>
          )}
          {phase === 'success' && result && (
            <>
              <button className="rai-btn rai-btn--ghost" onClick={reset}>Rebuild another</button>
              <button className="rai-btn rai-btn--primary" onClick={() => onApply(result)}>
                Open in editor
              </button>
            </>
          )}
          {phase === 'error' && (
            <>
              <button className="rai-btn rai-btn--ghost" onClick={onClose}>Cancel</button>
              <button className="rai-btn rai-btn--primary" onClick={reset}>Try again</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RebuildWithAiModal;
