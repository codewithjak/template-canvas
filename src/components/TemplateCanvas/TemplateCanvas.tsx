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
import ParagraphElement from './ParagraphElement';
import RadioElement from './RadioElement';
import CheckboxElement from './CheckboxElement';
import PropertiesPanel from './PropertiesPanel';
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
  merges?: Array<{ r0: number; c0: number; r1: number; c1: number }>;
  cellStyles?: Record<
    string,
    {
      fontSize?: number;
      fontWeight?: string;
      fontStyle?: string;
      textDecoration?: string;
      textAlign?: 'left' | 'center' | 'right';
      color?: string;
      fontFamily?: string;
      backgroundColor?: string;
    }
  >;
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

type CanvasElement = TextElementType | TableElementType | ImageElementType | LineElementType | BoxElementType | ParagraphElementType | RadioElementType | CheckboxElementType;

function TemplateCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [tableSelections, setTableSelections] = useState<
    Record<string, { r0: number; c0: number; r1: number; c1: number } | null>
  >({});
  const [tableSelectionModes, setTableSelectionModes] = useState<Record<string, 'cell' | 'row' | 'column'>>({});
  const canvasRef = useRef<HTMLDivElement>(null);

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
      merges: [],
      cellStyles: {},
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
          if ('data' in updates && 'data' in updatedElement) {
            (updatedElement as any).data = updates.data;
          }
          if ('merges' in updates && (updatedElement as any).type === 'table') {
            (updatedElement as any).merges = (updates as any).merges || [];
          }
          if ('cellStyles' in updates && (updatedElement as any).type === 'table') {
            (updatedElement as any).cellStyles = (updates as any).cellStyles || {};
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

  const handleExportPDF = async () => {
    if (!canvasRef.current || elements.length === 0) {
      alert('No template to export');
      return;
    }

    const originalCursor = document.body.style.cursor;
    const toolbar = document.querySelector('.toolbar');
    const propertiesPanel = document.querySelector('.properties-panel');
    const toolbarDisplay = toolbar ? (toolbar as HTMLElement).style.display : '';
    const panelDisplay = propertiesPanel ? (propertiesPanel as HTMLElement).style.display : '';

    try {
      // Show loading indicator
      document.body.style.cursor = 'wait';

      // Temporarily hide UI elements that shouldn't be in PDF
      if (toolbar) (toolbar as HTMLElement).style.display = 'none';
      if (propertiesPanel) (propertiesPanel as HTMLElement).style.display = 'none';
      canvasRef.current.classList.add('export-mode');

      // Clear selection/focus artifacts (blue focus ring/caret) before capture.
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') {
        active.blur();
      }

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
    } finally {
      // Always restore UI state after export attempt.
      if (canvasRef.current) {
        canvasRef.current.classList.remove('export-mode');
      }
      if (toolbar) (toolbar as HTMLElement).style.display = toolbarDisplay;
      if (propertiesPanel) (propertiesPanel as HTMLElement).style.display = panelDisplay;
      document.body.style.cursor = originalCursor;
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
          onAddText={handleAddText}
          onAddTable={handleAddTable}
          onAddImage={handleAddImage}
          onAddLine={handleAddLine}
          onAddBox={handleAddBox}          onAddRectangle={handleAddRectangle}
          onAddTriangle={handleAddTriangle}
          onAddEllipse={handleAddEllipse}          onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
          onSave={handleSaveTemplate}
          onLoad={handleLoadTemplate}
          onExportPDF={handleExportPDF}
          hasSelection={!!selectedElementId}
          hasElements={elements.length > 0}
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
            } else if (element.type === 'table') {
              return (
                <TableElement
                  key={element.id}
                  id={element.id}
                  data={element.data}
                  merges={element.merges || []}
                  cellStyles={element.cellStyles || {}}
                  position={element.position}
                  style={element.style}
                  onUpdate={handleUpdateTable}
                  isSelected={element.id === selectedElementId}
                  onSelect={() => handleSelectElement(element.id)}
                  onResize={(id, fontSize) => handleUpdateElement(id, { style: { ...element.style, fontSize } })}
                  selection={tableSelections[element.id] || null}
                  selectionMode={tableSelectionModes[element.id] || 'cell'}
                  onSelectionChange={(id, selection) =>
                    setTableSelections((prev) => ({ ...prev, [id]: selection }))
                  }
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
            }
            return null;
          })}
        </div>
        <PropertiesPanel
          selectedElement={selectedElement}
          onUpdate={handleUpdateElement}
          tableSelection={
            selectedElement && selectedElement.type === 'table'
              ? (tableSelections[selectedElement.id] || null)
              : null
          }
          tableSelectionMode={
            selectedElement && selectedElement.type === 'table'
              ? (tableSelectionModes[selectedElement.id] || 'cell')
              : 'cell'
          }
          onTableSelectionModeChange={(mode) => {
            if (selectedElement && selectedElement.type === 'table') {
              setTableSelectionModes((prev) => ({ ...prev, [selectedElement.id]: mode }));
            }
          }}
        />
      </div>
    </DndContext>
  );
}

export default TemplateCanvas;

