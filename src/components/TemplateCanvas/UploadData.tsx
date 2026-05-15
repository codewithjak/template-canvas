import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { autoMapFields } from '../../services/mappingEngine';
import type { DataRow } from '../../services/mappingEngine';
import './UploadData.css';

interface ParsedData {
  headers: string[];
  rows: DataRow[];
  staticHeaders: string[];
  staticData: DataRow;
  tableHeaders: string[];
  tableRows: DataRow[];
  collections: Record<string, DataRow[]>;
  sections?: Array<{
    id: string;
    kind: 'keyValue' | 'table';
    label: string;
    headers: string[];
    rowCount: number;
    rowStart?: number;
    rowEnd?: number;
  }>;
  fileType: 'csv' | 'excel' | 'json';
  fileName: string;
}

export interface UploadedDataBinding {
  rows: DataRow[];
  staticData: DataRow;
  tableRows: DataRow[];
  collections: Record<string, DataRow[]>;
  mapping: Record<string, string>;
  tableMapping: Record<string, string>;
}

interface UploadDataProps {
  staticPlaceholders: string[];
  tablePlaceholders: string[];
  onClose: () => void;
  onDataMapped: (binding: UploadedDataBinding) => void;
}

const UploadData: React.FC<UploadDataProps> = ({
  staticPlaceholders,
  tablePlaceholders,
  onClose,
  onDataMapped,
}) => {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [tableFieldMapping, setTableFieldMapping] = useState<Record<string, string>>({});
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
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
      headers: data.headers || [],
      rows: data.rows || [],
      staticHeaders: data.staticHeaders || [],
      staticData: data.staticData || {},
      tableHeaders: data.tableHeaders || [],
      tableRows: data.tableRows || [],
      collections: data.collections || {},
      sections: data.sections || [],
      fileType: data.fileType === 'json' ? 'json' : data.fileType === 'csv' ? 'csv' : 'excel',
      fileName: data.fileName || file.name,
    };
  }, []);

  const initializeFieldMapping = useCallback((data: ParsedData) => {
    const staticHeaders = data.staticHeaders.length > 0 ? data.staticHeaders : data.headers;
    const tableHeaders = data.tableHeaders.length > 0 ? data.tableHeaders : data.headers;

    const staticAutoMapping = autoMapFields(staticPlaceholders, staticHeaders);
    const staticResult: Record<string, string> = {};

    staticPlaceholders.forEach((placeholder) => {
      staticResult[placeholder] =
        staticAutoMapping[placeholder] ||
        staticHeaders.find((header) => header.toLowerCase() === placeholder.toLowerCase()) ||
        '';
    });

    const tableAutoMapping = autoMapFields(tablePlaceholders, tableHeaders);
    const tableResult: Record<string, string> = {};

    tablePlaceholders.forEach((placeholder) => {
      tableResult[placeholder] =
        tableAutoMapping[placeholder] ||
        tableHeaders.find((header) => header.toLowerCase() === placeholder.toLowerCase()) ||
        '';
    });

    setFieldMapping(staticResult);
    setTableFieldMapping(tableResult);
  }, [staticPlaceholders, tablePlaceholders]);

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
      initializeFieldMapping(data);
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
      'application/json': ['.json'],
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
    const rows = parsedData.rows.length > 0
      ? parsedData.rows
      : Object.keys(parsedData.staticData).length > 0
        ? [{ ...parsedData.staticData, ...parsedData.collections }]
        : [];

    onDataMapped({
      rows,
      staticData: parsedData.staticData,
      tableRows: parsedData.tableRows,
      collections: parsedData.collections,
      mapping: fieldMapping,
      tableMapping: tableFieldMapping,
    });
  };

  const staticHeaderOptions = parsedData?.staticHeaders?.length
    ? parsedData.staticHeaders
    : parsedData?.headers || [];
  const tableHeaderOptions = parsedData?.tableHeaders?.length
    ? parsedData.tableHeaders
    : parsedData?.headers || [];
  const totalPlaceholders = staticPlaceholders.length + tablePlaceholders.length;

  return (
    <div className="upload-panel">
      <div className="upload-panel-card">
        <div className="upload-panel-header">
          <div>
            <h2>Upload File</h2>
            <p>Upload a CSV, Excel, or JSON file and map fields to your template placeholders.</p>
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
            <p>or browse for a CSV, Excel, or JSON file.</p>
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
                <p className="upload-summary-label">Records</p>
                <strong>{parsedData.rows.length || (Object.keys(parsedData.staticData).length > 0 ? 1 : 0)}</strong>
              </div>
              <div>
                <p className="upload-summary-label">Table rows</p>
                <strong>{parsedData.tableRows.length}</strong>
              </div>
            </div>
            <div className="upload-summary-row">
              {parsedData.staticHeaders.length > 0 && (
                <div>
                  <p className="upload-summary-label">Static fields</p>
                  <strong>{parsedData.staticHeaders.join(', ')}</strong>
                </div>
              )}
              {parsedData.tableHeaders.length > 0 && (
                <div>
                  <p className="upload-summary-label">Table columns</p>
                  <strong>{parsedData.tableHeaders.join(', ')}</strong>
                </div>
              )}
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
              <p>Document fields and repeating table columns are mapped separately.</p>
            </div>
            {totalPlaceholders === 0 ? (
              <div className="mapping-empty">
                No placeholders were detected in the current template.
              </div>
            ) : (
              <>
                {staticPlaceholders.length > 0 && (
                  <div className="mapping-section">
                    <div className="mapping-section-title">Document fields</div>
                    <div className="mapping-grid">
                      {staticPlaceholders.map((placeholder) => (
                        <label key={placeholder} className="mapping-row">
                          <span>{placeholder}</span>
                          <select
                            value={fieldMapping[placeholder] ?? ''}
                            onChange={(e) => setFieldMapping((prev) => ({ ...prev, [placeholder]: e.target.value }))}
                          >
                            <option value="">Use placeholder name</option>
                            {staticHeaderOptions.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {tablePlaceholders.length > 0 && (
                  <div className="mapping-section">
                    <div className="mapping-section-title">Table columns</div>
                    <div className="mapping-grid">
                      {tablePlaceholders.map((placeholder) => (
                        <label key={placeholder} className="mapping-row">
                          <span>{placeholder}</span>
                          <select
                            value={tableFieldMapping[placeholder] ?? ''}
                            onChange={(e) => setTableFieldMapping((prev) => ({ ...prev, [placeholder]: e.target.value }))}
                          >
                            <option value="">Use placeholder name</option>
                            {tableHeaderOptions.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
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
            disabled={!parsedData}
          >
            Confirm mapping
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadData;
