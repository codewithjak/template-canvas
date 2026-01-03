import { useState } from 'react';
import Toolbar from './Toolbar';
import './TemplateCanvas.css';

interface TextElement {
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
  const [elements, setElements] = useState<TextElement[]>([]);

  const handleAddText = () => {
    const newElement: TextElement = {
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

  return (
    <div className="template-canvas-container">
      <Toolbar onAddText={handleAddText} />
      <div className="template-canvas">
        {elements.map((element) => (
          <div
            key={element.id}
            className="canvas-text-element"
            style={{
              position: 'absolute',
              left: `${element.position.x}px`,
              top: `${element.position.y}px`,
              fontSize: `${element.style.fontSize}px`,
              fontWeight: element.style.fontWeight,
              color: element.style.color,
            }}
          >
            {element.content}
          </div>
        ))}
      </div>
    </div>
  );
}

export default TemplateCanvas;

