/**
 * PlanReview.tsx — renders a Terraform plan diff (+add / ~change / −destroy)
 * with a per-resource list and the approval gate (P6 UI; Apply lands in P7).
 */

import type { Plan, PlanAction } from './planTypes';
import './PlanReview.css';

const SIGN: Record<PlanAction, string> = {
  create: '+', update: '~', delete: '−', replace: '±', read: '≈', 'no-op': ' ',
};

export function PlanReview({ plan, onClose, onApprove }: {
  plan: Plan;
  onClose: () => void;
  onApprove?: () => void;
}) {
  const { add, change, destroy } = plan.summary;
  return (
    <div className="pr-root">
      <div className="pr-head">
        <strong>Plan</strong>
        <span className="pr-counts">
          <span className="add">+{add}</span>
          <span className="chg">~{change}</span>
          <span className="del">−{destroy}</span>
        </span>
        {plan.simulated && <span className="pr-sim" title="Local preview — not a real plan against state">simulated</span>}
        <button className="pr-close" onClick={onClose}>×</button>
      </div>

      <ul className="pr-list">
        {plan.resources.length === 0 && <li className="pr-empty">No resources to provision.</li>}
        {plan.resources.map((r) => (
          <li key={r.address} className={`pr-${r.action}`}>
            <span className="pr-sign">{SIGN[r.action]}</span>
            {r.address}
          </li>
        ))}
      </ul>

      <div className="pr-actions">
        <button className="pr-btn" onClick={onClose}>Close</button>
        <button
          className="pr-btn primary"
          disabled={!onApprove || plan.simulated}
          title={plan.simulated ? 'Connect a verified account to apply (P7)' : ''}
          onClick={onApprove}
        >
          Approve &amp; Apply
        </button>
      </div>
    </div>
  );
}
