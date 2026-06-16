/**
 * PhaseIndicator.tsx
 *
 * The little numbered step bar at the top of the upload wizard
 * (Intent → Upload → Review → Map). It highlights the current step, ticks the
 * steps already done, and hides the "Review" step unless the user picked the
 * relational intent.
 */

import React from 'react';
import type { UploadIntent } from '../../../types/runtimeDataStructure';
import type { Phase } from './types';

interface Props {
  phase: Phase;
  intent: UploadIntent;
}

// All steps and their short labels, in order.
const ALL_PHASES: Phase[] = ['intent', 'upload', 'review', 'mapping'];
const ALL_LABELS = ['Intent', 'Upload', 'Review', 'Map'];

function PhaseIndicator({ phase, intent }: Props) {
  // The "review" step only exists for relational uploads.
  const showReview = intent === 'relational';
  const phases = showReview ? ALL_PHASES : ALL_PHASES.filter((p) => p !== 'review');
  const labels = showReview ? ALL_LABELS : ALL_LABELS.filter((_, i) => ALL_PHASES[i] !== 'review');

  const currentStep = phases.indexOf(phase);

  return (
    <div className="up-phase-bar">
      {phases.map((p, i) => {
        const isActive = phase === p;
        const isDone = currentStep > i;
        return (
          <React.Fragment key={p}>
            <div className={`up-phase-step ${isActive ? 'up-phase-step--active' : ''} ${isDone ? 'up-phase-step--done' : ''}`}>
              <span className="up-phase-dot">{isDone ? '✓' : i + 1}</span>
              <span className="up-phase-label">{labels[i]}</span>
            </div>
            {i < phases.length - 1 && (
              <div className={`up-phase-line ${isDone ? 'up-phase-line--done' : ''}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default PhaseIndicator;
