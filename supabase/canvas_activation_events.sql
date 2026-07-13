-- supabase/canvas_activation_events.sql
--
-- The canvas-activation funnel (CANVAS_ACTIVATION_ARCHITECTURE.md §5) logs four
-- NEW event types: 'start_layer_shown', 'start_layer_card_clicked',
-- 'draft_restored' and 'data_bound'.
--
-- BUG THIS FIXES. Those four were added to the TypeScript union in TC-0187 with
-- the comment "DB column is text, so these add no schema change". The column is
-- text, but it carries a CHECK constraint — so every one of those inserts has
-- been REJECTED by the database ever since. `analytics.logEvent` swallows errors
-- by design ("analytics must never break the action it is measuring"), so they
-- failed silently into a console.warn: the activation funnel has been recording
-- nothing, and §5 has no data behind it. This is the same trap ai_metering.sql
-- documents for 'ai_build'.
--
-- Widens the constraint in place. Idempotent — safe to run repeatedly.

alter table public.analytics_events
  drop constraint if exists analytics_events_event_type_check;

alter table public.analytics_events
  add constraint analytics_events_event_type_check
  check (event_type in (
    'login',
    'template_created',
    'pdf_exported',
    'ai_build',
    -- Canvas activation funnel
    'start_layer_shown',
    'start_layer_card_clicked',
    'draft_restored',
    'data_bound',
    -- Funnel terminal step (once per user per browser). pdf_exported fires on
    -- every export, so it measures volume, not activation.
    'first_export_completed'
  ));

-- NOTE on the two 'start_layer_*' events: the Start Layer is scheduled for
-- retirement (APP_SHELL_RELAYOUT_ARCHITECTURE.md T5.6/T5.7, superseded by the
-- Dashboard). They are included anyway — without them there is no before/after
-- data to judge that retirement by, which is the whole point of measuring it.
-- Removing them from the constraint later would orphan existing rows, so they
-- should stay whether or not the events keep firing.
