/**
 * firstExport.ts — the `first_export_completed` marker (activation doc §5).
 *
 * WHY THIS EXISTS. `pdf_exported` is logged by the backend on every export, so a
 * user with 500 exports writes 500 rows: it measures volume, not activation. The
 * funnel's terminal step is "did this person ever reach a first success", which
 * needs a once-per-user marker. That is this.
 *
 * SCOPED PER USER, not merely per browser. §5 says "once per browser", which is a
 * bug: on a shared machine the second account to sign in would have its first
 * export suppressed by the first account's flag, and would silently never appear
 * to activate. The key carries the user id, exactly as `draftStore` does.
 *
 * Same fire-and-forget contract as the draft store: never throws.
 */

const firstExportKey = (userId: string | null | undefined): string =>
  `mapdoc.firstExport.v1:${userId || 'anon'}`

/**
 * Records that this user has now completed an export, and reports whether it was
 * their FIRST. The caller logs the event only when this returns true.
 *
 * Fails CLOSED when storage is unavailable (private mode, quota, disabled): it
 * returns false rather than true. Returning true would log "first export" on
 * every single export from that browser and quietly destroy the metric it exists
 * to produce. Under-counting is recoverable; a corrupted funnel is not.
 */
export function markFirstExport(userId: string | null | undefined): boolean {
  try {
    const key = firstExportKey(userId)
    if (window.localStorage.getItem(key)) return false
    window.localStorage.setItem(key, new Date().toISOString())
    return true
  } catch {
    return false
  }
}
