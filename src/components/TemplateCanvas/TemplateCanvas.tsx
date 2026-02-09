import { useState, useEffect } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import Toolbar from './Toolbar';
import TextElement from './TextElement';
import TableElement from './TableElement';
import PropertiesPanel from './PropertiesPanel';
import type { CanvasElement, TextElementType, TableElementType } from './types';
import { downloadTemplate, loadTemplate } from './utils';
import './TemplateCanvas.css';

export interface TemplateCanvasProps {
  elements?: CanvasElement[];
  onElementsChange?: (elements: CanvasElement[]) => void;
  initialElements?: CanvasElement[];
  showToolbar?: boolean;
  showPropertiesPanel?: boolean;
}

function TemplateCanvas({
  elements: controlledElements,
  onElementsChange,
  initialElements = [],
  showToolbar = true,
  showPropertiesPanel = true,
}: TemplateCanvasProps = {}) {
  const [internalElements, setInternalElements] = useState<CanvasElement[]>(initialElements);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const isControlled = controlledElements !== undefined;
  const elements = isControlled ? controlledElements : internalElements;

  const setElements = (newElements: CanvasElement[] | ((prev: CanvasElement[]) => CanvasElement[])) => {
    const updatedElements = typeof newElements === 'function' ? newElements(elements) : newElements;
    if (isControlled) {
      onElementsChange?.(updatedElements);
    } else {
      setInternalElements(updatedElements);
    }
  };

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
          if (element.type === 'text') {
            return {
              ...element,
              ...(updates.type === 'text' ? updates : {}),
              ...(updates.style && {
                style: { ...element.style, ...updates.style },
              }),
              ...(updates.position && {
                position: { ...element.position, ...updates.position },
              }),
            } as TextElementType;
          } else if (element.type === 'table') {
            return {
              ...element,
              ...(updates.type === 'table' ? updates : {}),
              ...(updates.style && {
                style: { ...element.style, ...updates.style },
              }),
              ...(updates.position && {
                position: { ...element.position, ...updates.position },
              }),
            } as TableElementType;
          }
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
    downloadTemplate(elements);
  };

  const handleLoadTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const loadedElements = loadTemplate(text);
        setElements(loadedElements);
        setSelectedElementId(null);
      } catch (error) {
        console.error('Error loading template:', error);
        alert(error instanceof Error ? error.message : 'Error loading template file. Please check the file format.');
      }
    };
    reader.readAsText(file);
    
    event.target.value = '';
  };

  const handleDragEnd = (event: { active: { id: string | number }; delta: { x: number; y: number } | null }) => {
    const { active, delta } = event;

    if (!delta || typeof active.id !== 'string') return;

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
        {showToolbar && (
          <Toolbar 
            onAddText={handleAddText}
            onAddTable={handleAddTable}
            onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
            onSave={handleSaveTemplate}
            onLoad={handleLoadTemplate}
            hasSelection={!!selectedElementId}
            hasElements={elements.length > 0}
          />
        )}
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
            }
            return null;
          })}
        </div>
        {showPropertiesPanel && (
          <PropertiesPanel
            selectedElement={selectedElement}
            onUpdate={handleUpdateElement}
          />
        )}
      </div>
    </DndContext>
  );
}

export default TemplateCanvas;

