/**
 * src/services/teamService.ts
 * Resolves the current user's active team.
 *
 * Today every user belongs to exactly one (auto-provisioned) team, so we
 * just read their single membership. When team-switching ships later, this
 * is the one place that needs to learn about an "active team" selection.
 */
import { supabase } from './supabaseClient'

let cachedTeamId: string | null = null

export async function getActiveTeamId(): Promise<string> {
  if (cachedTeamId) return cachedTeamId

  const { data, error } = await supabase
    .from('memberships')
    .select('team_id')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error('No team found for the current user.')

  cachedTeamId = data.team_id as string
  return cachedTeamId
}

/** Call on sign-out so the next user doesn't inherit a stale team id. */
export function clearTeamCache(): void {
  cachedTeamId = null
}
