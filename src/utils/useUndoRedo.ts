import { useState } from 'react';

export const useUndoRedo = (initialState: any) => {
  const [state, setState] = useState(initialState);
  const [redoStack, setRedoStack] = useState<any[]>([]);

  const createSnapshot = () => {
    return JSON.parse(JSON.stringify(state));
  };

  const canUndo = redoStack.length > 0;

  const undo = () => {
    if (canUndo) {
      setRedoStack(prev => [...prev, state]);
      setState(redoStack.pop());
    }
  };

  const redo = () => {
    if (redoStack.length > 0) {
      setRedoStack(prev => prev.filter((_, i) => i !== 0));
      setState(redoStack.pop());
    }
  };

  const executeAction = (newState: any) => {
    setRedoStack([]);
    setState(createSnapshot());
    setState(newState);
  };

  return {
    state,
    canUndo,
    undo,
    redo,
    executeAction
  };
};
