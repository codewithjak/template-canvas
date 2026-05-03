import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { autoMapFields } from '../../services/mappingEngine';
import type { DataRow } from '../../services/mappingEngine';
import './UploadData.css';

interface ParsedData {
  headers: string[];
  rows: DataRow[];
  fileType: 'csv' | 'excel';
  fileName: string;
}

interface UploadDataProps {
  templatePlaceholders: string[];
  onClose: () => void;
  onDataMapped: (dataRows: DataRow[], fieldMapping: Record<string, string>, isBatch: boolean) => void;
}

const UploadData: React.FC<UploadDataProps> = ({ templatePlaceholders, onClose, onDataMapped }) => {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [isBatchExport, setIsBatchExport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const parseServerFile = useCallback(async (file: File): Promise<ParsedData> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('http://localhost:3001/parse-data', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const responseData = await response.json().catch(() => null);
      const message = responseData?.error || 'Unable to parse file on server.';
      throw new Error(message);
    }

    const data = await response.json();

    return {
      headers: data.headers,
      rows: data.rows,
      fileType: data.fileType && String(data.fileType).includes('csv') ? 'csv' : 'excel',
      fileName: data.fileName || file.name,
    };
  }, []);

  const initializeFieldMapping = useCallback((headers: string[]) => {
    const mapping = autoMapFields(templatePlaceholders, headers);
    const result: Record<string, string> = {};

    templatePlaceholders.forEach((placeholder) => {
      result[placeholder] = mapping[placeholder] || headers.find((header) => header.toLowerCase() === placeholder.toLowerCase()) || '';
    });

    setFieldMapping(result);
  }, [templatePlaceholders]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setError(null);
    setParsing(true);

    try {
      const file = acceptedFiles[0];
      if (!file) {
        throw new Error('No file selected.');
      }

      const data = await parseServerFile(file);
      setParsedData(data);
      setSelectedRowIndex(0);
      initializeFieldMapping(data.headers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse file.');
    } finally {
      setParsing(false);
    }
  }, [initializeFieldMapping, parseServerFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
    multiple: false,
    noClick: true,
  });

  const handleBrowse = () => {
    fileInputRef.current?.click();
  };

  const handleConfirm = () => {
    if (!parsedData) return;
    if (isBatchExport) {
      onDataMapped(parsedData.rows, fieldMapping, true);
    } else {
      const dataRow = parsedData.rows[selectedRowIndex] || parsedData.rows[0];
      onDataMapped([dataRow], fieldMapping, false);
    }
  };

  const headerOptions = parsedData?.headers || [];

  return (
    <div className="upload-panel">
      <div className="upload-panel-card">
        <div className="upload-panel-header">
          <div>
            <h2>Upload File</h2>
            <p>Upload a CSV or Excel file and map headers to your template placeholders.</p>
          </div>
          <button className="upload-close" type="button" onClick={onClose} aria-label="Close upload dialog">
            ✕
          </button>
        </div>

        <div {...getRootProps()} className={`upload-dropzone ${isDragActive ? 'active' : ''} ${parsing ? 'parsing' : ''}`}>
          <input {...getInputProps()} ref={fileInputRef} />
          <div className="upload-content">
            <div className="upload-icon">📁</div>
            <h3>Drop a file here</h3>
            <p>or browse for a CSV or Excel file.</p>
            <button type="button" className="upload-browse-btn" onClick={handleBrowse}>
              Upload File
            </button>
          </div>
          {parsing && (
            <div className="upload-progress">
              <div className="upload-spinner" />
              <p>Parsing file…</p>
            </div>
          )}
        </div>

        {error && <div className="upload-error">{error}</div>}

        {parsedData && (
          <div className="upload-summary">
            <div className="upload-summary-row">
              <div>
                <p className="upload-summary-label">File</p>
                <strong>{parsedData.fileName}</strong>
              </div>
              <div>
                <p className="upload-summary-label">Type</p>
                <strong>{parsedData.fileType.toUpperCase()}</strong>
              </div>
              <div>
                <p className="upload-summary-label">Rows</p>
                <strong>{parsedData.rows.length}</strong>
              </div>
            </div>
            <div className="upload-summary-row">
              <div>
                <p className="upload-summary-label">Detected headers</p>
                <strong>{parsedData.headers.join(', ')}</strong>
              </div>
              {parsedData.rows.length > 1 && (
                <div>
                  <p className="upload-summary-label">Selected row</p>
                  <select value={selectedRowIndex} onChange={(e) => setSelectedRowIndex(Number(e.target.value))}>
                    {parsedData.rows.map((_, idx) => (
                      <option key={idx} value={idx}>
                        Row {idx + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {parsedData && (
          <div className="mapping-panel">
            <div className="mapping-panel-header">
              <h3>Map placeholders</h3>
              <p>Use the dropdowns below to map template fields to data columns.</p>
            </div>
            {templatePlaceholders.length === 0 ? (
              <div className="mapping-empty">
                No placeholders were detected in the current template.
              </div>
            ) : (
              <div className="mapping-grid">
                {templatePlaceholders.map((placeholder) => (
                  <label key={placeholder} className="mapping-row">
                    <span>{placeholder}</span>
                    <select
                      value={fieldMapping[placeholder] ?? ''}
                      onChange={(e) => setFieldMapping((prev) => ({ ...prev, [placeholder]: e.target.value }))}
                    >
                      <option value="">Select column</option>
                      {headerOptions.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {parsedData && (
          <div className="batch-export-option">
            <label>
              <input
                type="checkbox"
                checked={isBatchExport}
                onChange={(e) => setIsBatchExport(e.target.checked)}
              />
              Export all rows as batch PDF (one page per row)
            </label>
          </div>
        )}

        <div className="upload-actions">
          <button type="button" className="upload-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="upload-confirm"
            onClick={handleConfirm}
            disabled={!parsedData || templatePlaceholders.length > 0 && Object.values(fieldMapping).every((value) => !value)}
          >
            Confirm mapping
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadData;
