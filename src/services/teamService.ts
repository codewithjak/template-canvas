/**
 * src/services/teamService.ts
 * Resolves and switches the current user's ACTIVE team.
 *
 * A user can now belong to more than one team (after accepting an invite), so
 * the active team is whichever `profiles.active_team_id` points at — falling
 * back deterministically (owner role first, then earliest joined) when it's
 * unset or stale. This mirrors the server resolver in backend/apiKeys.js.
 */
import { supabase } from './supabaseClient'

let cachedTeamId: string | null = null

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function getActiveTeamId(): Promise<string> {
  if (cachedTeamId) return cachedTeamId

  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in.')

  // RLS scopes these to the current user's own rows.
  const { data: memberships, error } = await supabase
    .from('memberships')
    .select('team_id, role, created_at')
    .order('created_at', { ascending: true })
  if (error) throw error
  if (!memberships || memberships.length === 0) {
    throw new Error('No team found for the current user.')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_team_id')
    .eq('id', userId)
    .maybeSingle()

  const active =
    memberships.find(m => m.team_id === profile?.active_team_id) ??
    memberships.find(m => m.role === 'owner') ??
    memberships[0]

  cachedTeamId = active.team_id as string
  return cachedTeamId
}

/** Teams the current user belongs to — for the team switcher. */
export async function listMyTeams(): Promise<{ teamId: string; name: string; role: string }[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('team_id, role, teams(name)')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(m => ({
    teamId: m.team_id as string,
    role: m.role as string,
    name: (m.teams as { name?: string } | null)?.name ?? 'Team',
  }))
}

/** Switch the active team. Persists to the profile (RLS-allowed) + updates cache. */
export async function setActiveTeam(teamId: string): Promise<void> {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in.')
  const { error } = await supabase.from('profiles').update({ active_team_id: teamId }).eq('id', userId)
  if (error) throw error
  cachedTeamId = teamId
}

/** Call on sign-out, or after switching/joining a team, to drop the stale id. */
export function clearTeamCache(): void {
  cachedTeamId = null
}
