/**
 * CanvasStartLayer.tsx — activation doc T1.1 / T1.5 / T1.9.
 *
 * The first-run "Start Layer": outcome cards shown inside an otherwise-empty
 * canvas so the product's promise (data in → document out) is visible without
 * hunting the toolbar. PURELY PRESENTATIONAL — it owns no business logic and no
 * data paths; it renders cards and calls the callbacks the canvas passes in
 * (which are the same handlers the toolbar buttons already use).
 *
 * Accessibility (T1.9): every card is a real <button>; the layer is a plain
 * region, not a dialog (it traps nothing and steals no focus on mount); tab
 * order follows visual order (draft first when present); the focus ring uses
 * the editor's --color-accent-ring token. When the document stops being
 * pristine the canvas stops rendering this component, so it leaves the DOM
 * entirely — nothing stale remains for assistive tech.
 */
import './CanvasStartLayer.css'

interface StartCard {
  key: string
  title: string
  description: string
  onClick: () => void
  icon: React.ReactNode
  emphasis?: boolean
}

interface Props {
  onBrowseTemplates: () => void
  onRebuildPdf: () => void
  onBindData: () => void
  onStartBlank: () => void
  /** Present only when a restorable draft exists for the current user. */
  draft?: { savedAt: string; onRestore: () => void }
}

function savedAgo(savedAt: string): string {
  const then = new Date(savedAt).getTime()
  if (Number.isNaN(then)) return 'earlier'
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  return new Date(savedAt).toLocaleDateString()
}

function CanvasStartLayer({ onBrowseTemplates, onRebuildPdf, onBindData, onStartBlank, draft }: Props) {
  const cards: StartCard[] = []

  if (draft) {
    cards.push({
      key: 'continue',
      title: 'Continue where you left off',
      description: `Pick up your unsaved work from ${savedAgo(draft.savedAt)}.`,
      onClick: draft.onRestore,
      emphasis: true,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
        </svg>
      ),
    })
  }

  cards.push(
    {
      key: 'template',
      title: 'Start from a template',
      description: 'Open a ready-made design and make it your own.',
      onClick: onBrowseTemplates,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
        </svg>
      ),
    },
    {
      key: 'ai',
      title: 'Rebuild a PDF with AI',
      description: 'Upload a PDF and get an editable version back.',
      onClick: onRebuildPdf,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11 12 15.6 10.1 11 5.5 9.5l4.6-1.9L12 3z" /><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" />
        </svg>
      ),
    },
    {
      key: 'data',
      title: 'Start from your data',
      description: "Upload a spreadsheet and we'll lay it out for you.",
      onClick: onBindData,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
        </svg>
      ),
    },
    {
      key: 'blank',
      title: 'Start blank',
      description: 'An empty page to build from scratch.',
      onClick: onStartBlank,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" />
        </svg>
      ),
    },
  )

  return (
    <div className="canvas-start-layer" role="region" aria-label="Start a document">
      <div className="csl-inner">
        <div className="csl-heading">
          <h2 className="csl-title">What do you want to make?</h2>
          <p className="csl-subtitle">Bring in your content and get a finished document out. Pick a starting point.</p>
        </div>
        <div className="csl-cards">
          {cards.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`csl-card${c.emphasis ? ' csl-card--emphasis' : ''}`}
              onClick={c.onClick}
            >
              <span className="csl-card-icon" aria-hidden="true">{c.icon}</span>
              <span className="csl-card-text">
                <span className="csl-card-title">{c.title}</span>
                <span className="csl-card-desc">{c.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CanvasStartLayer
