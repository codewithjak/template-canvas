/**
 * cloudConnectApi.ts — client for the connect-account endpoints (P5).
 * Uses the shared API base + auth header (services/config.ts).
 */

import { API_BASE, authHeaders } from '../../services/config';

export interface CloudConnection {
  id: string;
  provider: string;
  region: string;
  status: 'pending' | 'linked' | 'verified' | 'error';
  role_arn?: string | null;
  account_id?: string | null;
  state_bucket?: string | null;
  lock_table?: string | null;
  runner_project?: string | null;
  created_at?: string;
}

export interface ConnectionDetails {
  roleArn: string;
  stateBucket?: string;
  lockTable?: string;
  runnerProject?: string;
  deployRoleArn?: string; // optional — enables CLI "deploy from here" (Path 1)
  deployProject?: string;
}

export interface Bootstrap {
  platformAccountId: string | null;
  externalId: string;
  region: string;
  parameters: Record<string, string | null>;
  launchStackUrl?: string | null;
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
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const listConnections = () =>
  call<{ connections: CloudConnection[] }>('/v1/cloud/connections').then((r) => r.connections);

export const beginConnection = (region: string) =>
  call<{ connection: CloudConnection; bootstrap: Bootstrap }>('/v1/cloud/connections', {
    method: 'POST',
    body: JSON.stringify({ region }),
  });

export const saveConnection = (id: string, details: ConnectionDetails) =>
  call<{ connection: CloudConnection }>(`/v1/cloud/connections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(details),
  }).then((r) => r.connection);

export const verifyConnection = (id: string) =>
  call<{ connection: CloudConnection; accountId: string }>(`/v1/cloud/connections/${id}/verify`, {
    method: 'POST',
  });

export const deleteConnection = (id: string) =>
  call<void>(`/v1/cloud/connections/${id}`, { method: 'DELETE' });
