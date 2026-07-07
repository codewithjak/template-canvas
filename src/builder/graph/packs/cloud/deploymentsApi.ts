/**
 * deploymentsApi.ts — client for the deployment registry + lifecycle
 * (CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md, Phase 3): list the live infras in a
 * connected account, rename them, and destroy them.
 */

import { API_BASE, authHeaders } from '../../../../services/config';

export interface Deployment {
  id: string;
  connection_id: string;
  template_id: string | null;
  name: string;
  status: 'active' | 'destroyed';
  last_run_id: string | null;
  created_at: string;
  updated_at: string;
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

export const listDeployments = (connectionId: string) =>
  call<{ deployments: Deployment[] }>(`/v1/cloud/deployments?connectionId=${encodeURIComponent(connectionId)}`);

export const renameDeployment = (id: string, name: string) =>
  call<{ deployment: Deployment }>(`/v1/cloud/deployments/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });

export const destroyDeployment = (id: string) =>
  call<{ deployment?: Deployment; deploymentId?: string; status?: string; simulated?: boolean }>(
    `/v1/cloud/deployments/${id}/destroy`, { method: 'POST' },
  );
