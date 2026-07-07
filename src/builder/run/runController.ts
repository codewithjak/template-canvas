/**
 * runController.ts — drives a plan/apply run against the backend, with a local
 * fallback so the flow works signed-out / offline.
 *
 * startRun(hcl) → { plan, apply() }:
 *   - tries POST /v1/cloud/runs (backend may itself simulate or run for real)
 *   - on any failure, falls back to a fully-local simulated plan + apply
 * The returned apply() hides whether it talks to the backend or simulates.
 */

import { createRun, getRun, applyRun, type RunResponse } from './cloudRunApi';
import { simulatePlanFromHcl } from './simulatePlan';
import { simulateApply, type AppliedResult } from './simulateApply';
import type { Plan } from './planTypes';

export interface RunHandle {
  plan: Plan;
  apply: () => Promise<AppliedResult>;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function poll(runId: string, until: RunResponse['status'][], tries = 90): Promise<RunResponse> {
  for (let i = 0; i < tries; i += 1) {
    const r = await getRun(runId);
    if (until.includes(r.status)) return r;
    await wait(2000);
  }
  throw new Error('Run timed out.');
}

export async function startRun(hcl: string, connectionId?: string, templateId?: string): Promise<RunHandle> {
  try {
    let r = await createRun(hcl, connectionId, templateId);
    if (r.status === 'running') r = await poll(r.runId, ['planned', 'error']);
    if (r.status !== 'planned' || !r.plan) throw new Error(r.error || 'Plan failed.');
    const { runId, plan } = r;
    return { plan, apply: () => applyViaBackend(runId, plan) };
  } catch {
    const plan = simulatePlanFromHcl(hcl);
    return { plan, apply: () => Promise.resolve(simulateApply(plan)) };
  }
}

async function applyViaBackend(runId: string, plan: Plan): Promise<AppliedResult> {
  let r = await applyRun(runId);
  if (r.status === 'applying') r = await poll(runId, ['applied', 'error']);
  if (r.status === 'error') throw new Error(r.error || 'Apply failed.');
  return {
    created: plan.resources.map((x) => x.address),
    outputs: normalizeOutputs(r.outputs),
    simulated: Boolean(r.simulated),
  };
}

/** terraform `output -json` is { name: { value, … } }; flatten to strings. */
function normalizeOutputs(outputs?: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(outputs ?? {})) {
    out[k] = v && typeof v === 'object' && 'value' in v ? String((v as { value: unknown }).value) : String(v);
  }
  return out;
}
