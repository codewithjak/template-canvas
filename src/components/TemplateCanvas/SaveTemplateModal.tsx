/**
 * SaveTemplateModal.tsx
 * Minimal modal that asks for a template name before saving.
 * Only shown on first save — subsequent saves reuse the existing name.
 */

import React, { useState, useEffect, useRef } from 'react';
import './SaveTemplateModal.css';

interface SaveTemplateModalProps {
  initialName : string;
  onConfirm   : (name: string) => void;
  onCancel    : () => void;
}

const SaveTemplateModal: React.FC<SaveTemplateModalProps> = ({
  initialName,
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState(initialName || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <div className="stm-backdrop" onClick={onCancel}>
      <div className="stm-card" onClick={e => e.stopPropagation()}>
        <h2 className="stm-title">Save Template</h2>
        <p className="stm-subtitle">Give your template a name to identify it later.</p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className="stm-input"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Tax Invoice, Purchase Order…"
            maxLength={120}
          />
          <div className="stm-actions">
            <button type="button" className="stm-btn stm-btn--cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="stm-btn stm-btn--save" disabled={!name.trim()}>
              💾 Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaveTemplateModal;