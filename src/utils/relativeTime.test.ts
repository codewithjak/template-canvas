import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relativeTime } from './relativeTime'

const NOW = new Date('2026-07-13T12:00:00Z').getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()

test('under a minute reads as "just now"', () => {
  assert.equal(relativeTime(ago(20_000), NOW), 'just now')
})

test('minutes, singular and plural', () => {
  assert.equal(relativeTime(ago(60_000), NOW), '1 minute ago')
  assert.equal(relativeTime(ago(14 * 60_000), NOW), '14 minutes ago')
})

test('hours, singular and plural', () => {
  assert.equal(relativeTime(ago(60 * 60_000), NOW), '1 hour ago')
  assert.equal(relativeTime(ago(3 * 60 * 60_000), NOW), '3 hours ago')
})

test('past a day it falls back to a date, not "36 hours ago"', () => {
  assert.ok(!relativeTime(ago(48 * 60 * 60_000), NOW).includes('ago'))
})

test('an unparseable timestamp degrades instead of printing NaN', () => {
  assert.equal(relativeTime('not-a-date', NOW), 'earlier')
})

test('a future timestamp (clock skew) clamps to "just now", never negative', () => {
  assert.equal(relativeTime(new Date(NOW + 60_000).toISOString(), NOW), 'just now')
})
