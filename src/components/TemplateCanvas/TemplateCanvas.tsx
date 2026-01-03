import { useState } from 'react';
import Toolbar from './Toolbar';
import TextElement from './TextElement';
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

  return (
    <div className="template-canvas-container">
      <Toolbar onAddText={handleAddText} />
      <div className="template-canvas">
        {elements.map((element) => (
          <TextElement
            key={element.id}
            id={element.id}
            content={element.content}
            position={element.position}
            style={element.style}
            onUpdate={handleUpdateText}
          />
        ))}
      </div>
    </div>
  );
}

export default TemplateCanvas;

