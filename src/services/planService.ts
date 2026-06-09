/**
 * src/services/planService.ts
 *
 * Plan reads/writes for the client. The team's current plan + usage already
 * come from getUsage() (GET /v1/usage); this module adds the write side.
 *
 * setTeamPlan() targets the DEV-ONLY POST /v1/plan endpoint, which the server
 * enables only when ALLOW_PLAN_SELF_SERVICE=true. It's the stand-in for Stripe
 * checkout while billing isn't wired yet — in production it returns 403 and
 * this call will throw, which is the intended behaviour.
 */

import { API_BASE, authHeaders } from './config'
import type { PlanId } from '../config/plans'

export async function setTeamPlan(plan: PlanId): Promise<{ plan: PlanId; name: string }> {
  const res = await fetch(`${API_BASE}/v1/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ plan }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Could not change plan (${res.status})`)
  }
  return res.json() as Promise<{ plan: PlanId; name: string }>
}
