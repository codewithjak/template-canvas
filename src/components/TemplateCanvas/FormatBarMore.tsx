/**
 * FormatBarMore.tsx — the "⋯" overflow on a floating format bar.
 *
 * The bars carry the controls that fit inline. The ones that do not — a table's
 * columns and binding, a chart's series, a page number's format — open from here
 * in a popover, so the left properties panel is no longer needed for them
 * (relayout doc A5.3).
 *
 * It renders whatever it is given and owns exactly one thing: whether it is open.
 * The controls inside are the EXISTING property components, re-housed, not
 * rewritten — which is why the popover pulls in PropertiesPanel.css: those
 * components still use its section styles.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import './TextFormatBar.css'
import './PropertiesPanel.css'

interface Props {
  /** Accessible name, e.g. "Table options". Also the button's tooltip. */
  label: string
  children: ReactNode
}

function FormatBarMore({ label, children }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on click-outside and on Escape. Without this the popover would sit over
  // the canvas and swallow the next click at the element the user is trying to edit.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="tfb-more" ref={rootRef}>
      <button
        type="button"
        className={`tfb-more__btn${open ? ' tfb-more__btn--on' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>

      {open && (
        <div className="tfb-more__pop" role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  )
}

export default FormatBarMore
