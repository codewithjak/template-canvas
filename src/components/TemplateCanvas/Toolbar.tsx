import './Toolbar.css';

interface ToolbarProps {
  onAddText: () => void;
}

function Toolbar({ onAddText }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="toolbar-button" onClick={onAddText}>
        Add Text
      </button>
    </div>
  );
}

export default Toolbar;

