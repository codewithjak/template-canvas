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

export type AnalyticsEventType =
  | 'login'
  | 'template_created'
  | 'pdf_exported'
  // Canvas activation funnel (activation doc §5). DB column is text, so these
  // add no schema change — only the TypeScript union grows.
  | 'start_layer_shown'
  | 'start_layer_card_clicked'
  | 'draft_restored'
  | 'data_bound'

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
