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
  /** Present on responses from servers running the entitlements build. */
  capabilities?: Record<string, boolean>;
  templates:         { used: number; limit: number | null };
  exportsThisMonth:  { used: number; limit: number | null };
  /** Present on servers running the metered-AI build. */
  aiBuildsThisMonth?: { used: number; limit: number | null };
}

export interface TeamMember {
  user_id:    string;
  role:       string;
  created_at: string;
  name:       string | null;
  email:      string | null;
}

export interface TeamInvite {
  id:         string;
  email:      string;
  role:       string;
  created_at?: string;
  expires_at: string | null;
  /** Present on the create response so the UI can build a shareable link. */
  token?:     string;
}

export interface TeamSummary {
  team:    { id: string; name: string; plan: string } | null;
  members: TeamMember[];
  invites: TeamInvite[];
  seats:   { used: number; pending: number; limit: number | null };
  /** The requesting user's role + id, for gating management controls. */
  role:          string;
  currentUserId: string;
}

export interface InviteInfo {
  email:    string;
  role:     string;
  teamName: string;
  accepted: boolean;
  expired:  boolean;
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
// Team management (JWT-authenticated; owner/admin for mutations)
// ─────────────────────────────────────────────────────────────────────────────

/** Active team + members + pending invites + seat usage. */
export async function getTeam(): Promise<TeamSummary> {
  return getJson('/v1/team');
}

/** Invite someone by email. Returns the invite incl. its token for the link. */
export async function inviteMember(email: string, role: string): Promise<{ invite: TeamInvite }> {
  return postJson('/v1/team/invites', { email, role });
}

export async function revokeTeamInvite(inviteId: string): Promise<void> {
  await postJson('/v1/team/invites/revoke', { inviteId });
}

export async function removeTeamMember(userId: string): Promise<void> {
  await postJson('/v1/team/members/remove', { userId });
}

/** Public invite details for the acceptance screen (no auth required). */
export async function lookupInvite(token: string): Promise<InviteInfo> {
  return getJson(`/v1/invites/${encodeURIComponent(token)}`);
}

/** Accept an invite as the signed-in user; joins the team + makes it active. */
export async function acceptInvite(token: string): Promise<{ ok: boolean; teamId: string }> {
  return postJson('/v1/invites/accept', { token });
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
