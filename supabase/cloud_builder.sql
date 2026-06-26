-- cloud_builder.sql — P5: in-account connections for the Visual Cloud Builder.
--
-- One row per AWS account a team connects. We store only the Connect-Role ARN +
-- the ExternalId we generated (never the customer's keys). Access is server-side
-- only via the service-role key (RLS on, no client policies) — matching the
-- webhooks / api_integration tables.

create table if not exists public.cloud_connections (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  provider    text not null default 'aws',
  region      text not null default 'us-east-1',
  external_id text not null,
  role_arn    text,
  account_id  text,
  status      text not null default 'pending',   -- pending | linked | verified | error
  created_at  timestamptz not null default now()
);

create index if not exists cloud_connections_team_idx
  on public.cloud_connections(team_id);

alter table public.cloud_connections enable row level security;
-- No client policies: only the backend (service role) reads/writes these rows.
