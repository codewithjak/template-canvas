/**
 * src/services/apiIntegration.ts
 *
 * Client for the team API-integration features:
 *   • Key management + usage  → backend /v1/* endpoints (JWT-authenticated).
 *   • Template bindings (the "light save") → Supabase directly, under the
 *     team-scoped RLS defined in supabase/api_integration.sql.
 *
 * Additive: nothing here changes existing services. The key secret is never
 * stored client-side — issueApiKey() returns it once for the user to copy.
 */

import { supabase } from './supabaseClient';
import { getActiveTeamId } from './teamService';
import { API_BASE, authHeaders } from './config';
import type {
  FieldMapping,
  CollectionMappings,
  TableCollectionBindings,
  CanonicalDocument,
} from '../types/dataSource';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiKeyMeta {
  key_prefix:   string;
  created_at:   string;
  last_used_at: string | null;
  revoked_at:   string | null;
}

export interface UsageSummary {
  plan: string;
  templates:        { used: number; limit: number | null };
  exportsThisMonth: { used: number; limit: number | null };
}

export interface TemplateBinding {
  field_mapping:             FieldMapping;
  collection_mappings:       CollectionMappings;
  table_collection_bindings: TableCollectionBindings;
  last_payload:              CanonicalDocument | null;
  last_ingest_at:            string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...(await authHeaders()) } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body:    body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Key management + usage
// ─────────────────────────────────────────────────────────────────────────────

/** Issue or rotate the team's single API key. Returns the raw key ONCE. */
export async function issueApiKey(): Promise<{ apiKey: string; prefix: string }> {
  return postJson('/v1/keys');
}

/** Non-secret metadata for the current key, or null if none issued yet. */
export async function getApiKeyMeta(): Promise<ApiKeyMeta | null> {
  const { key } = await getJson<{ key: ApiKeyMeta | null }>('/v1/keys');
  return key;
}

export async function revokeApiKey(): Promise<void> {
  await postJson('/v1/keys/revoke');
}

export async function getUsage(): Promise<UsageSummary> {
  return getJson('/v1/usage');
}

// ─────────────────────────────────────────────────────────────────────────────
// Template bindings — the "light save" (Supabase, team-scoped RLS)
// ─────────────────────────────────────────────────────────────────────────────

/** Load the saved binding (mapping blob + latest pushed payload) for a template. */
export async function getTemplateBinding(templateId: string): Promise<TemplateBinding | null> {
  const teamId = await getActiveTeamId();
  const { data, error } = await supabase
    .from('template_bindings')
    .select('field_mapping, collection_mappings, table_collection_bindings, last_payload, last_ingest_at')
    .eq('team_id', teamId)
    .eq('template_id', templateId)
    .maybeSingle();
  if (error) throw error;
  return (data as TemplateBinding) ?? null;
}

/**
 * Persist the mapping blob for a template (upsert). Does not touch last_payload,
 * which is written server-side on ingest.
 */
export async function saveTemplateBinding(
  templateId: string,
  mappings: {
    fieldMapping:            FieldMapping;
    collectionMappings:      CollectionMappings;
    tableCollectionBindings: TableCollectionBindings;
  },
): Promise<void> {
  const teamId = await getActiveTeamId();
  const { error } = await supabase.from('template_bindings').upsert(
    {
      team_id:                   teamId,
      template_id:               templateId,
      field_mapping:             mappings.fieldMapping,
      collection_mappings:       mappings.collectionMappings,
      table_collection_bindings: mappings.tableCollectionBindings,
      updated_at:                new Date().toISOString(),
    },
    { onConflict: 'team_id,template_id' },
  );
  if (error) throw error;
}
