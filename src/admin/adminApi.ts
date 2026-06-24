/**
 * src/admin/adminApi.ts  [ADMIN PANEL — isolated feature]
 *
 * Fetch helpers for the admin panel. Uses the same API_BASE + authHeaders()
 * pattern as the rest of the app's backend calls. Self-contained: delete
 * src/admin/ and nothing else references these.
 */
import { API_BASE, authHeaders } from '../services/config'

export interface AdminUser {
  id: string
  email: string
  name: string | null
  createdAt: string
  teamId: string | null
  teamName: string | null
  plan: string
  role: string | null
  deleted: boolean
  deletedAt: string | null
}

export type PlanId = 'free' | 'pro' | 'business'

export interface AdminActivity {
  user: { id: string; email: string; name: string | null; createdAt: string; deleted: boolean; deletedAt: string | null }
  team: { id: string | null; name: string | null; plan: string; role: string | null } | null
  summary: { counts: Record<string, number>; templateCount: number; lastActiveAt: string | null }
  events: { event_type: string; metadata: Record<string, unknown> | null; created_at: string }[]
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    return body?.error || fallback
  } catch {
    return fallback
  }
}

/** True if the signed-in user is a platform admin. */
export async function fetchIsAdmin(): Promise<boolean> {
  const res = await fetch(`${API_BASE}/v1/admin/me`, { headers: await authHeaders() })
  if (!res.ok) return false
  const body = await res.json()
  return !!body?.isAdmin
}

/** Every account in the system, newest signups first. */
export async function fetchUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_BASE}/v1/admin/users`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(await parseError(res, 'Could not load users.'))
  const body = await res.json()
  return body.users as AdminUser[]
}

/** Grant a plan to an account by email. Returns the updated team. */
export async function setUserPlan(
  email: string,
  plan: PlanId,
): Promise<{ email: string; plan: string; team: { id: string; name: string; plan: string } }> {
  const res = await fetch(`${API_BASE}/v1/admin/set-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ email, plan }),
  })
  if (!res.ok) throw new Error(await parseError(res, 'Could not set plan.'))
  return res.json()
}

/** A member's activity timeline + summary. */
export async function fetchUserActivity(id: string): Promise<AdminActivity> {
  const res = await fetch(`${API_BASE}/v1/admin/users/${encodeURIComponent(id)}/activity`, { headers: await authHeaders() })
  if (!res.ok) throw new Error(await parseError(res, 'Could not load activity.'))
  return res.json()
}

/** Soft-delete a member (record retained; account locked out). */
export async function softDeleteUser(id: string): Promise<{ deletedTeams: string[] }> {
  const res = await fetch(`${API_BASE}/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res, 'Could not delete member.'))
  return res.json()
}

/** Undo a soft-delete. */
export async function restoreUser(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/v1/admin/users/${encodeURIComponent(id)}/restore`, {
    method: 'POST',
    headers: await authHeaders(),
  })
  if (!res.ok) throw new Error(await parseError(res, 'Could not restore member.'))
}
