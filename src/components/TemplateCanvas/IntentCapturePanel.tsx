/**
 * IntentCapturePanel.tsx
 *
 * Pre-upload screen. Asks the user one question in business language
 * before the file lands — giving the AI layer a prior so it doesn't
 * guess cold on genuinely flat datasets.
 *
 * Three options:
 *   - per-row:    Each row is a separate document (labels, cards, certificates)
 *   - relational: Data has parent-child relationships (invoices, report cards)
 *   - flat:       Single complete report — all data in one PDF
 *
 * Contract:
 *   - Renders before the dropzone
 *   - Calls onSelect(intent) when the user picks an option
 *   - Does NOT render the dropzone itself — UploadData owns that
 */

import React from 'react';
import type { UploadIntent } from '../../types/runtimeDataStructure';
import './IntentCapturePanel.css';

interface IntentCapturePanelProps {
  onSelect: (intent: UploadIntent) => void;
}

export const IntentCapturePanel: React.FC<IntentCapturePanelProps> = ({ onSelect }) => {
  return (
    <div className="icp-root">
      <div className="icp-eyebrow">Before you upload</div>
      <h2 className="icp-heading">What kind of data are you working with?</h2>
      <p className="icp-sub">
        This helps us understand your data structure before it arrives.
      </p>

      <div className="icp-options">
        <button
          className="icp-option"
          onClick={() => onSelect('per-row')}
          type="button"
        >
          <div className="icp-option-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="8" width="24" height="3" rx="1.5" fill="currentColor" opacity="0.9"/>
              <rect x="4" y="14.5" width="24" height="3" rx="1.5" fill="currentColor" opacity="0.6"/>
              <rect x="4" y="21" width="24" height="3" rx="1.5" fill="currentColor" opacity="0.35"/>
            </svg>
          </div>
          <div className="icp-option-body">
            <span className="icp-option-title">Each row is a separate document</span>
            <span className="icp-option-desc">
              A single table where every row becomes its own PDF —
              certificates, labels, ID cards, letters.
            </span>
          </div>
          <div className="icp-option-arrow" aria-hidden="true">›</div>
        </button>

        <button
          className="icp-option"
          onClick={() => onSelect('relational')}
          type="button"
        >
          <div className="icp-option-icon icp-option-icon--relational" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="3" y="5" width="11" height="8" rx="2" fill="currentColor" opacity="0.9"/>
              <rect x="18" y="5" width="11" height="4" rx="1.5" fill="currentColor" opacity="0.55"/>
              <rect x="18" y="11" width="11" height="4" rx="1.5" fill="currentColor" opacity="0.55"/>
              <rect x="3" y="19" width="11" height="8" rx="2" fill="currentColor" opacity="0.9"/>
              <rect x="18" y="19" width="11" height="4" rx="1.5" fill="currentColor" opacity="0.55"/>
              <rect x="18" y="25" width="11" height="4" rx="1.5" fill="currentColor" opacity="0.55"/>
              <line x1="14" y1="9" x2="18" y2="9" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
              <line x1="14" y1="23" x2="18" y2="23" strokeWidth="1.5" stroke="currentColor" opacity="0.4"/>
            </svg>
          </div>
          <div className="icp-option-body">
            <span className="icp-option-title">My data has related tables</span>
            <span className="icp-option-desc">
              Multiple sheets where one sheet's rows link to rows in another —
              students and their grades, orders and their line items, classes and students.
            </span>
          </div>
          <div className="icp-option-arrow" aria-hidden="true">›</div>
        </button>

        <button
          className="icp-option"
          onClick={() => onSelect('flat')}
          type="button"
        >
          <div className="icp-option-icon icp-option-icon--report" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="6" y="3" width="20" height="26" rx="2" fill="currentColor" opacity="0.15"/>
              <rect x="6" y="3" width="20" height="26" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.9" fill="none"/>
              <rect x="10" y="8" width="12" height="2" rx="1" fill="currentColor" opacity="0.7"/>
              <rect x="10" y="13" width="12" height="2" rx="1" fill="currentColor" opacity="0.5"/>
              <rect x="10" y="18" width="8" height="2" rx="1" fill="currentColor" opacity="0.35"/>
              <rect x="10" y="23" width="10" height="2" rx="1" fill="currentColor" opacity="0.35"/>
            </svg>
          </div>
          <div className="icp-option-body">
            <span className="icp-option-title">This is a single complete report</span>
            <span className="icp-option-desc">
              All your data — tables, fields, sections — renders into one PDF.
              Financial statements, audit reports, dashboards.
            </span>
          </div>
          <div className="icp-option-arrow" aria-hidden="true">›</div>
        </button>
      </div>
    </div>
  );
};