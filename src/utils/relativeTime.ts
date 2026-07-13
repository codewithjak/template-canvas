/**
 * relativeTime.ts — "3 hours ago" for an ISO timestamp.
 *
 * Extracted from `CanvasStartLayer.savedAgo`, which was the only copy until the
 * Dashboard needed the same thing. Both call this now, so the two cannot drift
 * (and no third copy gets written when the draft-restore card lands).
 *
 * `now` is injectable so the thresholds are testable without freezing the clock.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'earlier'

  const mins = Math.max(0, Math.round((now - then) / 60_000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`

  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`

  return new Date(iso).toLocaleDateString()
}
