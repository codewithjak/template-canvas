import './Toolbar.css';

interface ToolbarProps {
  onAddText: () => void;
  onDelete?: () => void;
  hasSelection?: boolean;
}

function Toolbar({ onAddText, onDelete, hasSelection }: ToolbarProps) {
  return (
    <div className="toolbar">
      <button className="toolbar-button" onClick={onAddText}>
        Add Text
      </button>
      {hasSelection && onDelete && (
        <button 
          className="toolbar-button toolbar-button-danger" 
          onClick={onDelete}
          title="Delete selected element (Delete key)"
        >
          Delete
        </button>
      )}
    </div>
  );
}

export default Toolbar;

