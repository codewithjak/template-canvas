import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftDeadline, nextDraftDelay } from './draftSchedule'

const DEBOUNCE = 2000
const MAX_WAIT = 10000

/**
 * Drives the two pure schedule functions exactly as the autosave effect does,
 * over a list of edit timestamps, and returns the times a write fires. This is
 * the committed replacement for the Round-4 "throwaway timing simulation".
 *
 * Faithfulness note: when the real timer fires, the effect does NOT re-run (its
 * deps are unchanged) — the next max-wait window opens only on the NEXT edit.
 * So a write fires strictly BEFORE the edit that observes it (`timerAt < t`),
 * and that later edit opens the fresh window. Using `<=` here (firing on the
 * coincident edit and reopening from it) would understate the true bound by one
 * edit interval and let the test assert a hard MAX_WAIT gap the code does not
 * guarantee.
 */
function simulate(editTimes: number[]): number[] {
  let deadline = 0
  let timerAt: number | null = null
  const writes: number[] = []
  const events = [...editTimes]
  let i = 0
  while (i < events.length) {
    const t = events[i]
    if (timerAt !== null && timerAt < t) { writes.push(timerAt); deadline = 0; timerAt = null; continue }
    // effect re-run on an edit: recompute deadline + delay, reschedule
    deadline = draftDeadline(deadline, t, MAX_WAIT)
    timerAt = t + nextDraftDelay(deadline, t, DEBOUNCE)
    i++
  }
  if (timerAt !== null) writes.push(timerAt) // drain the final scheduled write
  return writes
}

test('single edit then pause → one write, DEBOUNCE after the edit', () => {
  assert.deepEqual(simulate([0]), [2000])
})

test('a burst within the debounce coalesces to one write', () => {
  assert.deepEqual(simulate([0, 100, 200, 300, 400, 500]), [2500])
})

test('continuous editing keeps writing (was: never); gaps bounded by MAX_WAIT + one edit interval', () => {
  const EDIT_INTERVAL = 100
  const cont: number[] = []
  for (let t = 0; t <= 25000; t += EDIT_INTERVAL) cont.push(t)
  const writes = simulate(cont)
  // The real guarantee is NOT a hard MAX_WAIT: the window reopens on the edit
  // after a write, so the true bound is MAX_WAIT + one edit interval.
  assert.ok(writes.length >= 2, `continuous editing must write repeatedly, got ${writes.join(',')}`)
  for (let k = 1; k < writes.length; k++) {
    const gap = writes[k] - writes[k - 1]
    assert.ok(
      gap <= MAX_WAIT + EDIT_INTERVAL,
      `gap ${writes[k - 1]}→${writes[k]} (${gap}) exceeds MAX_WAIT + edit interval`,
    )
  }
})

test('nextDraftDelay never goes negative or past the deadline', () => {
  assert.equal(nextDraftDelay(5000, 6000, 2000), 0) // deadline already passed
  assert.equal(nextDraftDelay(5000, 4500, 2000), 500) // clamped to deadline
  assert.equal(nextDraftDelay(5000, 1000, 2000), 2000) // plain debounce
})

test('draftDeadline starts a window only when none is open', () => {
  assert.equal(draftDeadline(0, 1000, MAX_WAIT), 11000) // fresh burst
  assert.equal(draftDeadline(11000, 1500, MAX_WAIT), 11000) // keep existing deadline
})
