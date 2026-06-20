-- supabase/ai_metering.sql
--
-- Metered AI PDF→template rebuilds. The rebuild count is derived from
-- analytics_events rows of a NEW event_type, 'ai_build' (one row per rebuild),
-- the same way monthly exports are derived from 'pdf_exported' rows.
--
-- schema.sql creates analytics_events with `create table if not exists`, so an
-- already-deployed database keeps its old CHECK constraint (which rejects
-- 'ai_build' and would silently drop every build event → quota never counts).
-- This migration widens the constraint in place. Safe to run repeatedly.

alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check;

alter table public.analytics_events
  add constraint analytics_events_event_type_check
  check (event_type in ('login','template_created','pdf_exported','ai_build'));
