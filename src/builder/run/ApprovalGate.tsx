/**
 * ApprovalGate.tsx — the human-in-the-loop gate (P7).
 *
 * Shows the plan (PlanReview); on Approve, runs the supplied apply() and shows
 * captured outputs. apply() is injected by the run controller, so the gate is
 * agnostic to whether the apply runs on the backend or is simulated locally.
 */

import { useState } from 'react';
import type { Plan } from './planTypes';
import type { AppliedResult } from './simulateApply';
import { PlanReview } from './PlanReview';
import './ApprovalGate.css';

type Phase = 'review' | 'applying' | 'applied' | 'error';

export function ApprovalGate({ plan, onApply, onClose }: {
  plan: Plan;
  onApply: () => Promise<AppliedResult>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('review');
  const [result, setResult] = useState<AppliedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    setPhase('applying');
    try {
      setResult(await onApply());
      setPhase('applied');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed.');
      setPhase('error');
    }
  }

  if (phase === 'review') {
    return <PlanReview plan={plan} onClose={onClose} onApprove={approve} />;
  }

  return (
    <div className="ag-root">
      <div className="ag-head">
        <strong>
          {phase === 'applying' ? 'Applying…' : phase === 'error' ? 'Apply failed' : 'Applied'}
        </strong>
        {result?.simulated && <span className="ag-sim">simulated</span>}
        <button className="ag-close" onClick={onClose}>×</button>
      </div>

      {phase === 'applying' && <p className="ag-msg">Provisioning {plan.summary.add} resource(s)…</p>}

      {phase === 'error' && <p className="ag-err">{error}</p>}

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
