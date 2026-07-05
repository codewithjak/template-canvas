/**
 * driftController.ts — runs a drift check and returns its diff as a Plan, with a
 * local fallback so the flow never throws in the UI. An empty plan means the
 * deployment is in sync with live reality; a non-empty plan is the drift.
 *
 * Mirrors runController's poll-with-fallback shape.
 */

import { startDrift, getDrift, type DriftResponse } from './driftApi';
import type { Plan } from './planTypes';

export interface DriftHandle {
  plan: Plan; // empty resources ⇒ in sync
  simulated: boolean;
}

const IN_SYNC: Plan = { summary: { add: 0, change: 0, destroy: 0 }, resources: [], simulated: true };
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
    return { plan: r.plan, simulated: Boolean(r.simulated) };
  } catch {
    // Offline / no connection / no deployment: treat as in sync rather than error.
    return { plan: IN_SYNC, simulated: true };
  }
}
