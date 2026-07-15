/**
 * FrameActions.tsx — how a framed page puts its own controls in the frame's ONE
 * header (app-frame doc; relayout 4E).
 *
 * The problem: `TopBar` is rendered by `AppFrame`, above the `<Outlet/>`, so a page
 * deep inside the outlet cannot pass it anything by props. The editor's actions
 * (undo/redo, page size, save, export…) belong in that header, and the editor is
 * the page.
 *
 * The seam: `AppFrame` publishes the header's actions container through context;
 * the page portals into it. The page keeps ownership of its buttons and their
 * handlers — only where they LAND changes. No canvas state leaks into the frame,
 * and the frame knows nothing about the canvas.
 *
 * If there is no frame (a page rendered outside the layout route), the portal
 * renders its children in place rather than dropping them on the floor.
 */
import { createContext, useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FrameActionsContext = createContext<HTMLElement | null>(null)

export const FrameActionsProvider = FrameActionsContext.Provider

export function FrameActionsPortal({ children }: { children: ReactNode }) {
  const slot = useContext(FrameActionsContext)
  if (!slot) return <>{children}</>
  return createPortal(children, slot)
}
