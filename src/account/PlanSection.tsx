/**
 * src/account/PlanSection.tsx
 *
 * Settings section: current subscription plan + upgrade / manage entry point.
 * Lifted from the Plan card of the old one-page Settings.
 */
import { useNavigate } from 'react-router-dom'
import { usePlan } from '../plan/PlanProvider'
import { getPlan } from '../config/plans'
import { SectionCard } from './SectionCard'
import { ICONS } from './sectionIcons'
import './account.css'

export default function PlanSection() {
  const navigate = useNavigate()
  const { plan } = usePlan()
  return (
    <SectionCard title="Plan" subtitle="Your current subscription." icon={ICONS.plan}>
      <div className="srow">
        <div style={{ fontSize: 14 }}>
          <strong>{getPlan(plan).name}</strong>
          <span className="smeta"> · ${getPlan(plan).price}/mo</span>
        </div>
        <button onClick={() => navigate('/pricing')} className="btn btn--primary btn--sm">
          {plan === 'business' ? 'Manage plan' : 'Upgrade'}
        </button>
      </div>
    </SectionCard>
  )
}
