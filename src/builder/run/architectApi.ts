/**
 * architectApi.ts — client for the LLM architect endpoint (P10).
 * The server picks the best reference pattern for an intent; the frontend
 * assembles the actual blueprint. Throws on any failure so callers can fall
 * back to a local keyword match.
 */

import { API_BASE, authHeaders } from '../../services/config';

export interface PatternMeta { id: string; title: string; description: string; }
export interface ArchitectChoice { patternId: string; region: string; name: string; rationale?: string }

export async function architectSelect(
  intent: string,
  patterns: PatternMeta[],
  provider = 'aws',
): Promise<ArchitectChoice> {
  const res = await fetch(`${API_BASE}/v1/cloud/architect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ intent, patterns, provider }),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Architect failed (${res.status}).`);
  }
  return res.json();
}
