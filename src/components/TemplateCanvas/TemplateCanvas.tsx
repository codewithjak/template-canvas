import { useState, useEffect } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import Toolbar from './Toolbar';
import TextElement from './TextElement';
import TableElement from './TableElement';
import ImageElement from './ImageElement';
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

type CanvasElement = TextElementType | TableElementType | ImageElementType;

function TemplateCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

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
          return {
            ...element,
            ...updates,
            ...(updates.style && {
              style: { ...element.style, ...updates.style },
            }),
            ...(updates.position && {
              position: { ...element.position, ...updates.position },
            }),
          };
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

  const handleDragEnd = (event: { active: { id: string }; delta: { x: number; y: number } | null }) => {
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
          onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
          onSave={handleSaveTemplate}
          onLoad={handleLoadTemplate}
          hasSelection={!!selectedElementId}
          hasElements={elements.length > 0}
        />
        <div 
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
            }
            return null;
          })}
        </div>
        <PropertiesPanel
          selectedElement={selectedElement}
          onUpdate={handleUpdateElement}
        />
      </div>
    </DndContext>
  );
}

export default TemplateCanvas;

