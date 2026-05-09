import { useState, useEffect, useRef, useMemo } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import Toolbar from './Toolbar';
import UploadData from './UploadData';
import TextElement from './TextElement';
import ImageElement from './ImageElement';
import LineElement from './LineElement';
import BoxElement from './BoxElement';
import ParagraphElement from './ParagraphElement';
import RadioElement from './RadioElement';
import CheckboxElement from './CheckboxElement';
import DateElement from './DateElement';
import PropertiesPanel from './PropertiesPanel';
import type { DataRow } from '../../services/mappingEngine';
import { getAllPlaceholders, mapTemplateToData } from '../../services/mappingEngine';
import './TemplateCanvas.css';

interface TextElementType {
  id: string;
  type: 'text';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
}

interface ImageElementType {
  id: string;
  type: 'image';
  src: string;
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    opacity?: number;
  };
}

interface LineElementType {
  id: string;
  type: 'line';
  position: { x: number; y: number };
  style: {
    length: number;
    thickness: number;
    direction: 'horizontal' | 'vertical';
    color: string;
    style: 'solid' | 'dashed' | 'dotted';
    opacity?: number;
  };
}

interface BoxElementType {
  id: string;
  type: 'box';
  shape?: 'box' | 'rectangle' | 'triangle' | 'ellipse';
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    borderWidth: number;
    borderColor: string;
    borderStyle: 'solid' | 'dashed' | 'dotted' | 'double';
    backgroundColor: string;
    opacity?: number;
    borderRadius?: number;
  };
}

interface ParagraphElementType {
  id: string;
  type: 'paragraph';
  content: string;
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
    lineHeight?: number;
  };
}

interface RadioElementType {
  id: string;
  type: 'radio';
  options: number;
  selected?: string;
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

interface CheckboxElementType {
  id: string;
  type: 'checkbox';
  count?: number;
  checkedValues?: string[];
  orientation?: 'horizontal' | 'vertical';
  position: { x: number; y: number; relativeOffset?: number };
}

interface DateElementType {
  id: string;
  type: 'date';
  value?: string;
  time?: string;
  includeTime?: boolean;
  format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM DD, YYYY' | 'DD Mon YYYY';
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
    fontFamily: string;
  };
}

type CanvasElement = TextElementType | ImageElementType | LineElementType | BoxElementType | ParagraphElementType | RadioElementType | CheckboxElementType | DateElementType;

function TemplateCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [batchData, setBatchData] = useState<{ rows: DataRow[]; mapping: Record<string, string> } | null>(null);
  const [previewRowIndex, setPreviewRowIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const templatePlaceholders = useMemo(() => getAllPlaceholders(elements), [elements]);
  const renderedElements = useMemo(
    () => (batchData ? mapTemplateToData(elements, batchData.rows[previewRowIndex], batchData.mapping) : elements),
    [batchData, elements, previewRowIndex]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleAddText = () => {
    const newElement: TextElementType = {
      id: `text-${Date.now()}`,
      type: 'text',
      content: 'New Text',
      position: { x: 50, y: 50 },
      style: {
        fontSize: 16,
        fontWeight: 'normal',
        color: '#000000',
        fontFamily: 'Arial, sans-serif',
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddImage = () => {
    const newElement: ImageElementType = {
      id: `image-${Date.now()}`,
      type: 'image',
      src: '{{image_url}}', // Default placeholder
      position: { x: 50, y: 50 },
      style: {
        width: 200,
        height: 200,
        objectFit: 'contain',
        opacity: 100,
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddLine = () => {
    const newElement: LineElementType = {
      id: `line-${Date.now()}`,
      type: 'line',
      position: { x: 50, y: 50 },
      style: {
        length: 200,
        thickness: 2,
        direction: 'horizontal',
        color: '#000000',
        style: 'solid',
        opacity: 100,
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddBox = () => {
    const newElement: BoxElementType = {
      id: `box-${Date.now()}`,
      type: 'box',
      shape: 'box',
      position: { x: 50, y: 50 },
      style: {
        width: 200,
        height: 200,
        borderWidth: 1,
        borderColor: '#000000',
        borderStyle: 'solid',
        backgroundColor: 'transparent',
        opacity: 100,
        borderRadius: 0,
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddRectangle = () => {
    const newElement: BoxElementType = {
      id: `rectangle-${Date.now()}`,
      type: 'box',
      shape: 'rectangle',
      position: { x: 50, y: 50 },
      style: {
        width: 220,
        height: 140,
        borderWidth: 1,
        borderColor: '#007bff',
        borderStyle: 'solid',
        backgroundColor: '#e7f1ff',
        opacity: 100,
        borderRadius: 0,
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddTriangle = () => {
    const newElement: BoxElementType = {
      id: `triangle-${Date.now()}`,
      type: 'box',
      shape: 'triangle',
      position: { x: 50, y: 50 },
      style: {
        width: 140,
        height: 120,
        borderWidth: 0,
        borderColor: '#000000',
        borderStyle: 'solid',
        backgroundColor: '#ffb200',
        opacity: 100,
        borderRadius: 0,
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddEllipse = () => {
    const newElement: BoxElementType = {
      id: `ellipse-${Date.now()}`,
      type: 'box',
      shape: 'ellipse',
      position: { x: 50, y: 50 },
      style: {
        width: 200,
        height: 120,
        borderWidth: 1,
        borderColor: '#2a9d8f',
        borderStyle: 'solid',
        backgroundColor: '#d8f3ef',
        opacity: 100,
        borderRadius: 9999,
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddParagraph = () => {
    const newElement: ParagraphElementType = {
      id: `paragraph-${Date.now()}`,
      type: 'paragraph',
      content: 'Add your text here...',
      position: { x: 50, y: 50 },
      style: {
        fontSize: 16,
        fontWeight: 'normal',
        color: '#000000',
        fontFamily: 'Arial, sans-serif',
        lineHeight: 24,
      },
    };
    setElements([...elements, newElement]);
  };

  const handleAddRadio = () => {
    const newElement: RadioElementType = {
      id: `radio-${Date.now()}`,
      type: 'radio',
      options: 2,
      selected: '',
      orientation: 'vertical',
      position: { x: 50, y: 50, relativeOffset: 8 },
    };
    setElements([...elements, newElement]);
  };

  const handleAddCheckbox = () => {
    const newElement: CheckboxElementType = {
      id: `checkbox-${Date.now()}`,
      type: 'checkbox',
      count: 1,
      checkedValues: [],
      orientation: 'vertical',
      position: { x: 50, y: 50, relativeOffset: 8 },
    };
    setElements([...elements, newElement]);
  };

  const handleAddDate = () => {
    const newElement: DateElementType = {
      id: `date-${Date.now()}`,
      type: 'date',
      value: '',
      time: '',
      includeTime: false,
      format: 'MM/DD/YYYY',
      position: { x: 50, y: 50 },
      style: {
        fontSize: 14,
        fontWeight: 'normal',
        color: '#000000',
        fontFamily: 'Arial, sans-serif',
      },
    };
    setElements([...elements, newElement]);
  };

  const handleUpdateImage = (id: string, src: string) => {
    setElements(
      elements.map((element) =>
        element.id === id && element.type === 'image' ? { ...element, src } : element
      )
    );
  };

  const handleUpdateText = (id: string, content: string) => {
    setElements(
      elements.map((element) =>
        element.id === id && element.type === 'text' ? { ...element, content } : element
      )
    );
  };

  const handleUpdateParagraph = (id: string, content: string) => {
    setElements(
      elements.map((element) =>
        element.id === id && element.type === 'paragraph' ? { ...element, content } : element
      )
    );
  };

  const handleUpdateRadio = (id: string, updates: { selected?: string; orientation?: 'horizontal' | 'vertical' }) => {
    setElements(
      elements.map((element) =>
        element.id === id && element.type === 'radio' ? { ...element, ...updates } : element
      )
    );
  };

  const handleUpdateCheckbox = (id: string, updates: { checkedValues?: string[]; orientation?: 'horizontal' | 'vertical' }) => {
    setElements(
      elements.map((element) =>
        element.id === id && element.type === 'checkbox' ? { ...element, ...updates } : element
      )
    );
  };

  const handleSelectElement = (id: string) => {
    setSelectedElementId(id);
  };

  const handleUpdateElement = (id: string, updates: any) => {
    setElements(
      elements.map((element) => {
        if (element.id === id) {
          const updatedElement = { ...element };
          if (updates.position) {
            updatedElement.position = { ...updatedElement.position, ...updates.position };
          }
          if (updates.style && 'style' in updatedElement) {
            (updatedElement as any).style = { ...(updatedElement as any).style, ...updates.style };
          }
          if ('content' in updates && 'content' in updatedElement) {
            (updatedElement as any).content = updates.content;
          }
          if ('src' in updates && 'src' in updatedElement) {
            (updatedElement as any).src = updates.src;
          }
          if ('orientation' in updates) {
            (updatedElement as any).orientation = updates.orientation;
          }
          if ('count' in updates) {
            (updatedElement as any).count = updates.count;
          }
          if ('options' in updates) {
            (updatedElement as any).options = updates.options;
          }
          if ('shape' in updates) {
            (updatedElement as any).shape = updates.shape;
          }
          if ('value' in updates && 'value' in updatedElement) {
            (updatedElement as any).value = updates.value;
          }
          if ('time' in updates && 'time' in updatedElement) {
            (updatedElement as any).time = updates.time;
          }
          if ('includeTime' in updates && 'includeTime' in updatedElement) {
            (updatedElement as any).includeTime = updates.includeTime;
          }
          if ('format' in updates && 'format' in updatedElement) {
            (updatedElement as any).format = updates.format;
          }
          return updatedElement;
        }
        return element;
      })
    );
  };

  const selectedElement = elements.find((el) => el.id === selectedElementId) || null;

  const handleDeleteElement = (id: string) => {
    setElements((prevElements) => prevElements.filter((element) => element.id !== id));
    setSelectedElementId((prevId) => (prevId === id ? null : prevId));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          handleDeleteElement(selectedElementId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId]);

  const handleSaveTemplate = () => {
    const template = {
      version: '1.0',
      elements: elements,
    };
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `template-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const template = JSON.parse(text);
        
        if (template.elements && Array.isArray(template.elements)) {
          const loaded = template.elements.filter((el: { type?: string }) => el?.type !== 'table');
          setElements(loaded);
          setSelectedElementId(null);
        } else {
          alert('Invalid template file format');
        }
      } catch (error) {
        console.error('Error loading template:', error);
        alert('Error loading template file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    
    event.target.value = '';
  };

  const handleOpenUpload = () => setUploadPanelOpen(true);
  const handleCloseUpload = () => setUploadPanelOpen(false);

  const handleUploadMapped = (dataRows: DataRow[], fieldMapping: Record<string, string>, isBatch: boolean) => {
    if (isBatch) {
      setBatchData({ rows: dataRows, mapping: fieldMapping });
      setPreviewRowIndex(0);
    } else {
      setBatchData(null);
      setElements((current) => mapTemplateToData(current, dataRows[0], fieldMapping));
    }
    setUploadPanelOpen(false);
  };

  const handleClearBatchData = () => {
    setBatchData(null);
    setPreviewRowIndex(0);
    setExportProgress(null);
    setExportStatus(null);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const generatePdfForRow = async (row: DataRow, index: number, total: number) => {
    const outputFileName = `record-${index + 1}.pdf`;
    setExportStatus(`Printing record ${index + 1} of ${total}`);

    const response = await fetch('http://localhost:3001/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        templateElements: elements,
        dataRow: row,
        fieldMapping: batchData?.mapping || {},
        outputFileName,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      throw new Error(errorBody?.error || 'Failed to generate PDF');
    }

    const blob = await response.blob();
    downloadBlob(blob, outputFileName);
  };

  const handleExportCurrentRow = async () => {
    if (!canvasRef.current || elements.length === 0) {
      alert('No template to export');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress({ current: 1, total: 1 });
      setExportStatus('Printing current record...');

      const row = batchData ? batchData.rows[previewRowIndex] : null;
      const dataRow = row || {};
      const response = await fetch('http://localhost:3001/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateElements: elements,
          dataRow,
          fieldMapping: batchData?.mapping || {},
          outputFileName: `document-${Date.now()}.pdf`,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || 'Failed to generate PDF');
      }

      const blob = await response.blob();
      downloadBlob(blob, batchData ? `record-${previewRowIndex + 1}.pdf` : `template-${Date.now()}.pdf`);
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert(error instanceof Error ? error.message : 'Error exporting PDF.');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      setExportStatus(null);
    }
  };

  const handleExportAllRows = async () => {
    if (!batchData) {
      alert('No batch records to export');
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress({ current: 0, total: batchData.rows.length });
      setExportStatus('Starting batch export...');

      for (let index = 0; index < batchData.rows.length; index += 1) {
        setExportProgress({ current: index + 1, total: batchData.rows.length });
        await generatePdfForRow(batchData.rows[index], index, batchData.rows.length);
      }

      setExportStatus('Batch export complete. All PDFs downloaded.');
    } catch (error) {
      console.error('Error exporting batch PDFs:', error);
      alert(error instanceof Error ? error.message : 'Batch export failed.');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
      setTimeout(() => setExportStatus(null), 3000);
    }
  };

  const handleDragEnd = (event: any) => {
    const { active, delta } = event;

    if (!delta) return;

    setElements(
      elements.map((element) => {
        if (element.id === active.id) {
          return {
            ...element,
            position: {
              x: element.position.x + delta.x,
              y: element.position.y + delta.y,
            },
          };
        }
        return element;
      })
    );
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="template-canvas-container">
        <Toolbar
          onAddParagraph={handleAddParagraph}
          onAddRadio={handleAddRadio}
          onAddCheckbox={handleAddCheckbox}
          onAddDate={handleAddDate}
          onAddText={handleAddText}
          onAddImage={handleAddImage}
          onAddLine={handleAddLine}
          onAddBox={handleAddBox}
          onAddRectangle={handleAddRectangle}
          onAddTriangle={handleAddTriangle}
          onAddEllipse={handleAddEllipse}
          onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
          onSave={handleSaveTemplate}
          onLoad={handleLoadTemplate}
          onUpload={handleOpenUpload}
          onExportPDF={handleExportCurrentRow}
          hasSelection={!!selectedElementId}
          hasElements={elements.length > 0}
        />
        {uploadPanelOpen && (
          <div className="upload-panel-backdrop">
            <UploadData
              templatePlaceholders={templatePlaceholders}
              onClose={handleCloseUpload}
              onDataMapped={handleUploadMapped}
            />
          </div>
        )}
        {batchData && (
          <div className="batch-export-controls">
            <div className="batch-export-summary">
              Previewing record {previewRowIndex + 1} of {batchData.rows.length}
            </div>
            <div className="batch-export-actions">
              <label>
                Select preview row:
                <select value={previewRowIndex} onChange={(e) => setPreviewRowIndex(Number(e.target.value))}>
                  {batchData.rows.map((_, idx) => (
                    <option key={idx} value={idx}>
                      Row {idx + 1}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="export-button" onClick={handleExportAllRows} disabled={isExporting}>
                Export all rows
              </button>
              <button type="button" className="clear-button" onClick={handleClearBatchData}>
                Back to Canvas
              </button>
            </div>
          </div>
        )}
        {isExporting && (
          <div className="export-overlay">
            <div className="export-overlay-card">
              <p>{exportStatus || 'Exporting PDFs...'}</p>
              {exportProgress && (
                <p>
                  {exportProgress.current} / {exportProgress.total}
                </p>
              )}
            </div>
          </div>
        )}
        <div 
          ref={canvasRef}
          className="template-canvas"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedElementId(null);
            }
          }}
        >
          {renderedElements.map((element) => {
            if (element.type === 'text') {
              return (
                <TextElement
                  key={element.id}
                  id={element.id}
                  content={element.content}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateText}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                  onResize={(id, fontSize) => handleUpdateElement(id, { style: { ...element.style, fontSize } })}
                />
              );
            } else if (element.type === 'paragraph') {
              return (
                <ParagraphElement
                  key={element.id}
                  id={element.id}
                  content={element.content}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateParagraph}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'radio') {
              return (
                <RadioElement
                  key={element.id}
                  id={element.id}
                  options={element.options}
                  selected={element.selected}
                  orientation={element.orientation}
                  position={element.position}
                  onSelect={(id, option) => handleUpdateRadio(id, { selected: option })}
                  onUpdate={handleUpdateRadio}
                  onElementSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'checkbox') {
              return (
                <CheckboxElement
                  key={element.id}
                  id={element.id}
                  count={element.count}
                  checkedValues={element.checkedValues}
                  orientation={element.orientation}
                  position={element.position}
                  onUpdate={handleUpdateCheckbox}
                  onElementSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'image') {
              return (
                <ImageElement
                  key={element.id}
                  id={element.id}
                  src={element.src}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateImage}
                  onUpdateStyle={(id, styleUpdates) => handleUpdateElement(id, { style: { ...element.style, ...styleUpdates } })}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'line') {
              return (
                <LineElement
                  key={element.id}
                  id={element.id}
                  position={element.position}
                  style={element.style}
                  onUpdateStyle={(id, styleUpdates) => handleUpdateElement(id, { style: { ...element.style, ...styleUpdates } })}
                  onUpdatePosition={(id, positionUpdates) => handleUpdateElement(id, { position: positionUpdates })}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'box') {
              return (
                <BoxElement
                  key={element.id}
                  id={element.id}
                  position={element.position}
                  shape={element.shape}
                  style={element.style}
                  onUpdateStyle={(id, styleUpdates) => handleUpdateElement(id, { style: { ...element.style, ...styleUpdates } })}
                  onUpdatePosition={(id, positionUpdates) => handleUpdateElement(id, { position: positionUpdates })}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            } else if (element.type === 'date') {
              return (
                <DateElement
                  key={element.id}
                  id={element.id}
                  value={element.value}
                  time={element.time}
                  includeTime={element.includeTime}
                  format={element.format}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateElement}
                  onElementSelect={() => handleSelectElement(element.id)}
                />
              );
            }
            return null;
          })}
        </div>
        <PropertiesPanel selectedElement={selectedElement} onUpdate={handleUpdateElement} />
      </div>
    </DndContext>
  );
}

export default TemplateCanvas;

