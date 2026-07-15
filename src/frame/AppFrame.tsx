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
import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { FrameActionsProvider } from './FrameActions'
import { pageTitle, defaultSidebarCollapsed } from './navModel'
import './frame.css'

function AppFrame() {
  const { pathname } = useLocation()

  // The header's actions container, published to the page below so it can portal
  // its own controls up here. State (not a ref) so the page re-renders once the
  // node exists — a ref would still be null on the page's first render.
  const [actionsSlot, setActionsSlot] = useState<HTMLDivElement | null>(null)

  // Collapsed in the editor, open everywhere else — the canvas is starved for width
  // (Amendment 8). Re-derived on every route change, so entering the editor always
  // collapses it, while a manual toggle holds for as long as you stay on the page.
  const [collapsed, setCollapsed] = useState(() => defaultSidebarCollapsed(pathname))
  useEffect(() => {
    setCollapsed(defaultSidebarCollapsed(pathname))
  }, [pathname])

  return (
    // The class is what changes `--frame-sidebar-w`. That var is not decoration: the
    // floating format bars and the status bar are `position: fixed` and centre on the
    // STAGE by subtracting the chrome from the window. Collapse the sidebar without
    // changing the var and they all drift 82px off-centre.
    <div className={`frame${collapsed ? ' frame--sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
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
