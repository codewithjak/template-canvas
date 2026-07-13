/**
 * useUnsavedChangesGuard — activation doc T0.3.
 *
 * While `isDirty` is true, registers a `beforeunload` handler that (1) flushes
 * the pending draft via `onFlush` so a tab close captures work the debounced
 * autosave has not written yet, then (2) prompts the browser's native
 * "leave site?" dialog. `isDirty` is the document-level dirty flag (changed
 * since the last save or load), NOT `canUndo` — a saved or freshly loaded
 * document must neither prompt nor need flushing.
 *
 * Note: this covers real unloads only. In-app route changes unmount the canvas
 * without firing beforeunload; the canvas flushes the draft on unmount for
 * that path.
 */
import { useEffect } from 'react'

export function useUnsavedChangesGuard(isDirty: boolean, onFlush?: () => void): void {
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      // Synchronous — localStorage writes complete before the tab unloads.
      onFlush?.()
      e.preventDefault()
      // Chrome requires returnValue to be set for the prompt to appear.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, onFlush])
}
