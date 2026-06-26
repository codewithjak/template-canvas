/**
 * ApprovalGate.tsx — the human-in-the-loop gate (P7).
 *
 * Shows the plan (PlanReview); on Approve, runs the apply and shows captured
 * outputs. Locally it simulates the apply so the whole lifecycle is visible; a
 * real apply runs in the user's account via the backend once connected.
 */

import { useState } from 'react';
import type { Plan } from './planTypes';
import { PlanReview } from './PlanReview';
import { simulateApply, type AppliedResult } from './simulateApply';
import './ApprovalGate.css';

type Phase = 'review' | 'applying' | 'applied';

export function ApprovalGate({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('review');
  const [result, setResult] = useState<AppliedResult | null>(null);

  function approve() {
    setPhase('applying');
    // Local simulated apply (a real apply runs server-side once connected).
    window.setTimeout(() => {
      setResult(simulateApply(plan));
      setPhase('applied');
    }, 600);
  }

  if (phase === 'review') {
    return <PlanReview plan={plan} onClose={onClose} onApprove={approve} />;
  }

  return (
    <div className="ag-root">
      <div className="ag-head">
        <strong>{phase === 'applying' ? 'Applying…' : 'Applied'}</strong>
        {result?.simulated && <span className="ag-sim">simulated</span>}
        <button className="ag-close" onClick={onClose}>×</button>
      </div>

      {phase === 'applying' && (
        <p className="ag-msg">Provisioning {plan.summary.add} resource(s)…</p>
      )}

      {phase === 'applied' && result && (
        <div className="ag-body">
          <p className="ag-ok">✓ {result.created.length} resource(s) created.</p>
          {Object.keys(result.outputs).length > 0 && (
            <>
              <h4>Outputs</h4>
              <div className="ag-outputs">
                {Object.entries(result.outputs).map(([k, v]) => (
                  <div className="ag-out" key={k}>
                    <span className="ag-out-k">{k}</span>
                    <span className="ag-out-v">{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
