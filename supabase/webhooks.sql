-- =============================================================
-- Mapdoc — Outbound webhooks: subscriber endpoints + delivery audit log
--
-- ADDITIVE migration. Run AFTER schema.sql (and api_integration.sql). It
-- creates two new tables + their RLS and does NOT alter or drop anything that
-- already exists. See WEBHOOK_CONNECTOR_ARCHITECTURE.md, Step 3.
--
--   webhook_endpoints   where to notify when something happens for a team.
--                       MANY per team (unlike the 1:1 team_api_keys). Holds a
--                       signing `secret`, so it is browser-denied like keys.
--
--   webhook_deliveries  append-only audit/reliability log: one row per attempt
--                       target, tracking status / attempts / response code.
-- =============================================================

-- ---------- Tables --------------------------------------------------

create table if not exists public.webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  url         text not null,
  secret      text not null,                    -- HMAC signing secret (shared with receiver)
  events      text[] not null default '{}',     -- subscribed event names, e.g. {'document.generated'}
  source      text not null default 'manual',   -- 'manual' | 'connector'
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_webhook_endpoints_team on public.webhook_endpoints(team_id);

create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  endpoint_id     uuid not null references public.webhook_endpoints(id) on delete cascade,
  event           text not null,
  payload         jsonb not null,
  status          text not null default 'pending', -- pending | success | failed | dead
  attempts        int  not null default 0,
  response_code   int,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,           -- when the durable retry worker should re-attempt
  created_at      timestamptz not null default now()
);

create index if not exists idx_webhook_deliveries_endpoint on public.webhook_deliveries(endpoint_id, created_at);

-- The durable-retry worker scans for due, still-retryable deliveries.
create index if not exists idx_webhook_deliveries_due
  on public.webhook_deliveries(next_attempt_at)
  where status in ('pending', 'failed');

-- Additive for existing installs (table created before retries existed).
alter table public.webhook_deliveries add column if not exists next_attempt_at timestamptz;

-- ---------- Row-Level Security --------------------------------------
--
-- DENY-BY-DEFAULT for the browser, exactly like team_api_keys: RLS is enabled
-- with NO anon/authenticated policies, so the client can neither read nor write
-- these tables. The `secret` therefore never reaches the browser. All access is
-- via the backend service-role client (which bypasses RLS), tenant-scoped in
-- code by team_id.

alter table public.webhook_endpoints  enable row level security;
alter table public.webhook_deliveries enable row level security;
