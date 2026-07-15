/**
 * ContinueDraft.tsx — "Continue where you left off" (relayout doc A2.5 T5.1/T5.3,
 * hosted here per app-frame doc Phase 4).
 *
 * This card is the ONLY surface that offers a crash-survivor draft back to the
 * user once the Start Layer retires. Without it, every line of activation Phase 0
 * — the user- and team-scoped draft store, the max-wait autosave, the unsaved
 * guard — keeps faithfully writing drafts that nothing can ever offer back.
 *
 * It decides, it does not hydrate: "Continue" navigates to the canvas with a
 * `restore-draft` intent, and the canvas restores through its existing
 * `applyDocument`. The draft never rides in router state (a document can embed
 * base64 images); the canvas re-reads it from storage.
 *
 * The team gate lives in `offerableDraft`, shared with the canvas, so the surface
 * that offers a draft and the surface that restores it cannot disagree.
 */
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useActiveTeamId } from '../../utils/useActiveTeamId'
import { restoreDraft, clearDraft, offerableDraft } from '../../services/draftStore'
import { toLaunchState } from '../../frame/launchIntent'
import { relativeTime } from '../../utils/relativeTime'
import { useMemo, useState } from 'react'
import './dashboard.css'

function ContinueDraft() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { teamId, loading: teamLoading } = useActiveTeamId()
  const [discarded, setDiscarded] = useState(false)

  const userId = user?.id ?? null

  // Read once the team is known. Reading earlier would compare the draft against
  // a not-yet-resolved null and withhold a draft we should be offering.
  const draft = useMemo(
    () => (teamLoading ? null : offerableDraft(restoreDraft(userId), teamId)),
    [teamLoading, userId, teamId],
  )

  if (!draft || discarded) return null

  const discard = () => {
    clearDraft(userId)
    setDiscarded(true)
  }

  return (
    <section className="dash-resume">
      <span className="dash-resume__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </span>

      <div className="dash-resume__text">
        <b>Continue where you left off</b>
        <small>Unsaved work from {relativeTime(draft.savedAt)}.</small>
      </div>

      <div className="dash-resume__buttons">
        <button type="button" className="dash-resume__discard" onClick={discard}>
          Discard
        </button>
        <button
          type="button"
          className="dash-resume__go"
          onClick={() => navigate('/canvas', toLaunchState({ kind: 'restore-draft' }))}
        >
          Continue
        </button>
      </div>
    </section>
  )
}

export default ContinueDraft
