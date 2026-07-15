/**
 * AppFrame.tsx — the persistent shell around the app's signed-in pages
 * (app-frame doc T1.1). Used as a React-Router layout route: sidebar + the one
 * header + <Outlet/>.
 *
 * Owns NO domain state. It renders navigation and a header; the page inside the
 * Outlet renders everything else.
 *
 * Framed: /dashboard, /templates, /settings and /canvas. The editor joined once its
 * own 52px header was removed and its action bar stopped being viewport-fixed — it
 * portals into this header instead (see FrameActions), so there is exactly one.
 */
import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { FrameActionsProvider } from './FrameActions'
import { pageTitle } from './navModel'
import './frame.css'

function AppFrame() {
  const { pathname } = useLocation()

  // The header's actions container, published to the page below so it can portal
  // its own controls up here. State (not a ref) so the page re-renders once the
  // node exists — a ref would still be null on the page's first render.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null)

  return (
    <div className="frame">
      <Sidebar />
      <div className="frame-main">
        <TopBar title={pageTitle(pathname)} actionsRef={setActionsSlot} />
        <main className="frame-content">
          <FrameActionsProvider value={actionsSlot}>
            <Outlet />
          </FrameActionsProvider>
        </main>
      </div>
    </div>
  )
}

export default AppFrame
