import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import './CSVUploadWizard.css';

interface CSVUploadWizardProps {
  onDataLoaded: (data: any[], headers: string[]) => void;
  onClose: () => void;
}

function CSVUploadWizard({ onDataLoaded, onClose }: CSVUploadWizardProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setIsLoading(true);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setIsLoading(false);
        if (results.errors.length > 0) {
          setError(`Error parsing CSV: ${results.errors[0].message}`);
          return;
        }

        if (results.data.length === 0) {
          setError('CSV file is empty');
          return;
        }

        const data = results.data as any[];
        const csvHeaders = Object.keys(data[0]);
        
        setHeaders(csvHeaders);
        setPreviewData(data.slice(0, 5)); // Show first 5 rows
      },
      error: (error) => {
        setIsLoading(false);
        setError(`Error reading file: ${error.message}`);
      },
    });
  };

  const handleUseFile = () => {
    if (file && previewData.length > 0) {
      // Re-parse the full file
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const fullData = results.data as any[];
          onDataLoaded(fullData, headers);
        },
      });
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="csv-upload-wizard-overlay">
      <div className="csv-upload-wizard">
        <div className="csv-upload-wizard-header">
          <h2>Upload CSV Data File</h2>
          <button className="csv-upload-wizard-close" onClick={onClose}>×</button>
        </div>

        <div className="csv-upload-wizard-content">
          {!file ? (
            <div className="csv-upload-area">
              <div className="csv-upload-dropzone" onClick={handleBrowseClick}>
                <div className="csv-upload-icon">📁</div>
                <p className="csv-upload-text">Click to browse or drag CSV file here</p>
                <p className="csv-upload-hint">Supports CSV files with headers</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            <>
              <div className="csv-upload-file-info">
                <span className="csv-upload-file-name">📄 {file.name}</span>
                <button 
                  className="csv-upload-change-file"
                  onClick={() => {
                    setFile(null);
                    setPreviewData([]);
                    setHeaders([]);
                    setError(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                >
                  Change File
                </button>
              </div>

              {isLoading && (
                <div className="csv-upload-loading">
                  <div className="csv-upload-spinner"></div>
                  <p>Parsing CSV file...</p>
                </div>
              )}

              {error && (
                <div className="csv-upload-error">
                  ⚠️ {error}
                </div>
              )}

              {previewData.length > 0 && !isLoading && (
                <>
                  <div className="csv-upload-preview">
                    <h3>Data Preview (First 5 rows)</h3>
                    <div className="csv-upload-table-container">
                      <table className="csv-upload-table">
                        <thead>
                          <tr>
                            {headers.map((header, index) => (
                              <th key={index}>{header}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {headers.map((header, colIndex) => (
                                <td key={colIndex}>
                                  {row[header] || ''}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="csv-upload-preview-note">
                      Total rows: {previewData.length === 5 ? '5+' : previewData.length}
                    </p>
                  </div>

                  <div className="csv-upload-actions">
                    <button 
                      className="csv-upload-button csv-upload-button-primary"
                      onClick={handleUseFile}
                    >
                      Use This File
                    </button>
                    <button 
                      className="csv-upload-button csv-upload-button-secondary"
                      onClick={onClose}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default CSVUploadWizard;
