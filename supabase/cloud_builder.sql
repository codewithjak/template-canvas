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
  deploy_project text,  -- Docker-capable build project (workload deploy, Path 2)
  deploy_role_arn text, -- role for CLI "deploy from here" scoped credentials (Path 1)
  created_at  timestamptz not null default now()
);

create index if not exists cloud_connections_team_idx
  on public.cloud_connections(team_id);

-- For DBs created before per-connection outputs were added:
alter table public.cloud_connections add column if not exists state_bucket   text;
alter table public.cloud_connections add column if not exists lock_table     text;
alter table public.cloud_connections add column if not exists runner_project text;
alter table public.cloud_connections add column if not exists deploy_project text;
alter table public.cloud_connections add column if not exists deploy_role_arn text;

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

-- Durable run handle (CLOUD_RUN_RECONCILIATION_ARCHITECTURE.md Phase 1): the
-- CodeBuild build id + where to query it + the S3 key of the uploaded result, so a
-- run can be resolved from the build's REAL terminal state by the inline poll OR a
-- restart-surviving sweep, instead of an in-memory timer. build_started_at is the
-- grace anchor for BOTH sweeps — set at the build-phase transition (before
-- StartBuild), so it is present even for a null-handle orphan and is never the row's
-- older creation time (a deploy/apply row is created well before its build attempt).
-- All nullable; only set for real (non-simulated) runs.
alter table public.cloud_runs add column if not exists build_id         text;
alter table public.cloud_runs add column if not exists build_region     text;
alter table public.cloud_runs add column if not exists result_key       text;
alter table public.cloud_runs add column if not exists build_started_at timestamptz;

-- The Phase 2 reconciler sweeps non-terminal runs by build-start time.
create index if not exists cloud_runs_reconcile_idx
  on public.cloud_runs(status, build_started_at)
  where status in ('running', 'applying', 'staging');

create index if not exists cloud_runs_team_idx on public.cloud_runs(team_id, created_at desc);
-- Fast lookup of the latest drift check per connection.
create index if not exists cloud_runs_conn_kind_idx on public.cloud_runs(team_id, connection_id, kind, created_at desc);

alter table public.cloud_runs enable row level security;
-- Server-side only (service role), same as cloud_connections.

-- Deployments: one live infrastructure instance = a template applied to a
-- connection. This is the per-account registry that lets a single account hold
-- MANY infras without them colliding (see CLOUD_BUILDER_DEPLOYMENTS_ARCHITECTURE.md).
-- Each deployment owns one Terraform state key, so state stays isolated per infra.
create table if not exists public.cloud_deployments (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  connection_id uuid not null references public.cloud_connections(id) on delete cascade,
  template_id   uuid references public.templates(id) on delete set null,  -- null = legacy/default deployment
  name          text not null default 'Untitled',
  status        text not null default 'active',   -- active | destroyed
  -- Optional pin to a specific S3 state key. Null => derive
  -- state/{connection_id}/{deployment_id}.tfstate. Set for migrated legacy
  -- deployments so their existing state/{connection_id}.tfstate is not orphaned.
  state_key     text,
  last_run_id   uuid references public.cloud_runs(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cloud_deployments_conn_idx
  on public.cloud_deployments(team_id, connection_id);
-- One default (template-less) deployment per connection; and one per template.
create unique index if not exists cloud_deployments_conn_default_idx
  on public.cloud_deployments(connection_id) where template_id is null;
create unique index if not exists cloud_deployments_conn_template_idx
  on public.cloud_deployments(connection_id, template_id) where template_id is not null;

alter table public.cloud_deployments enable row level security;
-- Server-side only (service role), same as cloud_connections / cloud_runs.

-- A run now belongs to a deployment (its state + drift are keyed by it).
alter table public.cloud_runs add column if not exists deployment_id uuid
  references public.cloud_deployments(id) on delete set null;
create index if not exists cloud_runs_deploy_kind_idx
  on public.cloud_runs(team_id, deployment_id, kind, created_at desc);

-- Backfill: give every connection that already has runs a default deployment,
-- pinned to its legacy state key so existing state is preserved, and attach its
-- orphaned runs. Idempotent (the unique index makes re-inserts no-ops) and safe
-- on an empty DB. Nothing loses its state.
do $$
declare c record;
declare dep_id uuid;
begin
  for c in
    select distinct connection_id, team_id from public.cloud_runs
    where connection_id is not null and deployment_id is null
  loop
    insert into public.cloud_deployments (team_id, connection_id, template_id, name, state_key)
    values (c.team_id, c.connection_id, null, 'Default', 'state/' || c.connection_id || '.tfstate')
    on conflict (connection_id) where (template_id is null) do nothing;

    select id into dep_id from public.cloud_deployments
    where connection_id = c.connection_id and template_id is null;

    update public.cloud_runs
    set deployment_id = dep_id
    where connection_id = c.connection_id and deployment_id is null;
  end loop;
end $$;
