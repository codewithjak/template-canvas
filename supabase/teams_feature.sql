-- =============================================================
-- Mapdoc — Teams feature: members, invites, seats, active team
--
-- ADDITIVE migration. Run AFTER schema.sql (and api_integration.sql). It only
-- adds one column + one index; it does NOT alter or drop anything existing.
--
-- The teams / memberships / invites tables already exist (schema.sql). This
-- migration enables a user to belong to MORE THAN ONE team (by accepting an
-- invite), so we record which team they are currently acting as.
--
--   profiles.active_team_id   the team the user is currently scoped to. When
--                             null/stale the backend falls back to a
--                             deterministic membership and back-fills it.
--
-- RLS: no new policies are required.
--   • profiles_update_own (schema.sql) already lets a user set their own
--     active_team_id, so the client can switch teams directly.
--   • All member/invite MANAGEMENT goes through the backend service-role client
--     (mirrors team_api_keys), because memberships RLS only exposes a user's
--     own row and role checks must happen server-side.
-- =============================================================

alter table public.profiles
  add column if not exists active_team_id uuid
    references public.teams(id) on delete set null;

create index if not exists idx_invites_team on public.invites(team_id);
