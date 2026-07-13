/**
 * draftSchedule.ts — the pure timing of the draft autosave (activation doc
 * T0.4). A plain debounce re-arms on every edit, so uninterrupted editing would
 * never write and a crash mid-burst would lose the whole burst. These two
 * functions give the debounce a MAX-WAIT: the write fires `debounceMs` after
 * editing pauses, but at most `maxWaitMs` after the first unsaved edit even if
 * editing never pauses. Pure and time-injectable so the cadence is testable.
 */

/**
 * The deadline (ms epoch) by which the current unsaved burst must be written.
 * `current === 0` means "no burst in progress" → start one now.
 */
export function draftDeadline(current: number, now: number, maxWaitMs: number): number {
  return current === 0 ? now + maxWaitMs : current
}

/** The timer delay: debounce, clamped so it never pushes past the deadline. */
export function nextDraftDelay(deadline: number, now: number, debounceMs: number): number {
  return Math.max(0, Math.min(debounceMs, deadline - now))
}
