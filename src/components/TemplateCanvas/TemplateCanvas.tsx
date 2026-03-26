import { useState, useEffect } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import Toolbar from './Toolbar';
import TextElement from './TextElement';
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

function TemplateCanvas() {
  const [elements, setElements] = useState<TextElementType[]>([]);
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

  const handleUpdateText = (id: string, content: string) => {
    setElements(
      elements.map((element) =>
        element.id === id ? { ...element, content } : element
      )
    );
  };

  const handleSelectElement = (id: string) => {
    setSelectedElementId(id);
  };

  const handleUpdateElement = (id: string, updates: Partial<TextElementType>) => {
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
          onDelete={() => selectedElementId && handleDeleteElement(selectedElementId)}
          hasSelection={!!selectedElementId}
        />
        <div 
          className="template-canvas"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedElementId(null);
            }
          }}
        >
          {elements.map((element) => (
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
          ))}
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

