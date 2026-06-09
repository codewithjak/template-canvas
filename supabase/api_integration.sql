-- =============================================================
-- Mapdoc — API integration: per-team API keys + template data bindings
--
-- ADDITIVE migration. Run AFTER schema.sql. It creates two new tables and
-- their RLS policies and does NOT alter or drop anything that already exists.
--
--   team_api_keys      one inbound API key per team (1:1). Secret stored as a
--                      hash only; all key operations go through the backend
--                      service-role client, never the browser.
--
--   template_bindings  the "light save": the persisted mapping blob
--                      (field_mapping / collection_mappings /
--                      table_collection_bindings) plus the latest pushed
--                      payload, keyed by (team, template). Mappings are not
--                      secret, so the app reads/writes these directly under
--                      team-scoped RLS, exactly like templates.
-- =============================================================

-- ---------- Tables --------------------------------------------------

-- One API key per team. team_id is the PK → enforces the 1:1 rule.
create table if not exists public.team_api_keys (
  team_id      uuid primary key references public.teams(id) on delete cascade,
  key_hash     text not null,            -- sha-256 of the raw key; never the key itself
  key_prefix   text not null,            -- e.g. "tc_live_ab12cd" for display
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index if not exists idx_team_api_keys_hash on public.team_api_keys(key_hash);

-- Light save: mapping blob + latest pushed payload, one row per (team, template).
create table if not exists public.template_bindings (
  team_id                   uuid not null references public.teams(id)     on delete cascade,
  template_id               uuid not null references public.templates(id) on delete cascade,
  field_mapping             jsonb not null default '{}'::jsonb,
  collection_mappings       jsonb not null default '{}'::jsonb,
  table_collection_bindings jsonb not null default '{}'::jsonb,
  last_payload              jsonb,        -- latest normalised CanonicalDocument from /v1/ingest
  last_ingest_at            timestamptz,
  updated_at                timestamptz not null default now(),
  primary key (team_id, template_id)
);

create index if not exists idx_template_bindings_team on public.template_bindings(team_id);

-- ---------- Row-Level Security --------------------------------------

alter table public.team_api_keys    enable row level security;
alter table public.template_bindings enable row level security;

-- team_api_keys: DENY-BY-DEFAULT for the browser. RLS is enabled with NO
-- policies for anon/authenticated, so the anon/user clients can neither read
-- nor write it. The backend uses the service-role key, which bypasses RLS.
-- This guarantees key_hash is never exposed to the client.

-- template_bindings: mappings are not secret. Mirror templates' team-scoped
-- CRUD so the app can persist/load bindings directly via the supabase client.
-- The backend (service role) also writes last_payload on ingest.
drop policy if exists template_bindings_select_team on public.template_bindings;
create policy template_bindings_select_team on public.template_bindings
  for select using (public.is_team_member(team_id));

drop policy if exists template_bindings_insert_team on public.template_bindings;
create policy template_bindings_insert_team on public.template_bindings
  for insert with check (public.is_team_member(team_id));

drop policy if exists template_bindings_update_team on public.template_bindings;
create policy template_bindings_update_team on public.template_bindings
  for update using (public.is_team_member(team_id));

drop policy if exists template_bindings_delete_team on public.template_bindings;
create policy template_bindings_delete_team on public.template_bindings
  for delete using (public.is_team_member(team_id));
