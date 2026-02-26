import { useState, useEffect, useRef } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Toolbar from './Toolbar';
import TextElement from './TextElement';
import TableElement from './TableElement';
import ImageElement from './ImageElement';
import LineElement from './LineElement';
import BoxElement from './BoxElement';
import PropertiesPanel from './PropertiesPanel';
import CSVUploadWizard from './CSVUploadWizard';
import TemplateDataView from './TemplateDataView';
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

interface TableElementType {
  id: string;
  type: 'table';
  data: string[][];
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

type CanvasElement = TextElementType | TableElementType | ImageElementType | LineElementType | BoxElementType;

function TemplateCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showDataView, setShowDataView] = useState(false);

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

  const handleAddTable = () => {
    const newElement: TableElementType = {
      id: `table-${Date.now()}`,
      type: 'table',
      data: [
        ['Header 1', 'Header 2', 'Header 3'],
        ['{{item1}}', '{{qty1}}', '{{price1}}'],
        ['{{item2}}', '{{qty2}}', '{{price2}}'],
      ],
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

  const handleUpdateTable = (id: string, data: string[][]) => {
    setElements(
      elements.map((element) =>
        element.id === id && element.type === 'table' ? { ...element, data } : element
      )
    );
  };

  const handleSelectElement = (id: string) => {
    setSelectedElementId(id);
  };

  const handleUpdateElement = (id: string, updates: Partial<CanvasElement>) => {
    setElements(
      elements.map((element) => {
        if (element.id === id) {
          const updatedElement = { ...element };
          if (updates.position) {
            updatedElement.position = { ...updatedElement.position, ...updates.position };
          }
          if (updates.style) {
            updatedElement.style = { ...updatedElement.style, ...updates.style } as any;
          }
          if ('content' in updates && 'content' in updatedElement) {
            (updatedElement as any).content = updates.content;
          }
          if ('src' in updates && 'src' in updatedElement) {
            (updatedElement as any).src = updates.src;
          }
          if ('data' in updates && 'data' in updatedElement) {
            (updatedElement as any).data = updates.data;
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
          setElements(template.elements);
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

  const handleCSVDataLoaded = (data: any[], headers: string[]) => {
    setCsvData(data);
    setCsvHeaders(headers);
    setShowCSVUpload(false);
    setShowDataView(true);
  };

  const replacePlaceholdersWithData = (elements: CanvasElement[], dataRow: any, fieldMapping?: Record<string, string>): CanvasElement[] => {
    // Auto-create field mapping if not provided
    let mapping: Record<string, string> = fieldMapping || {};
    
    if (!fieldMapping) {
      mapping = {};
      const placeholders = new Set<string>();
      
      elements.forEach(element => {
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

      placeholders.forEach(placeholder => {
        if (csvHeaders.includes(placeholder)) {
          mapping[placeholder] = placeholder;
        } else {
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
    }

    return elements.map(element => {
      const filled = { ...element };
      
      if (element.type === 'text' && element.content) {
        let content = element.content;
        Object.keys(mapping).forEach(placeholder => {
          const csvField = mapping[placeholder];
          const value = dataRow[csvField] || '';
          content = content.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
        });
        (filled as TextElementType).content = content;
      }
      
      if (element.type === 'table' && element.data) {
        (filled as TableElementType).data = element.data.map((row: string[]) => 
          row.map((cell: string) => {
            let filledCell = cell;
            Object.keys(mapping).forEach(placeholder => {
              const csvField = mapping[placeholder];
              const value = dataRow[csvField] || '';
              filledCell = filledCell.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
            });
            return filledCell;
          })
        );
      }
      
      if (element.type === 'image' && element.src) {
        let src = element.src;
        Object.keys(mapping).forEach(placeholder => {
          const csvField = mapping[placeholder];
          const value = dataRow[csvField] || '';
          src = src.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
        });
        (filled as ImageElementType).src = src;
      }
      
      return filled;
    });
  };

  const handleGeneratePDFWithData = async (rowIndex: number, fieldMapping: Record<string, string>) => {
    if (rowIndex >= csvData.length) return;
    
    const dataRow = csvData[rowIndex];
    
    console.log('Generating PDF with data:', { rowIndex, dataRow, fieldMapping });
    
    // Use the field mapping from the view
    const filledElements = replacePlaceholdersWithData(elements, dataRow, fieldMapping);
    
    // Debug: Check if replacement worked
    console.log('Original elements sample:', elements[0]);
    console.log('Filled elements sample:', filledElements[0]);
    
    // Temporarily replace elements for PDF generation
    const originalElements = [...elements];
    setElements(filledElements);
    
    // Close the data view to avoid UI interference
    setShowDataView(false);
    
    // Wait longer for React to re-render and DOM to update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Double-check that elements are updated in DOM
    if (canvasRef.current) {
      // Force a reflow to ensure DOM is updated
      const height = canvasRef.current.offsetHeight;
      console.log('Canvas height:', height);
      
      // Check if text content is actually replaced in DOM
      const textElements = canvasRef.current.querySelectorAll('.canvas-text-element');
      if (textElements.length > 0) {
        const firstText = textElements[0] as HTMLElement;
        console.log('First text element content:', firstText.textContent);
      }
      
      // Wait a bit more for any images to load
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Generate PDF
    try {
      await handleExportPDF();
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Check console for details.');
    } finally {
      // Always restore original elements, even if PDF generation fails
      setElements(originalElements);
    }
  };

  const handleExportPDF = async () => {
    if (!canvasRef.current || elements.length === 0) {
      alert('No template to export');
      return;
    }

    try {
      // Show loading indicator
      const originalCursor = document.body.style.cursor;
      document.body.style.cursor = 'wait';

      // Temporarily hide UI elements that shouldn't be in PDF
      const toolbar = document.querySelector('.toolbar');
      const propertiesPanel = document.querySelector('.properties-panel');
      const toolbarHidden = toolbar ? (toolbar as HTMLElement).style.display : null;
      const panelHidden = propertiesPanel ? (propertiesPanel as HTMLElement).style.display : null;
      
      if (toolbar) (toolbar as HTMLElement).style.display = 'none';
      if (propertiesPanel) (propertiesPanel as HTMLElement).style.display = 'none';

      // Wait a bit for UI to update
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the canvas with high quality
      const canvas = await html2canvas(canvasRef.current, {
        scale: 2, // Higher scale for better quality
        useCORS: true, // Allow cross-origin images
        logging: false,
        backgroundColor: '#ffffff',
        width: canvasRef.current.offsetWidth,
        height: canvasRef.current.offsetHeight,
        windowWidth: canvasRef.current.scrollWidth,
        windowHeight: canvasRef.current.scrollHeight,
      });

      // Restore UI elements
      if (toolbar) (toolbar as HTMLElement).style.display = toolbarHidden || '';
      if (propertiesPanel) (propertiesPanel as HTMLElement).style.display = panelHidden || '';
      document.body.style.cursor = originalCursor;

      // A4 dimensions in mm (standard A4: 210mm x 297mm)
      const A4_WIDTH_MM = 210;
      const A4_HEIGHT_MM = 297;
      
      // Calculate scaling to fit A4
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const imgAspectRatio = imgWidth / imgHeight;
      const pdfAspectRatio = A4_WIDTH_MM / A4_HEIGHT_MM;

      let finalWidth: number;
      let finalHeight: number;
      let xOffset = 0;
      let yOffset = 0;

      if (imgAspectRatio > pdfAspectRatio) {
        // Image is wider - fit to width
        finalWidth = A4_WIDTH_MM;
        finalHeight = A4_WIDTH_MM / imgAspectRatio;
        yOffset = (A4_HEIGHT_MM - finalHeight) / 2;
      } else {
        // Image is taller - fit to height
        finalHeight = A4_HEIGHT_MM;
        finalWidth = A4_HEIGHT_MM * imgAspectRatio;
        xOffset = (A4_WIDTH_MM - finalWidth) / 2;
      }

      // Create PDF with A4 size
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      // Convert canvas to image data
      const imgData = canvas.toDataURL('image/png', 1.0);

      // Add image to PDF with calculated dimensions
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight, undefined, 'FAST');

      // Generate filename with timestamp
      const filename = `template-${Date.now()}.pdf`;

      // Save PDF
      pdf.save(filename);

    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('Error exporting PDF. Please try again.');
      // Restore UI in case of error
      const toolbar = document.querySelector('.toolbar');
      const propertiesPanel = document.querySelector('.properties-panel');
      if (toolbar) (toolbar as HTMLElement).style.display = '';
      if (propertiesPanel) (propertiesPanel as HTMLElement).style.display = '';
      document.body.style.cursor = '';
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
          onAddText={handleAddText}
          onAddTable={handleAddTable}
          onAddImage={handleAddImage}
          onAddLine={handleAddLine}
          onAddBox={handleAddBox}
          onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
          onSave={handleSaveTemplate}
          onLoad={handleLoadTemplate}
          onExportPDF={handleExportPDF}
          onUploadCSV={() => setShowCSVUpload(true)}
          hasSelection={!!selectedElementId}
          hasElements={elements.length > 0}
          hasCSVData={csvData.length > 0}
        />
        <div 
          ref={canvasRef}
          className="template-canvas"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedElementId(null);
            }
          }}
        >
          {elements.map((element) => {
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
            } else if (element.type === 'table') {
              return (
                <TableElement
                  key={element.id}
                  id={element.id}
                  data={element.data}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateTable}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                  onResize={(id, fontSize) => handleUpdateElement(id, { style: { ...element.style, fontSize } })}
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
                  style={element.style}
                  onUpdateStyle={(id, styleUpdates) => handleUpdateElement(id, { style: { ...element.style, ...styleUpdates } })}
                  onUpdatePosition={(id, positionUpdates) => handleUpdateElement(id, { position: positionUpdates })}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                />
              );
            }
            return null;
          })}
        </div>
        <PropertiesPanel
          selectedElement={selectedElement}
          onUpdate={handleUpdateElement}
        />
      </div>
      
      {showCSVUpload && (
        <CSVUploadWizard
          onDataLoaded={handleCSVDataLoaded}
          onClose={() => setShowCSVUpload(false)}
        />
      )}
      
      {showDataView && csvData.length > 0 && (
        <TemplateDataView
          templateElements={elements}
          csvData={csvData}
          csvHeaders={csvHeaders}
          onClose={() => setShowDataView(false)}
          onGeneratePDF={handleGeneratePDFWithData}
        />
      )}
    </DndContext>
  );
}

export default TemplateCanvas;

