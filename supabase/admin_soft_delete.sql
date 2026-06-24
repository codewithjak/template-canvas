-- =============================================================
-- Admin panel — member soft-delete
--
-- ADDITIVE migration. Adds a soft-delete flag to profiles so the admin panel
-- can "delete" a member while retaining the record (deleted = true). Harmless
-- if the admin feature is later removed — the columns just sit unused.
-- =============================================================

alter table public.profiles add column if not exists deleted    boolean not null default false;
alter table public.profiles add column if not exists deleted_at  timestamptz;

-- Small partial index for filtering deleted accounts.
create index if not exists idx_profiles_deleted on public.profiles(deleted) where deleted = true;
