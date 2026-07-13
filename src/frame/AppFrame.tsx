/**
 * AppFrame.tsx — the persistent shell around the app's signed-in pages
 * (app-frame doc T1.1). Used as a React-Router layout route: sidebar + the one
 * header + <Outlet/>.
 *
 * Owns NO domain state. It renders navigation and a header; the page inside the
 * Outlet renders everything else.
 *
 * Currently framed: /settings. /canvas joins in Phase 1b — NOT before: its rail,
 * properties panel and action bar are all `position: fixed` to the viewport with
 * offsets tuned to the 52px header that this frame replaces (see
 * APP_FRAME_DASHBOARD_ARCHITECTURE.md §4.5), so it would float over the frame at
 * the wrong offsets until the editor re-chrome lands.
 */
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { pageTitle } from './navModel'
import './frame.css'

function AppFrame() {
  const { pathname } = useLocation()

  return (
    <div className="frame">
      <Sidebar />
      <div className="frame-main">
        <TopBar title={pageTitle(pathname)} />
        <main className="frame-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppFrame
