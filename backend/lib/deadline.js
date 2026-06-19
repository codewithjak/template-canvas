'use strict';

/**
 * lib/deadline.js
 *
 * Normalizes a "respond by" deadline to a single absolute Date. The sender may
 * express it either way:
 *   - relative: { mode: 'relative', value: { days, hours, minutes } }  (from now)
 *   - absolute: { mode: 'absolute', value: '2026-06-25T17:00:00Z' }
 *
 * Returns null for anything unusable, so callers can reject with a 400.
 * Pure: no I/O.
 */

const MS = { minutes: 60000, hours: 3600000, days: 86400000 };

/** Sum a { days, hours, minutes } offset into milliseconds (missing parts = 0). */
function offsetMs(value) {
  const v = value || {};
  return (Number(v.days)    || 0) * MS.days
       + (Number(v.hours)   || 0) * MS.hours
       + (Number(v.minutes) || 0) * MS.minutes;
}

/** Now + offset; null when the offset is zero/negative. */
function fromRelative(value) {
  const ms = offsetMs(value);
  return ms > 0 ? new Date(Date.now() + ms) : null;
}

/** Parse an ISO/date string; null when it isn't a valid date. */
function fromAbsolute(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Resolve a deadline spec to an absolute Date, or null when invalid. */
function resolveDeadline(deadline) {
  if (!deadline || typeof deadline !== 'object') return null;
  if (deadline.mode === 'relative') return fromRelative(deadline.value);
  if (deadline.mode === 'absolute') return fromAbsolute(deadline.value);
  return null;
}

module.exports = { resolveDeadline };
