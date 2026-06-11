import { useCallback, useRef, useState, type ReactNode } from 'react'

/**
 * "Book a demo" button — opens a Calendly scheduling popup.
 *
 * Calendly handles the whole two-sided flow: the visitor picks a slot and
 * enters their email, Calendly creates the event on the connected Google
 * Calendar (aliandkhan242@gmail.com) and emails the visitor a calendar invite,
 * so the meeting lands on both calendars with a Google Meet link.
 *
 * The Calendly widget assets are lazy-loaded on first click, so no third-party
 * script runs on a normal page visit.
 *
 * Set the event URL via VITE_CALENDLY_URL (e.g. https://calendly.com/your-handle/demo).
 */

const CALENDLY_CSS = 'https://assets.calendly.com/assets/external/widget.css'
const CALENDLY_JS = 'https://assets.calendly.com/assets/external/widget.js'

const CALENDLY_URL =
  import.meta.env.VITE_CALENDLY_URL ?? 'https://calendly.com/aliandkhan242/30min'

declare global {
  interface Window {
    Calendly?: { initPopupWidget: (opts: { url: string }) => void }
  }
}

/** Inject a <link>/<script> once and resolve when ready. */
function loadOnce(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Calendly) return Promise.resolve()

  if (!document.querySelector(`link[href="${CALENDLY_CSS}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = CALENDLY_CSS
    document.head.appendChild(link)
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CALENDLY_JS}"]`,
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Calendly failed to load')), { once: true })
      if (window.Calendly) resolve()
      return
    }
    const script = document.createElement('script')
    script.src = CALENDLY_JS
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Calendly failed to load'))
    document.body.appendChild(script)
  })
}

interface BookDemoProps {
  className?: string
  children?: ReactNode
}

export default function BookDemo({
  className = 'btn btn--ghost btn--lg',
  children,
}: BookDemoProps) {
  const [loading, setLoading] = useState(false)
  const loadingRef = useRef(false)

  const open = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      await loadOnce()
      window.Calendly?.initPopupWidget({ url: CALENDLY_URL })
    } catch {
      // Fall back to opening the scheduling page directly if the widget can't load.
      window.open(CALENDLY_URL, '_blank', 'noopener,noreferrer')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  return (
    <button type="button" className={className} onClick={open} disabled={loading}>
      {children ?? 'Book a demo'}
    </button>
  )
}
