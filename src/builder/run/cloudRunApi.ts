/**
 * cloudRunApi.ts — client for the run endpoints (P6/P7).
 * The backend runs a real terraform plan/apply when a verified connection +
 * AWS creds exist, else returns a simulated plan — so this works either way.
 */

import { API_BASE, authHeaders } from '../../services/config';
import type { Plan } from './planTypes';

export type RunStatus = 'running' | 'planned' | 'applying' | 'applied' | 'error';

export interface RunResponse {
  runId: string;
  status: RunStatus;
  plan?: Plan;
  outputs?: Record<string, unknown>;
  error?: string;
  simulated?: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${res.status}).`);
  }
  return res.json();
}

export const createRun = (hcl: string, connectionId?: string) =>
  call<RunResponse>('/v1/cloud/runs', { method: 'POST', body: JSON.stringify({ hcl, connectionId }) });

export const getRun = (id: string) => call<RunResponse>(`/v1/cloud/runs/${id}`);

export const applyRun = (id: string) =>
  call<RunResponse>(`/v1/cloud/runs/${id}/apply`, { method: 'POST' });
