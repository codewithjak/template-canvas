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
  -- per-connection stack outputs (from the connect-account CloudFormation stack)
  state_bucket   text,
  lock_table     text,
  runner_project text,
  created_at  timestamptz not null default now()
);

create index if not exists cloud_connections_team_idx
  on public.cloud_connections(team_id);

-- For DBs created before per-connection outputs were added:
alter table public.cloud_connections add column if not exists state_bucket   text;
alter table public.cloud_connections add column if not exists lock_table     text;
alter table public.cloud_connections add column if not exists runner_project text;

alter table public.cloud_connections enable row level security;
-- No client policies: only the backend (service role) reads/writes these rows.

-- Durable run history (P8): one row per plan/apply run, scoped per team.
create table if not exists public.cloud_runs (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  connection_id uuid references public.cloud_connections(id) on delete set null,
  name          text,
  hcl           text,
  status        text not null default 'running',  -- running|planned|applying|applied|error
  kind          text not null default 'plan',      -- plan|apply|drift (a drift check is a plan interpreted as a health signal)
  simulated     boolean not null default false,
  plan          jsonb,
  outputs       jsonb,
  error         text,
  created_at    timestamptz not null default now()
);

-- Idempotent add for databases created before `kind` existed.
alter table public.cloud_runs add column if not exists kind text not null default 'plan';

create index if not exists cloud_runs_team_idx on public.cloud_runs(team_id, created_at desc);
-- Fast lookup of the latest drift check per connection.
create index if not exists cloud_runs_conn_kind_idx on public.cloud_runs(team_id, connection_id, kind, created_at desc);

alter table public.cloud_runs enable row level security;
-- Server-side only (service role), same as cloud_connections.
