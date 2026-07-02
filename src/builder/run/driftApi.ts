/**
 * driftApi.ts — client for the drift endpoints (CLOUD_DRIFT_ARCHITECTURE.md).
 * A drift check re-plans a connection's deployment against live state; an empty
 * diff means "in sync", a non-empty diff is the drift. The backend runs it for
 * real when a verified connection + AWS creds exist, else simulates "in sync".
 */

import { API_BASE, authHeaders } from '../../services/config';
import type { Plan } from './planTypes';
import type { RunStatus } from './cloudRunApi';

export type DriftStatus = RunStatus | 'none';

export interface DriftResponse {
  runId?: string;
  connectionId: string;
  status: DriftStatus;
  plan?: Plan; // the drift diff — empty resources = in sync
  error?: string;
  simulated?: boolean;
  checkedAt?: string;
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

export const startDrift = (connectionId: string) =>
  call<DriftResponse>('/v1/cloud/drift', { method: 'POST', body: JSON.stringify({ connectionId }) });

export const getDrift = (connectionId: string) =>
  call<DriftResponse>(`/v1/cloud/drift/${connectionId}`);
