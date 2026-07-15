/**
 * TopBar.tsx — the app frame's header (app-frame doc T1.3).
 *
 * This is the ONLY header in the framed part of the app. The pages inside the
 * frame no longer draw their own (see Settings.tsx, whose `settings__bar` was
 * removed in the same change) — two stacked headers was the thing this replaces.
 *
 * `actions` is a slot: a framed page passes its own controls (Settings passes
 * none today; the editor will pass Save/Export/undo/redo when it joins the frame
 * in Phase 1b). The TopBar itself owns nothing but layout.
 */
import type { ReactNode, Ref } from 'react'
import UserMenu from '../auth/UserMenu'
import './frame.css'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  /**
   * The actions container, published so a framed page can portal its own controls
   * into this header (see FrameActions). The editor's toolbar lands here — which is
   * why the editor does not draw a second header of its own.
   */
  actionsRef?: Ref<HTMLDivElement>
}

function TopBar({ title, subtitle, actions, actionsRef }: Props) {
  return (
    <header className="frame-top">
      <div className="frame-top__titles">
        <h1 className="frame-top__title">{title}</h1>
        {subtitle && <p className="frame-top__sub">{subtitle}</p>}
      </div>
      <div className="frame-top__actions" ref={actionsRef}>
        {actions}
        <UserMenu />
      </div>
    </header>
  )
}

export default TopBar
