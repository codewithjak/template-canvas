/**
 * StartActions.tsx — "Start something" (app-frame doc T3.3).
 *
 * The two entry points that are NOT reachable from the sidebar: rebuilding a PDF
 * with AI, and binding a spreadsheet. Both open panels that live inside the
 * canvas, so these cards navigate there with a launch intent rather than reaching
 * into the canvas themselves — they declare, the canvas executes (§5).
 *
 * ("Start from a template" is not here: that is the Templates page, and it gets a
 * sidebar item of its own. "Start blank" is the New template button.)
 */
import { useNavigate } from 'react-router-dom'
import { toLaunchState, type CanvasLaunchIntent } from '../../frame/launchIntent'
import './dashboard.css'

interface Action {
  readonly intent: CanvasLaunchIntent
  readonly title: string
  readonly description: string
  readonly icon: React.ReactNode
}

const ACTIONS: readonly Action[] = [
  {
    intent: { kind: 'rebuild-ai' },
    title: 'Rebuild a PDF with AI',
    description: 'Upload a PDF and get an editable version back.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="m12 3 1.9 4.6L18.5 9.5 13.9 11 12 15.6 10.1 11 5.5 9.5l4.6-1.9L12 3z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    intent: { kind: 'bind-data' },
    title: 'Start from your data',
    description: "Upload a spreadsheet and we'll lay it out for you.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    ),
  },
]

function StartActions() {
  const navigate = useNavigate()

  return (
    <div className="dash-actions">
      {ACTIONS.map((action) => (
        <button
          key={action.title}
          type="button"
          className="dash-action"
          onClick={() => navigate('/canvas', toLaunchState(action.intent))}
        >
          <span className="dash-action__icon">{action.icon}</span>
          <span className="dash-action__text">
            <span className="dash-action__title">{action.title}</span>
            <span className="dash-action__desc">{action.description}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export default StartActions
