import React, { useState, useEffect } from 'react';
import './TemplateDataView.css';

interface TemplateDataViewProps {
  templateElements: any[];
  csvData: any[];
  csvHeaders: string[];
  onClose: () => void;
  onGeneratePDF: (selectedRowIndex: number, fieldMapping: Record<string, string>) => void;
}

function TemplateDataView({ templateElements, csvData, csvHeaders, onClose, onGeneratePDF }: TemplateDataViewProps) {
  const [selectedRowIndex, setSelectedRowIndex] = useState<number>(0);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [previewElements, setPreviewElements] = useState<any[]>([]);

  // Extract placeholders from template
  useEffect(() => {
    const placeholders = new Set<string>();
    
    templateElements.forEach(element => {
      if (element.type === 'text' && element.content) {
        const matches = element.content.match(/\{\{([^}]+)\}\}/g);
        if (matches) {
          matches.forEach(match => {
            const placeholder = match.replace(/[{}]/g, '');
            placeholders.add(placeholder);
          });
        }
      }
      if (element.type === 'table' && element.data) {
        element.data.forEach((row: string[]) => {
          row.forEach((cell: string) => {
            const matches = cell.match(/\{\{([^}]+)\}\}/g);
            if (matches) {
              matches.forEach(match => {
                const placeholder = match.replace(/[{}]/g, '');
                placeholders.add(placeholder);
              });
            }
          });
        });
      }
      if (element.type === 'image' && element.src) {
        const matches = element.src.match(/\{\{([^}]+)\}\}/g);
        if (matches) {
          matches.forEach(match => {
            const placeholder = match.replace(/[{}]/g, '');
            placeholders.add(placeholder);
          });
        }
      }
    });

    // Auto-map placeholders to CSV headers (fuzzy matching)
    const mapping: Record<string, string> = {};
    placeholders.forEach(placeholder => {
      // Try exact match first
      if (csvHeaders.includes(placeholder)) {
        mapping[placeholder] = placeholder;
      } else {
        // Try case-insensitive match
        const lowerPlaceholder = placeholder.toLowerCase();
        const matched = csvHeaders.find(header => 
          header.toLowerCase() === lowerPlaceholder ||
          header.toLowerCase().replace(/[^a-z0-9]/g, '') === lowerPlaceholder.replace(/[^a-z0-9]/g, '')
        );
        if (matched) {
          mapping[placeholder] = matched;
        }
      }
    });
    
    setFieldMapping(mapping);
  }, [templateElements, csvHeaders]);

  // Update preview when row or mapping changes
  useEffect(() => {
    if (csvData.length === 0 || selectedRowIndex >= csvData.length) return;

    const selectedRow = csvData[selectedRowIndex];
    const filledElements = templateElements.map(element => {
      const filled = { ...element };
      
      if (element.type === 'text' && element.content) {
        let content = element.content;
        Object.keys(fieldMapping).forEach(placeholder => {
          const csvField = fieldMapping[placeholder];
          const value = selectedRow[csvField] || '';
          content = content.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
        });
        filled.content = content;
      }
      
      if (element.type === 'table' && element.data) {
        filled.data = element.data.map((row: string[]) => 
          row.map((cell: string) => {
            let filledCell = cell;
            Object.keys(fieldMapping).forEach(placeholder => {
              const csvField = fieldMapping[placeholder];
              const value = selectedRow[csvField] || '';
              filledCell = filledCell.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
            });
            return filledCell;
          })
        );
      }
      
      if (element.type === 'image' && element.src) {
        let src = element.src;
        Object.keys(fieldMapping).forEach(placeholder => {
          const csvField = fieldMapping[placeholder];
          const value = selectedRow[csvField] || '';
          src = src.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
        });
        filled.src = src;
      }
      
      return filled;
    });
    
    setPreviewElements(filledElements);
  }, [templateElements, csvData, selectedRowIndex, fieldMapping]);

  const handleMappingChange = (placeholder: string, csvField: string) => {
    setFieldMapping(prev => ({
      ...prev,
      [placeholder]: csvField
    }));
  };

  const selectedRow = csvData[selectedRowIndex] || {};

  return (
    <div className="template-data-view-overlay">
      <div className="template-data-view">
        <div className="template-data-view-header">
          <h2>Template & Data Preview</h2>
          <button className="template-data-view-close" onClick={onClose}>×</button>
        </div>

        <div className="template-data-view-content">
          <div className="template-data-view-left">
            <div className="template-data-view-section">
              <h3>📊 Data Rows ({csvData.length} total)</h3>
              <div className="template-data-rows">
                {csvData.map((row, index) => (
                  <div
                    key={index}
                    className={`template-data-row ${selectedRowIndex === index ? 'selected' : ''}`}
                    onClick={() => setSelectedRowIndex(index)}
                  >
                    <div className="template-data-row-number">#{index + 1}</div>
                    <div className="template-data-row-preview">
                      {csvHeaders.slice(0, 2).map(header => (
                        <span key={header} className="template-data-row-field">
                          <strong>{header}:</strong> {row[header] || ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="template-data-view-section">
              <h3>🔗 Field Mapping</h3>
              <div className="template-data-mapping">
                {Object.keys(fieldMapping).length === 0 ? (
                  <p className="template-data-no-placeholders">No placeholders found in template</p>
                ) : (
                  <table className="template-data-mapping-table">
                    <thead>
                      <tr>
                        <th>Template Placeholder</th>
                        <th>CSV Field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(fieldMapping).map(placeholder => (
                        <tr key={placeholder}>
                          <td>
                            <code>{'{{' + placeholder + '}}'}</code>
                          </td>
                          <td>
                            <select
                              value={fieldMapping[placeholder] || ''}
                              onChange={(e) => handleMappingChange(placeholder, e.target.value)}
                              className="template-data-mapping-select"
                            >
                              <option value="">-- Select Field --</option>
                              {csvHeaders.map(header => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="template-data-view-section">
              <h3>📋 Selected Row Data</h3>
              <div className="template-data-selected-row">
                {csvHeaders.map(header => (
                  <div key={header} className="template-data-field">
                    <strong>{header}:</strong> {selectedRow[header] || '(empty)'}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="template-data-view-right">
            <div className="template-data-view-section">
              <h3>📄 Template Preview (Row #{selectedRowIndex + 1})</h3>
              <div className="template-data-preview-canvas">
                <div className="template-canvas template-data-preview">
                  {previewElements.map((element) => {
                    // Render preview elements (simplified rendering)
                    if (element.type === 'text') {
                      return (
                        <div
                          key={element.id}
                          className="template-data-preview-element template-data-preview-text"
                          style={{
                            position: 'absolute',
                            left: `${element.position.x}px`,
                            top: `${element.position.y}px`,
                            fontSize: `${element.style.fontSize}px`,
                            fontWeight: element.style.fontWeight,
                            color: element.style.color,
                            fontFamily: element.style.fontFamily,
                          }}
                        >
                          {element.content}
                        </div>
                      );
                    }
                    // Add other element types as needed
                    return null;
                  })}
                </div>
              </div>
            </div>

            <div className="template-data-view-actions">
              <button
                className="template-data-button template-data-button-primary"
                onClick={() => {
                  if (Object.keys(fieldMapping).length === 0) {
                    alert('No field mappings found. Please ensure your template has placeholders like {{variable_name}} and they are mapped to CSV columns.');
                    return;
                  }
                  console.log('Generating PDF with mapping:', fieldMapping);
                  onGeneratePDF(selectedRowIndex, fieldMapping);
                }}
              >
                Generate PDF for Row #{selectedRowIndex + 1}
              </button>
              <button
                className="template-data-button template-data-button-secondary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TemplateDataView;
