/**
 * deployApi.ts — client for the latest workload deploy status, shown on the canvas
 * next to drift (CLOUD_LOCAL_AGENT_ARCHITECTURE.md Phase 4). Read-only.
 */

import { API_BASE, authHeaders } from '../../services/config';
import type { RunStatus } from './cloudRunApi';

export type DeployStatus = RunStatus | 'staging' | 'none';

export interface DeployResponse {
  deployRunId?: string;
  connectionId: string;
  deploymentId?: string;
  status: DeployStatus;
  result?: Record<string, unknown> | null;
  error?: string;
  simulated?: boolean;
  deployedAt?: string;
}

async function call<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...(await authHeaders()) } });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${res.status}).`);
  }
  return res.json();
}

export const getDeployStatus = (connectionId: string, templateId?: string) =>
  call<DeployResponse>(`/v1/cloud/deploy/status/${connectionId}${templateId ? `?templateId=${encodeURIComponent(templateId)}` : ''}`);
