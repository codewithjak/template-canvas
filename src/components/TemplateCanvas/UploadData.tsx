import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
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
  onDataMapped: (dataRow: DataRow, fieldMapping: Record<string, string>) => void;
}

const UploadData: React.FC<UploadDataProps> = ({ templatePlaceholders, onClose, onDataMapped }) => {
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const normalizeRowTable = useCallback((rows: any[][]) => {
    const cleanedRows = rows
      .filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== ''))
      .map((row) => row.map((cell) => String(cell ?? '').trim()));

    if (cleanedRows.length === 0) {
      return { headers: [] as string[], dataRows: [] as any[][] };
    }

    const firstRow = cleanedRows[0];
    const hasHeaderRow = firstRow.every((value) => {
      const normalized = String(value).trim();
      return normalized.length > 0 && isNaN(Number(normalized));
    });

    const headers = hasHeaderRow
      ? firstRow.map((cell, idx) => (String(cell).trim() || `Column_${idx + 1}`))
      : firstRow.map((_, idx) => `Column_${idx + 1}`);

    const dataRows = hasHeaderRow ? cleanedRows.slice(1) : cleanedRows;
    return { headers, dataRows };
  }, []);

  const parseCSVFile = useCallback((file: File): Promise<ParsedData> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[][];
          const { headers, dataRows } = normalizeRowTable(rows);
          if (headers.length === 0) {
            reject(new Error('CSV file contains no rows.'));
            return;
          }

          const parsedRows = dataRows.map((row) => {
            const obj: DataRow = {};
            headers.forEach((header, index) => {
              obj[header] = row[index] ?? '';
            });
            return obj;
          });

          resolve({ headers, rows: parsedRows, fileType: 'csv', fileName: file.name });
        },
        error: (err) => reject(new Error(`CSV parsing failed: ${err.message}`)),
      });
    });
  }, [normalizeRowTable]);

  const parseExcelFile = useCallback(async (file: File): Promise<ParsedData> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    if (!worksheet) {
      throw new Error('Excel file contains no readable sheets.');
    }

    const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });

    const { headers, dataRows } = normalizeRowTable(rows);
    if (headers.length === 0) {
      throw new Error('Excel file contains no rows.');
    }

    const parsedRows = dataRows.map((row) => {
      const obj: DataRow = {};
      headers.forEach((header, index) => {
        obj[header] = row[index] ?? '';
      });
      return obj;
    });

    return { headers, rows: parsedRows, fileType: 'excel', fileName: file.name };
  }, [normalizeRowTable]);

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

      let data: ParsedData;
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.csv')) {
        data = await parseCSVFile(file);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        data = await parseExcelFile(file);
      } else {
        throw new Error('Unsupported file type. Please upload CSV or Excel files.');
      }

      setParsedData(data);
      setSelectedRowIndex(0);
      initializeFieldMapping(data.headers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to parse file.');
    } finally {
      setParsing(false);
    }
  }, [initializeFieldMapping, parseCSVFile, parseExcelFile]);

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
    const dataRow = parsedData.rows[selectedRowIndex] || parsedData.rows[0];
    onDataMapped(dataRow, fieldMapping);
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
