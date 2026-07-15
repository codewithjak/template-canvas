/**
 * src/services/analytics.ts
 * Team-scoped usage tracking.
 *
 * Every tracked action is one append-only row in public.analytics_events,
 * keyed on the user's TEAM (the tenant). user_id is recorded too, but only
 * as a "who within the team did it" drill-down — reporting groups by team.
 *
 * logEvent is fire-and-forget: it never throws and never blocks the user
 * action it is measuring. A failed insert is logged and swallowed.
 */
import { supabase } from './supabaseClient'
import { getActiveTeamId } from './teamService'

/**
 * Adding a member here is NOT enough to make the event land.
 *
 * `analytics_events.event_type` is text but carries a CHECK constraint, so an
 * unlisted value is REJECTED on insert — and `logEvent` swallows the error by
 * design (below), so the event disappears with only a console.warn. Every new
 * type needs the constraint widened in `supabase/schema.sql` AND a migration for
 * already-deployed databases (see `supabase/canvas_activation_events.sql`).
 *
 * This comment previously claimed the opposite ("DB column is text, so these add
 * no schema change"). It was wrong: the four activation events below logged
 * nothing from TC-0187 until the migration landed. `analytics.test.ts` now fails
 * if the union and the constraint ever disagree again.
 */
export type AnalyticsEventType =
  | 'login'
  | 'template_created'
  | 'pdf_exported'
  // Canvas activation funnel (activation doc §5)
  | 'start_layer_shown'
  | 'start_layer_card_clicked'
  | 'draft_restored'
  | 'data_bound'
  // Funnel terminal step: once per user per browser, the first time an export
  // actually completes. `pdf_exported` (backend) fires on EVERY export, so it
  // measures volume, not activation. See services/firstExport.ts.
  | 'first_export_completed'

export async function logEvent(
  eventType: AnalyticsEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    // team_id is required; without a resolvable team there's nothing to log.
    const teamId = await getActiveTeamId()
    const { data } = await supabase.auth.getUser()

    const { error } = await supabase.from('analytics_events').insert({
      team_id: teamId,
      user_id: data.user?.id ?? null,
      event_type: eventType,
      metadata,
    })
    if (error) throw error
  } catch (err) {
    // Analytics must never break the action it is measuring.
    console.warn('[analytics] failed to log event', eventType, err)
  }
}
