-- =============================================================
-- Mapdoc — auth + multi-tenant schema (Supabase / Postgres)
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
--
-- Teams are designed-in but NOT surfaced on the client yet.
-- Every new user automatically gets a personal team with one
-- "owner" membership, so the app can scope templates to a team
-- without showing any team UI. Turning teams on later = build
-- the invites/roles UI; no schema migration needed.
-- =============================================================

-- ---------- Tables --------------------------------------------------

-- App-level user record. Mirrors Supabase's managed auth.users.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

-- The tenant boundary. (Called "team" everywhere; one per user for now.)
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

-- Many-to-many: users <-> teams. Today always exactly 1 row per user.
create table if not exists public.memberships (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  role        text not null default 'member'
                check (role in ('owner','admin','member','viewer')),
  created_at  timestamptz not null default now(),
  primary key (user_id, team_id)
);

-- Pending team invitations (table exists now; feature wired up later).
create table if not exists public.invites (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  email       text not null,
  role        text not null default 'member'
                check (role in ('owner','admin','member','viewer')),
  token       text not null unique,
  invited_by  uuid references public.profiles(id) on delete set null,
  expires_at  timestamptz,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Templates belong to a TEAM (the tenant key), never directly to a user.
create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  name        text not null default 'Untitled',
  -- Which builder surface owns this design; how body_json is interpreted.
  -- 'document' = doc/image editor (default), 'cloud' = cloud builder blueprint.
  environment text not null default 'document',
  body_json   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Idempotent add for databases created before `environment` existed.
alter table public.templates add column if not exists environment text not null default 'document';

create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_team on public.memberships(team_id);
create index if not exists idx_templates_team   on public.templates(team_id);
-- Templates library is listed per surface, most-recently-updated first.
create index if not exists idx_templates_team_env on public.templates(team_id, environment, updated_at desc);
create index if not exists idx_invites_token    on public.invites(token);

-- ---------- Helper: SECURITY DEFINER avoids RLS recursion -----------

-- "Is the current user a member of this team?" Runs with definer rights
-- so it can read memberships without triggering memberships' own RLS.
create or replace function public.is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.team_id = p_team_id
      and m.user_id = auth.uid()
  );
$$;

-- ---------- New-user trigger: profile + personal team + membership --

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_team_id uuid;
  display_name text;
begin
  display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    display_name,
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.teams (name)
  values (display_name || '''s Team')
  returning id into new_team_id;

  insert into public.memberships (user_id, team_id, role)
  values (new.id, new_team_id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row-Level Security --------------------------------------

alter table public.profiles    enable row level security;
alter table public.teams       enable row level security;
alter table public.memberships enable row level security;
alter table public.invites     enable row level security;
alter table public.templates   enable row level security;

-- profiles: a user reads/updates only their own profile.
-- (Inserts happen via the SECURITY DEFINER trigger above.)
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- teams: members can see their teams.
drop policy if exists teams_select_member on public.teams;
create policy teams_select_member on public.teams
  for select using (public.is_team_member(id));

-- memberships: a user sees their own membership rows.
drop policy if exists memberships_select_own on public.memberships;
create policy memberships_select_own on public.memberships
  for select using (user_id = auth.uid());

-- templates: full CRUD, scoped to the user's team(s). This is the
-- isolation guarantee — even a query that "forgets" to filter by team
-- cannot read another team's templates.
drop policy if exists templates_select_team on public.templates;
create policy templates_select_team on public.templates
  for select using (public.is_team_member(team_id));

drop policy if exists templates_insert_team on public.templates;
create policy templates_insert_team on public.templates
  for insert with check (public.is_team_member(team_id));

drop policy if exists templates_update_team on public.templates;
create policy templates_update_team on public.templates
  for update using (public.is_team_member(team_id));

drop policy if exists templates_delete_team on public.templates;
create policy templates_delete_team on public.templates
  for delete using (public.is_team_member(team_id));

-- invites: members of a team can see its invites (kept minimal for now).
drop policy if exists invites_select_team on public.invites;
create policy invites_select_team on public.invites
  for select using (public.is_team_member(team_id));

-- ---------- Analytics events ----------------------------------------
-- Append-only usage log, keyed on the TEAM (the tenant). user_id is an
-- optional "who within the team did it" drill-down, not the grouping key.
-- One row per tracked action: login, template_created, pdf_exported, ai_build.
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  event_type  text not null
                check (event_type in ('login','template_created','pdf_exported','ai_build')),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_analytics_team on public.analytics_events(team_id, created_at);
create index if not exists idx_analytics_type on public.analytics_events(event_type, created_at);

alter table public.analytics_events enable row level security;

-- Insert: only into a team you belong to, and only attributed to yourself.
drop policy if exists analytics_insert_team on public.analytics_events;
create policy analytics_insert_team on public.analytics_events
  for insert with check (
    public.is_team_member(team_id)
    and (user_id is null or user_id = auth.uid())
  );

-- Read: any member can read their team's events (team-level dashboards).
drop policy if exists analytics_select_team on public.analytics_events;
create policy analytics_select_team on public.analytics_events
  for select using (public.is_team_member(team_id));
