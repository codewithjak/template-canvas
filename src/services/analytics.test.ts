import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guards the bug that silently broke the activation funnel for a whole phase.
 *
 * `AnalyticsEventType` is a TypeScript union; `analytics_events.event_type` is a
 * CHECK-constrained column. Nothing connects them, so adding a member to the union
 * without widening the constraint means the database REJECTS every such insert —
 * and `logEvent` swallows the error by design, so the event vanishes with only a
 * console.warn. That is exactly what happened to the four activation events in
 * TC-0187: they logged nothing until the migration landed.
 *
 * These read the two sources of truth and assert they agree. Run from the repo
 * root (`npm test`).
 */

const ROOT = process.cwd()

function unionMembers(): Set<string> {
  const src = readFileSync(join(ROOT, 'src/services/analytics.ts'), 'utf8')
  const decl = src.split('export type AnalyticsEventType')[1] ?? ''
  const body = decl.split('export ')[0] // stop at the next export
  return new Set([...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
}

function constraintMembers(file: string): Set<string> {
  const sql = readFileSync(join(ROOT, file), 'utf8')
  // The LAST check(...) on event_type wins — migrations drop and re-add it.
  const checks = [...sql.matchAll(/check\s*\(\s*event_type\s+in\s*\(([\s\S]*?)\)\s*\)/gi)]
  assert.ok(checks.length > 0, `no event_type CHECK found in ${file}`)
  const list = checks[checks.length - 1][1]
  return new Set([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
}

/**
 * Subset, not equality: the constraint legitimately holds event types the
 * FRONTEND union does not, because the backend logs its own (`ai_build`, from
 * backend/analytics.js). What must never happen is the reverse — a frontend event
 * the database will reject.
 */
function assertAccepted(file: string) {
  const accepted = constraintMembers(file)
  const rejected = [...unionMembers()].filter((event) => !accepted.has(event)).sort()
  assert.deepEqual(
    rejected,
    [],
    `${file} would REJECT these events on insert, and logEvent swallows the error: ${rejected.join(', ')}`,
  )
}

test('every AnalyticsEventType is accepted by the schema (a fresh database)', () => {
  assertAccepted('supabase/schema.sql')
})

test('every AnalyticsEventType is accepted by the migration (a deployed database)', () => {
  // Without this, a deployed DB keeps its old constraint and the event is
  // rejected on insert — silently, because logEvent never throws.
  assertAccepted('supabase/canvas_activation_events.sql')
})
