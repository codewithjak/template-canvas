/**
 * ArrangeSection.tsx — z-order, duplicate and delete, inside the Layout tab
 * (relayout doc T4.6).
 *
 * This is the ONE thing the floating `ElementQuickBar` has that the properties
 * panel never did. It calls the same handlers; the quick bar is retired only once
 * this is verified (T4.10), not before.
 */
import './panel.css'

export interface ArrangeActions {
  /** Tables cannot be duplicated today — the quick bar hides the button too. */
  canDuplicate: boolean
  onBringToFront: () => void
  onSendToBack: () => void
  onDuplicate: () => void
  onDelete: () => void
}

function ArrangeSection({ actions }: { actions: ArrangeActions }) {
  return (
    <>
      <div className="ep-section-label">Arrange</div>
      <div className="ep-arrange">
        <button type="button" className="ep-arrange__btn" onClick={actions.onBringToFront}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <path d="M8 2.5v6M5.5 5 8 2.5 10.5 5" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="3" y="9.5" width="10" height="4" rx="1" />
          </svg>
          <span>Front</span>
        </button>

        <button type="button" className="ep-arrange__btn" onClick={actions.onSendToBack}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
            <rect x="3" y="2.5" width="10" height="4" rx="1" />
            <path d="M8 13.5v-6M5.5 11 8 13.5 10.5 11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Back</span>
        </button>

        {actions.canDuplicate && (
          <button type="button" className="ep-arrange__btn" onClick={actions.onDuplicate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5h10" />
            </svg>
            <span>Duplicate</span>
          </button>
        )}

        <button
          type="button"
          className="ep-arrange__btn ep-arrange__btn--danger"
          onClick={actions.onDelete}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Delete</span>
        </button>
      </div>
    </>
  )
}

export default ArrangeSection
