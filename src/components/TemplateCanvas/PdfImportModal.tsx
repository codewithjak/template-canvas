/**
 * PdfImportModal.tsx
 *
 * Asks how to rebuild an uploaded PDF: as a reusable TOKENIZED TEMPLATE
 * (values → {{placeholders}}, fillable once a data source is linked) or as a
 * one-off DOCUMENT (this PDF's values filled in). Replaces the old window.confirm.
 */

import React from 'react';
import './SaveTemplateModal.css';

interface PdfImportModalProps {
  fileName: string;
  onChoose: (mode: 'template' | 'document') => void;
  onCancel: () => void;
}

const PdfImportModal: React.FC<PdfImportModalProps> = ({ fileName, onChoose, onCancel }) => (
  <div className="stm-backdrop" onClick={onCancel}>
    <div className="stm-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
      <h2 className="stm-title">Rebuild from PDF</h2>
      <p className="stm-subtitle">
        “{fileName}” — choose what to create.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: '8px 0 4px' }}>
        <button
          type="button"
          className="pim-option"
          onClick={() => onChoose('template')}
          style={pimOption}
        >
          <span style={pimOptTitle}>📐 Reusable template <span style={pimBadge}>recommended</span></span>
          <span style={pimOptDesc}>
            Every value becomes a <code>{'{{placeholder}}'}</code> and tables become bindable rows.
            Nothing is filled in until you link a data source.
          </span>
        </button>

        <button
          type="button"
          className="pim-option"
          onClick={() => onChoose('document')}
          style={pimOption}
        >
          <span style={pimOptTitle}>📄 Filled document</span>
          <span style={pimOptDesc}>
            This PDF’s actual values are filled in — a one-off copy, not a reusable template.
          </span>
        </button>
      </div>

      <div className="stm-actions">
        <button type="button" className="stm-btn stm-btn--cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  </div>
);

const pimOption: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left',
  padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10,
  background: '#fff', cursor: 'pointer',
};
const pimOptTitle: React.CSSProperties = { fontWeight: 600, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 };
const pimOptDesc: React.CSSProperties = { fontSize: 13, color: '#64748b', lineHeight: 1.4 };
const pimBadge: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#0f766e', background: '#ccfbf1',
  borderRadius: 999, padding: '2px 8px',
};

export default PdfImportModal;
