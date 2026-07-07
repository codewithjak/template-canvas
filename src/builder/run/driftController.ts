/**
 * driftController.ts — runs a drift check and returns its diff as a Plan, with a
 * local fallback so the flow never throws in the UI. On a successful check an
 * empty plan means the deployment is in sync with live reality and a non-empty
 * plan is the drift; when the check could not run (offline, backend error,
 * timeout) the handle is `unavailable` — NOT "in sync", so a failed health check
 * never masquerades as healthy (CLOUD_DRIFT_ARCHITECTURE.md §5).
 *
 * Mirrors runController's poll-with-fallback shape.
 */

import { startDrift, getDrift, type DriftResponse } from './driftApi';
import type { Plan } from './planTypes';

export interface DriftHandle {
  status: 'checked' | 'unavailable'; // 'checked' ⇒ plan is authoritative; 'unavailable' ⇒ could not determine
  plan: Plan; // when checked: empty resources ⇒ in sync, non-empty ⇒ drift. when unavailable: empty placeholder
  simulated: boolean;
}

const EMPTY: Plan = { summary: { add: 0, change: 0, destroy: 0 }, resources: [], simulated: true };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poll(connectionId: string, tries = 90): Promise<DriftResponse> {
  for (let i = 0; i < tries; i += 1) {
    const r = await getDrift(connectionId);
    if (r.status === 'planned' || r.status === 'error') return r;
    await wait(2000);
  }
  throw new Error('Drift check timed out.');
}

export async function checkDrift(connectionId: string): Promise<DriftHandle> {
  try {
    let r = await startDrift(connectionId);
    if (r.status === 'running') r = await poll(connectionId);
    if (r.status !== 'planned' || !r.plan) throw new Error(r.error || 'Drift check failed.');
    return { status: 'checked', plan: r.plan, simulated: Boolean(r.simulated) };
  } catch {
    // Offline / no connection / backend error / timeout: report "unavailable"
    // rather than a false "in sync" — we did not observe live state.
    return { status: 'unavailable', plan: EMPTY, simulated: true };
  }
}
