# Canvas First-Run Activation Architecture

Status: Phase 0 in progress (T0.1 done, verified on prod 2026-07-11; T0.2
removed by decision 2026-07-11, code reverted; T0.3-T0.4 implemented
2026-07-11, six review rounds applied through 2026-07-13 (incl. committed
zero-dependency tests, `npm test`), pending manual browser verification of the
React-hook wiring — see exit-check notes in Phase 0)
Owner: TC-0185 (proposed)
Related docs: MULTILINGUAL_EXPORT_ARCHITECTURE.md, AI_PDF_REBUILD_ARCHITECTURE.md, BULK_EXPORT_ARCHITECTURE.md

## 1. Problem statement

Users launch the app, land on `/canvas`, and never interact with anything. The canvas
presents an empty A4 page with a passive hint and pushes every entry point to the
edges of the screen as unlabeled icons. The product's core promise (data in, finished
document out) is invisible at first run. This doc defines a first-run "Start Layer"
plus the trust fixes that must land first, because a user who loses work or hits a
broken modal will not return regardless of onboarding.

## 2. Current code behavior (verified on prod app.map-doc.com and in code)

This section records the exact behavior the new architecture builds on. Nothing here
is assumption; every item was reproduced in the browser or located in code.

### 2.1 First-run surface
- `/canvas` renders `TemplateCanvas` with a single empty A4 page.
- The only empty-state affordance is a static hint block at
  `src/components/TemplateCanvas/TemplateCanvas.tsx:1121-1128`
  ("This page is empty / Pick a tool from the rail on the right").
- There is no onboarding state anywhere in `src/` (no first-run flag, no tour,
  no welcome modal). Verified by repo-wide search for onboarding/firstRun/welcome/tour.

### 2.2 Entry points to the core value flows
- Template gallery, My projects, Load template, "Rebuild with Mapdoc AI", and
  "Upload data file" are icon-only buttons in the top toolbar
  (`src/components/TemplateCanvas/Toolbar.tsx`). Two toolbar buttons expose no
  accessible label at all.
- The template gallery modal lists built-in templates as text-only cards (name,
  description, category, page-size badge). No thumbnails, no search, no filters.
- Built-in templates live in `src/templates/builtins/*.template.json` with a
  registry at `src/templates/registry.ts`. They carry tokenized layout plus sample
  data and load through the upload path (see builtin-templates conventions:
  bound tables must keep their sample data or exports come out empty).

### 2.3 Element insertion
- All element factories share `START_POSITION = { x: 50, y: 50 }`
  (`src/components/TemplateCanvas/elementFactories.ts:31`). Consecutive insertions
  stack on the same spot and hide each other.

### 2.4 Trust defects observed in prod
- RESOLVED 2026-07-11 (T0.1): "My projects" modal failed with "Failed to load
  templates." The request
  `GET /rest/v1/templates?select=id,name,updated_at&environment=eq.document`
  returns HTTP 400. The filter comes from `src/services/templatesRepo.ts:44`
  (`.eq('environment', environment)`). The schema fix already exists in the repo:
  `supabase/schema.sql:71` carries the idempotent
  `alter table public.templates add column if not exists environment text not null default 'document'`
  and the covering index `idx_templates_team_env` at `schema.sql:77`. This repo has
  no `supabase/migrations/` directory; schema is managed as idempotent SQL files
  applied directly. Conclusion: this is schema drift (prod has not had the current
  `schema.sql` applied), an ops task rather than new code. The error state having
  no retry action is the only code defect here (still open, tracked as T0.2).
  Fix applied to prod and re-verified in the browser on 2026-07-11: the same
  request now returns 200 and the modal lists existing projects.
- Unsaved canvas work is lost silently. There is no `beforeunload` handler anywhere
  in `src/` and no draft persistence. Reproduced: added elements, navigated away,
  returned to an empty canvas.

## 3. Why users stall (root causes the architecture must answer)

1. Blank canvas problem: the page itself offers no first action; all affordances
   are peripheral and unlabeled.
2. Tools are nouns (Text, Table, Radio); users arrive with outcomes (an invoice
   filled from Excel). No surface translates outcome to tool.
3. First click does not reward: elements drop at a fixed corner with `{{col_a}}`
   jargon; no visible value before effort.
4. The aha path (template or PDF in, data bound, PDF out) requires discovering
   three hidden icons in the right order; nothing sequences it.

## 4. New architecture: the Start Layer

A presentational layer rendered inside the empty canvas page area, replacing the
current two-line hint when and only when the document is pristine. It offers four
outcome cards that reuse existing flows unchanged, plus one conditional card:

0. "Continue where you left off" (conditional, first position): shown only when
   `restoreDraft()` returns a draft. Restores it in one click. This is the ONLY
   restore surface; there is no separate toast, so the Start Layer and draft
   restore can never compete for a pristine mount.
1. "Start from a template" opens the existing template gallery (Phase 2 adds
   thumbnails to that gallery). Once thumbnails exist, this card also carries a
   highlighted "Try the sample invoice" row (see Phase 3); the sample is part of
   this card, not a fifth card.
2. "Rebuild a PDF with AI" opens the existing AI rebuild modal.
3. "Start from your data" opens the existing bind-data (intent capture) flow.
   Post-condition (required, answers root cause #3): the flow must not end on an
   empty canvas. When intent capture completes, the canvas is seeded with a
   starter layout derived from the detected structure: a bound layout table whose
   columns match the detected fields, plus a title text element. This reuses the
   existing intent/data engine output and the existing element factories; no new
   inference. Template suggestions ranked by detected structure are a future
   enhancement (see caveats), not part of this doc.
4. "Start blank" dismisses the layer and leaves the canvas as today.

Design constraints:
- The Start Layer is additive UI only. It calls the same handlers the toolbar
  buttons call. No duplicated business logic, no new data paths (single
  responsibility; the layer decides only visibility and delegates actions).
- It renders only when `pages.length === 1 && pages[0].elements.length === 0`
  and the user has not dismissed it in this document session. It never blocks
  the rail or toolbar: power users can ignore it and it disappears on first
  insertion.
- No new dependencies. Plain React + existing CSS token system from the editor
  UI revamp.

Accessibility contract (holds from Phase 1, not deferred to Phase 4):
- Every card is a real `<button>` with a descriptive accessible name; the layer
  is a plain region in the document flow (not a dialog, it traps nothing).
- Tab order follows visual order (continue-draft first when present, then
  template, AI, data, blank). Focus is never stolen on mount.
- Focus visibility uses the editor's existing token-based focus ring.
- When the layer unmounts (dismissed or first element inserted), it is fully
  removed from the DOM, so nothing stale remains for assistive tech.

## 5. Measurement (how this workstream is judged)

The success metric is the cold-start activation rate: share of sessions that
start on a pristine canvas and end with a completed export. Everything in this
doc exists to move that number; exit checks below are functional gates, this
funnel is the outcome gate.

Instrumentation reuses `src/services/analytics.ts` (`logEvent`, fire-and-forget,
team-scoped). The `AnalyticsEventType` union (currently
`'login' | 'template_created' | 'pdf_exported'`) is extended with:

- `'start_layer_shown'` (once per document session)
- `'start_layer_card_clicked'` with `metadata: { card: 'continue_draft' | 'template' | 'ai_rebuild' | 'bind_data' | 'blank' | 'sample' }`
- `'draft_restored'`
- `'data_bound'` (logged when intent capture completes and the starter layout is
  seeded, T1.7; gives the bind leg its own mid-funnel step instead of measuring
  click-to-export blind)
- `'first_export_completed'` (once per browser, alongside the existing
  `'pdf_exported'`, which stays untouched)

Funnel to read: `start_layer_shown` -> `start_layer_card_clicked` ->
(`template_created` or `draft_restored` or `data_bound`) -> `pdf_exported`.
The events table is append-only; no schema change beyond the enum union in
TypeScript (the DB column is text).

## 6. Future caveats

- Thumbnails (Phase 2) depend on the shipped image export engine. Generating them
  at build time keeps runtime cost zero, but the generation script must load
  builtin templates through the same upload path the app uses, otherwise bound
  tables render empty (known builtin-template constraint).
- The Start Layer must not fire for documents opened from a project or template:
  visibility is derived from document pristineness, not from route entry, so
  loading a template (which inserts elements) hides it naturally.
- Draft autosave (Phase 0) writes to localStorage. Multi-tab editing of the same
  draft can race; scope Phase 0 to last-write-wins and document it. Server-side
  drafts are out of scope.
- localStorage quota: canvas documents carry images as base64 data URIs, so a
  draft can exceed the ~5 MB budget. `saveDraft` must never throw; oversized
  documents skip the draft and delete any stale one (full decision recorded in
  T0.4). If image-heavy drafts turn out to matter in practice, the future path
  is IndexedDB or server drafts, both out of scope here.
- The `environment` column fix is an ops action (apply the existing idempotent
  alter from `schema.sql` to prod). RLS policies on `templates` must be
  re-checked after the column lands, and existing rows rely on the column
  default (`'document'`) so the 400 does not silently become an empty list.
  Watch for further drift: if prod missed this alter, it may have missed others
  in `schema.sql`; the apply step should run the whole idempotent file.
- "Start from your data" seeding inserts a bound table sized by detected columns;
  very wide datasets (more columns than fit an A4 width) need a defined cap
  (first N columns) rather than an overflowing layout. Template suggestions
  ranked by structure remain future work.
- AI rebuild is metered per plan (Free 3/month, Pro 100, Business unlimited,
  enforced at `/pdf-structure`). The Start Layer card must not imply unlimited
  use; quota display on the card is deferred to the AI gating workstream.
- Localization: builtin templates include Arabic/RTL; card copy must not assume
  LTR-only content in previews.

## 7. Phases

### Phase 0: Trust fixes (prerequisite, ships alone)

Goal: nothing in this doc matters if the app loses work or 400s. Small, isolated
fixes to existing code (fix in place, no wrapper layers).

- T0.1 DONE (2026-07-11). Ops: applied the existing idempotent
  `supabase/schema.sql` to prod (the `environment` alter at line 71 and index at
  line 77 handled it; no new SQL authored, no client code changed). Verified in
  prod: `GET /rest/v1/templates?...&environment=eq.document` returns 200 and the
  My projects modal lists existing projects with working actions.
- T0.2 REMOVED (2026-07-11, decision): the retry UI was scoped when the list
  fetch was failing with a 400. T0.1 fixed that root cause, so a retry button
  would be speculative error handling for failures nobody has observed. An
  implementation was built, reviewed, and reverted the same day. If a real,
  recurring load failure shows up in prod, reopen this as its own task with
  the observed failure as the premise.
- T0.3 Unsaved-changes guard: `useUnsavedChangesGuard(isDirty, onFlush?)` hook
  that, while dirty, registers a `beforeunload` handler which flushes the
  pending draft (so a tab close captures work the debounce hasn't written) and
  then prompts. Dirty derives from a savepoint, not from `canUndo`.
  AMENDED after review (2026-07-11): `canUndo` is the wrong derivation — it
  means "any history since mount" and stays true after saves and loads.
  `useHistoryState` gained a savepoint: `markSaved(value?)` (pass the EXACT
  persisted snapshot, not "current", so edits that race in during an async
  save keep `isDirty` true), `getLatest()` (read the live value from an async
  callback), `reset(value)` for loads, and a derived `isDirty` by reference
  identity. Because the hook only tracks `pages`, the canvas folds page size
  and global fields into a document-level `isDirty` against a `savepoint`
  state committed on every save and load. `applyDocument` loads via `reset()`
  so an opened document is pristine (this intentionally does NOT preserve
  undo-into-the-previous-document — opening a doc is a fresh baseline, not an
  edit).
- T0.4 Draft persistence: `saveDraft(doc, userId): void`,
  `restoreDraft(userId): { doc; savedAt } | null`, and `clearDraft(userId): void`
  in `src/services/draftStore.ts` (typed against `TemplateDocument` from
  `src/types/canvas.ts:320`; no `any`). The key is user-scoped
  (`…draft.v1:<userId>`) to prevent cross-account restore on a shared machine.
  The payload wraps the document with a `savedAt` ISO timestamp (source of the
  card's `draft.savedAt`, T1.1). Phase 0 ships the save side and the functions
  only; restore UI is Phase 1 (T1.6). No toast, so nothing collides with the
  Start Layer.
  Draft lifecycle (the review's core lesson: a single `isDirty` transition
  cannot own clearing, because "clean via save" and "clean via loading another
  doc" want opposite outcomes). Clearing is therefore EVENT-driven:
  - Autosave effect: while dirty, write `buildCurrentDocument()` on a debounce
    WITH a max-wait — `DRAFT_DEBOUNCE_MS` (2s) after editing pauses, but at
    most `DRAFT_MAX_WAIT_MS` (10s) after the first unsaved edit even if editing
    never pauses. A plain debounce re-arms on every edit (its dep
    `buildCurrentDocument` tracks `pages`), so uninterrupted editing would
    never write and a crash mid-burst would lose the whole burst — the exact
    loss the draft exists to prevent. The max-wait bounds that loss (and, for
    image-heavy docs, write frequency) to the window. WRITE-ONLY — it never
    clears.
  - Clean cloud save: `markDocumentSaved(clickTimeSnapshot…)` moves the
    savepoint, then the draft is cleared ONLY if `getLatest()` shows no pages
    raced in; if edits raced, `isDirty` stays true and the draft is kept.
  - Undo/redo back ONTO the savepoint (`handleUndo`/`handleRedo` →
    `clearDraftIfClean()`): the document is now identical to what was last
    saved or loaded, so a draft still holding the un-done changes is dropped —
    restore must never offer back what the user explicitly undid.
    `isAtSavepoint()` reads refs, so it is accurate inside the same event
    handler, before React re-renders.
  - Load (`applyDocument`): flush the OUTGOING doc's draft first, then
    `reset()` to the new doc. The draft is NOT cleared, so the outgoing work
    survives for Phase 1's restore card.
  - Exit points (real unload via the guard's `onFlush`; in-app nav via the
    unmount cleanup): flush synchronously so continuous editing that never
    pauses 2s still persists on close.
  Failure contract: `saveDraft` never throws (fire-and-forget like
  `analytics.logEvent`). Documents can embed images as base64 data URIs
  (`ImageElement.tsx:73-78`), so a photo can exceed the ~5 MB budget. On
  `QuotaExceededError` the draft is skipped, NOT stripped (a restore silently
  missing images is worse than no draft), and any stale draft is deleted so
  restore never offers content older than what the user last saw.
  `isTemplateDocument` rejects `meta: null` and pages without an `elements`
  array so a corrupt draft cannot wedge the canvas.
  Known limitations (documented, not bugs; revisit if they bite): one draft
  slot per user, so loading B (which preserves A's draft) and then EDITING B
  overwrites A's draft — per-document keys are the future path. A
  page-size/global-field change racing during a save flight isn't covered by
  the clear-race check (pages only); worst case a ≤2s draft gap with the guard
  armed. A hard process kill mid-edit (crash/OOM/power, no `beforeunload`) can
  lose at most `DRAFT_MAX_WAIT_MS` (~10s) of work — the autosave's max-wait
  bound, not the whole burst. (`beforeunload` is desktop-only; on mobile
  bfcache/tab-eviction it may not fire, so the same ~10s bound applies there —
  a `pagehide`/`visibilitychange` flush would tighten it and is a candidate
  follow-up, not in this pass.) The draft is keyed by user but NOT by team, while
  templates save team-scoped — Phase 1's restore card must compare the draft's
  team against the active team before offering it (see T1.6).

Exit check: reload mid-edit prompts; `saveDraft`/`restoreDraft` round-trip in unit
tests; My projects lists rows on prod.

Round-2 review fixes applied (2026-07-11), all in the savepoint mechanism or
the shared builder — no new layer:
- `markSaved(value)` takes the click-time snapshot; raced edits keep `isDirty`
  true (was: `markSaved()` stamped resolve-time state as saved → raced edits
  marked clean and their draft deleted).
- Clean save clears the draft only when `getLatest()` shows no race (was:
  unconditional `clearDraft` deleted a raced draft).
- Load flushes-then-`reset()`s and does not clear (was: load's true→false
  transition fired `clearDraft`, erasing the outgoing doc's draft AND the
  undo stack — total loss on "edit A, open B").
- `beforeunload` now flushes; unmount flush reads a ref synced by effect, not
  a render-written closure.
- Page size and global fields fold into `isDirty` (was: only `pages`, so
  those edits were silently unprotected).
- `isTemplateDocument` tightened (was: accepted `meta: null`, unvalidated pages).

Round-3 review fix applied (2026-07-12), same event-driven mechanism, no new
layer:
- Undo/redo back onto the savepoint now clears the draft
  (`isAtSavepoint()` + `clearDraftIfClean()`, wired through `handleUndo`/
  `handleRedo` for both the keyboard shortcuts and the Toolbar buttons). Was: a
  side effect of making the autosave effect write-only (the round-2 fix for the
  load case) — nothing cleared on undo-to-clean, so a draft of explicitly
  un-done changes survived and Phase 1's card would have offered it back.

Round-4 review fix applied (2026-07-13), in the autosave effect, no new layer:
- The autosave debounce gained a max-wait (`DRAFT_MAX_WAIT_MS`). Was: a plain
  2s debounce that re-armed on every edit, so uninterrupted editing wrote
  nothing and a crash mid-burst lost the whole burst — declaring that
  "accepted" hollowed out T0.4's reason to exist. Now bounded to ~10s.
  Verified by a headless timing simulation: single edit → write at 2s;
  continuous 25s editing → writes at 10s and 20s (was: none); burst →
  coalesced to one write.

Round-5 review fixes applied (2026-07-13), in the existing dirty/clear logic,
no new layer (these AMEND the "clean cloud save" bullet and the fields-dirty
derivation above; the original points stand except as corrected here):
- Save-race guard now folds in the SAME fields as `isDirty`. Was: the clear
  condition tested pages only (`Object.is(getLatestPages(), savedPages)`) while
  `isDirty` also folds in page size and global fields, so changing page size
  during an in-flight save cleared the draft while the document was still
  dirty. Now `documentClean` also checks page size and global fields (via
  `pageSizeRef`/`globalsRef`, synced by effect for synchronous read after the
  `await`).
- Folded-in dirtiness is VALUE-based, not identity. Was: `!Object.is(...)`, and
  `handlePageSizeChange`/`onGlobalFieldsSave` always allocate a fresh object, so
  re-picking the same preset marked the document permanently dirty (spurious
  leave-site prompt + draft writes). Now `samePageSize`/`sameStringMap` compare
  by value. Verified headless: re-pick same preset = not dirty; real change =
  dirty; changed/removed global-field value = dirty.

Round-6 review fix applied (2026-07-13), test infrastructure, NO new dependency
(this AMENDS the exit-check NOTE below, which said the verification was a
throwaway script and a runner would need vitest — both no longer true):
- The verifications are now committed, reproducible tests run by
  `npm test` → `scripts/run-tests.mjs`, which uses Node's built-in
  `node --test` (same as `backend/`) with esbuild (already vite's dependency)
  to transpile the TS. No vitest/jest, no new package.
- To test the real source rather than copies, two pieces of previously-inline
  logic were extracted into pure modules and imported back by `TemplateCanvas`:
  `src/utils/documentDirty.ts` (`samePageSize`/`sameStringMap`, the Round-5
  fix) and `src/utils/draftSchedule.ts` (`draftDeadline`/`nextDraftDelay`, the
  Round-4 max-wait cadence). Committed suites: `draftStore.test.ts` (round-trip,
  user isolation, quota-skip, corrupt-payload rejection),
  `documentDirty.test.ts`, `draftSchedule.test.ts` (the cadence, replacing the
  throwaway simulation) — 14 tests, all pass. `*.test.ts` is excluded from the
  app `tsc` build (run via esbuild, which resolves `node:` builtins).
- Still NOT unit-covered (unchanged): the React-hook wiring itself (save-race
  flow, undo-to-clean, beforeunload) — needs the manual browser pass below.

Round-7 review fixes applied (2026-07-13), test-suite hardening:
- esbuild is now a DECLARED devDependency (was: used by `run-tests.mjs` but
  absent from `package.json`, resolving only via npm hoisting vite's copy — a
  break under a vite bundler swap or strict pnpm/PnP install).
- The `draftSchedule` cadence test asserted a hard `gap <= MAX_WAIT`, stronger
  than the code guarantees: the real window reopens on the edit AFTER a write,
  so the true bound is `MAX_WAIT + one edit interval`. The simulation now fires
  strictly before the observing edit (`timerAt < t`) and asserts the correct
  bound. Behavior is unchanged; the test was over-claiming.
- Added the `sameStringMap` renamed-key case (equal key COUNT, different keys)
  — the one branch a future length-only "optimization" would silently break.
- **Exit check T0.4 (round-trip + failure contract): now MET** — 15 committed
  tests via `npm test`, superseding the "10/10 scripted check" bullet below.
- Named the specific still-uncovered wiring: the `draftDeadlineRef.current = 0`
  reset (on write and on clean) lives in `TemplateCanvas` and is re-implemented
  by the test's `simulate()`; deleting it from the component fails no test.
  Covering it needs a React test setup (`@testing-library/react`) — a
  dependency deliberately not taken; it stays on the manual browser pass.

Exit-check status (2026-07-11):
- Round-trip + failure contract: verified by a scripted check (esbuild-compiled
  module, stubbed localStorage) covering round-trip, clear, quota-skip with
  stale-draft delete, corrupt/foreign-shape rejection, the tightened validation
  (`meta: null` and pages without `elements` rejected), and cross-user/anon
  isolation — 10/10 pass.
  NOTE (SUPERSEDED by Round-6 above — kept per the amend-don't-rewrite rule):
  this originally read "the frontend has no unit-test runner… making it
  permanent requires adding vitest." That is no longer true — the checks are
  now committed tests run by `npm test` via `node --test` + esbuild, no new
  dependency. The savepoint/race logic in `useHistoryState` + `TemplateCanvas`
  is React-hook wiring the pure tests still cannot exercise; it was verified by
  tracing and needs the manual/browser pass below.
- Reload-mid-edit prompt: hook implemented and wired to document-level
  `isDirty` (page-size and global-field edits included); the native
  beforeunload dialog needs a manual browser check (cannot be verified
  headlessly). Pending.
- My projects lists rows on prod: verified at T0.1.

### Phase 1: Start Layer

- T1.1 `src/components/TemplateCanvas/CanvasStartLayer.tsx`: presentational
  component, props are callbacks plus an optional draft descriptor and nothing
  else (`onBrowseTemplates`, `onRebuildPdf`, `onBindData`, `onStartBlank`,
  `draft?: { savedAt: string; onRestore: () => void }`).
- T1.2 `shouldShowStartLayer(pages, dismissed): boolean` pure helper next to the
  component; unit-testable without React.
- T1.3 Wire into `TemplateCanvas.tsx` replacing the hint block at 1121-1128 when
  the helper returns true; keep the old hint for non-first pages that are empty.
- T1.4 Dismissal state: in-memory per document session only (a `useState` in the
  canvas). No localStorage flag in this phase; a returning user with an empty
  doc sees the layer again, which is desired.
- T1.5 Card copy pass: outcome language, no internal jargon (no "collection",
  no version suffixes) on this surface.
- T1.6 "Continue where you left off" card: rendered first when
  `restoreDraft(userId)` yields a draft (T0.4 — the key is user-scoped, so
  pass the current user's id); `onRestore` loads it through `applyDocument`
  (the existing hydration path, which flushes/resets correctly) and logs
  `'draft_restored'`.
- T1.7 Bind-data seeding: `seedStarterLayoutFromStructure(structure): CanvasElement[]`
  (pure; maps detected fields to a bound layout table plus a title text via the
  existing element factories, capped at the columns that fit the page width).
  Called once when intent capture completes with the canvas still pristine;
  logs `'data_bound'` at that moment (section 5).
- T1.8 Instrumentation per section 5: extend `AnalyticsEventType`, log
  `'start_layer_shown'` and `'start_layer_card_clicked'` from the layer.
- T1.9 Accessibility contract per section 4 (buttons, tab order, no focus steal,
  token focus ring); verified with keyboard-only walkthrough.

Exit check: empty doc shows layer; inserting any element or loading any template
hides it; every card reaches its existing flow; the data card ends on a seeded,
non-empty canvas; a stored draft shows the continue card and restores; funnel
events appear in `analytics_events`; keyboard-only operation works; rail and
toolbar unaffected.

Phase 1 status (2026-07-13) — implemented, no drift from the tasks above:
- T1.1/T1.5/T1.9 `CanvasStartLayer.tsx` (+ `.css`): presentational, four
  callbacks + optional `draft`, outcome-language cards, a11y contract (real
  buttons, draft-first tab order, no focus steal, `--color-accent-ring`).
- T1.2 `startLayer.ts` `shouldShowStartLayer(pages, dismissed)` — pure,
  unit-tested (`startLayer.test.ts`).
- T1.3/T1.4/T1.6 wired in `TemplateCanvas`: replaces the empty-hint block on
  the pristine first page only (the hint stays for other empty pages);
  in-memory `startLayerDismissed`; cards delegate to the existing handlers
  (`setLibraryMode('builtin')`, `setRebuildAiOpen`, `setUploadPanelOpen`); the
  Continue card reads `restoreDraft(userId)` and restores via `applyDocument`,
  logging `draft_restored`.
- T1.7 `seedLayout.ts` `seedStarterLayoutFromStructure(doc)` — pure, unit-tested
  (`seedLayout.test.ts`): title + a table bound to the first collection, columns
  = detected fields capped to A4 width, header title-cased, cells `{{field}}`.
  Called from `handleDataConfirm` only when the canvas is pristine; logs
  `data_bound`. (`makeRow` exported from `layoutTable.ts` for reuse.)
- T1.8 `AnalyticsEventType` extended; `start_layer_shown` (once on show) and
  `start_layer_card_clicked` (with `{ card }`) logged from the wiring.
- Tests: 23 total pass (`npm test`); `tsc -b` clean.
- NOT yet done (needs the running app + auth, same as Phase 0's browser pass):
  the visual/keyboard exit check above and confirming funnel rows land in
  `analytics_events`. The React wiring itself is not unit-covered.

Phase 1 review fixes applied (2026-07-13):
- Cross-team draft leak (blocking; the caveat at "keyed by user but NOT by
  team…" required this): the draft payload now records the `teamId` it was
  written under (`saveDraft(doc, userId, teamId)`), and the Continue card
  offers it only when `draft.teamId === getActiveTeamId()`. Without this, a
  user in teams A and B could restore team A's crash draft while active in
  team B and save it into B. `activeTeamId` is resolved once and stamped onto
  every draft write.
- Seeding gated on the wrong condition: T1.7 said "canvas still pristine", but
  the code gated on `shouldShowStartLayer` (which also requires !dismissed), so
  clicking "Start blank" then binding data left an empty canvas — root cause #3.
  Split out `isCanvasPristine(pages)`; seeding now gates on that alone, layer
  visibility keeps the dismissal check.
- Continue-card invariant corrected: a doc can return to pristine mid-session
  (add element → autosave → delete it; deletion is a forward edit, not an undo,
  so the undo-to-savepoint clear never fires). The card now also requires
  `!isDirty`, so it never re-offers just-deleted content; on a fresh mount
  isDirty is false so a genuine prior-session draft still shows. And
  `start_layer_shown` now logs once per session (a ref guard), not on every
  visibility flip.
- Removed the redundant `pageIdx === 0` (shouldShowStartLayer already implies a
  single page).

### Phase 2: Template gallery thumbnails

- T2.1 Build-time script `scripts/generateTemplateThumbnails.ts`: iterate
  `src/templates/registry.ts`, render each builtin through the existing image
  export engine (PNG, small DPI), write to `public/template-thumbs/<id>.png`.
- T2.2 Registry gains `thumbnail: string` (path). Gallery card renders the image
  with the text as caption; graceful fallback to current text card when the file
  is missing.
- T2.3 Reuse the same thumbnails on the Start Layer's template card (show 3
  rotating previews) for visual pull.

Exit check: gallery shows real previews generated from the same rendering path
users export with; bound tables show sample data in thumbs.

### Phase 3: Guided first success

- T3.1 "Try the sample invoice" row inside the template card (NOT a fifth card;
  four outcome cards plus the conditional draft card is the ceiling for this
  surface): loads one curated builtin (invoice) with its sample data via the
  existing template-load path, then pulses the Export button once. Functions:
  `loadSampleTemplate()`, reuse existing load; the pulse is CSS only. Logs
  `'start_layer_card_clicked'` with `card: 'sample'`.
- T3.2 First-export success toast ("Your first document is ready") triggered off
  the existing export completion callback; shown once per browser
  (`markFirstExportCelebrated()` in `draftStore.ts` scope). Logs
  `'first_export_completed'`.

Exit check: cold user reaches a downloaded PDF in under a minute using only
on-canvas affordances, and the full funnel of section 5 is visible in
`analytics_events` for that session.

### Phase 4: Toolbar clarity (supporting, not blocking)

- T4.1 Add accessible labels to the two unnamed toolbar buttons.
- T4.2 Rename and group: File (Save, My projects, Templates, Load), Data
  (Upload/Bind), AI (Rebuild), View (Rulers, Page size). Text label on the three
  discovery-critical buttons at wide viewports.
- T4.3 Rename top-left "Integrations" button to "Settings"; add a Settings link
  and plan badge to the account dropdown.
- T4.4 Jargon pass on property panels: "Layout table (v2)" loses the version
  suffix; "Collection iteration (preview later)" becomes plain language or is
  hidden until the feature ships.

Exit check: a tester can name each toolbar button's function from its label alone.

## 8. Out of scope (deliberately, to avoid over-engineering)

- Canvas zoom/fit controls: separate architecture doc, it touches rendering and
  coordinate math across the editor.
- Table direct manipulation (drag column widths, hover row/col handles): belongs
  to the existing table-polish workstream.
- Smart element placement (cascade instead of fixed `START_POSITION`): small but
  independent; can ride along with table polish.
- Server-side drafts, multi-device draft sync, product tours/checklists.
- Template suggestions ranked by uploaded data structure (the bind-data card
  seeds a starter layout instead; suggestion ranking is a future doc).

## 9. Doc maintenance rules

- When a phase completes, update this doc's status line and the phase section with
  what shipped, then diff implementation against the phase tasks; any drift is
  either reverted or written back into this doc before the next phase starts.
- No task outside this doc's scope ships under this workstream.

---

## AMENDMENT (2026-07-13) — §5's funnel recorded NOTHING; the doc's own claim was wrong

Appended, not rewritten (rule k). This corrects **§5**; every other section stands.

### A.1 The false claim, and where it came from
§5 ends with:

> "The events table is append-only; no schema change beyond the enum union in
> TypeScript (the DB column is text)."

**That is wrong.** The column is `text`, but it carries a CHECK constraint
(`supabase/schema.sql`, re-asserted by `supabase/ai_metering.sql`):

```sql
check (event_type in ('login','template_created','pdf_exported','ai_build'))
```

An unlisted `event_type` is **rejected on insert**. And `analytics.logEvent`
swallows errors by design ("analytics must never break the action it is
measuring"), so the rejection surfaced only as a `console.warn`.

The claim was copied verbatim into `analytics.ts` as a code comment when TC-0187
extended the union, so the mistake was asserted twice and checked zero times.

### A.2 What that means for anything §5 claims to measure
From TC-0187 until the migration below, **every activation event was discarded by
the database**: `start_layer_shown`, `start_layer_card_clicked`, `draft_restored`,
`data_bound`. The funnel in §5 has **no data behind it**. Any conclusion drawn
from it about cold-start activation is unfounded — not "thin", *absent*.

`login`, `template_created` and `pdf_exported` were unaffected (they predate the
constraint and are listed in it), so the *ends* of the funnel are real; every
middle step is missing.

### A.3 Fixed (TC-0192)
- `supabase/canvas_activation_events.sql` — widens the constraint in place,
  idempotent. **Must be run against the deployed database**; a frontend deploy
  alone leaves the funnel dead.
- `supabase/schema.sql` — inline constraint widened too, so a freshly created
  database is not born broken.
- `src/services/analytics.ts` — the false comment replaced with the opposite
  instruction (adding a union member is NOT sufficient).
- `src/services/analytics.test.ts` — **the actual fix.** It reads the TypeScript
  union and both SQL files and fails if any frontend event would be rejected. A
  subset check, not equality: the constraint legitimately holds `ai_build`, which
  the backend logs. Nothing connected these two sources of truth before, which is
  why the bug survived a whole phase.

### A.4 Second drift in §5, unrelated to the constraint
§5 also specifies **`'first_export_completed'`** ("once per browser, alongside the
existing `'pdf_exported'`"). It was **never implemented** — it appears in no
source file, frontend or backend. So the funnel's terminal step does not exist
either, by a different mechanism.

Decide before relying on §5: implement it, or strike it from the funnel and read
`pdf_exported` as the terminal step. It is NOT covered by the migration above and
would need its own constraint entry if implemented.

### A.5 Consequence for the Start Layer retirement
`APP_SHELL_RELAYOUT_ARCHITECTURE.md` T5.6/T5.7 retires the Start Layer and
re-points the funnel at the Dashboard. That retirement was to be judged on
before/after activation data. **There is no "before" data.** Either accept the
retirement on its design merits (the shell answers cold-start earlier and better),
or run the migration and collect a baseline first. Do not claim it was measured.

---

## AMENDMENT (2026-07-13) — `first_export_completed` implemented (resolves A.4)

A.4 flagged that §5's terminal step existed in the doc and in no source file. It is
now implemented (TC-0193). This records what shipped and where it deviates.

### B.1 What it is, and why it is not just `pdf_exported`
`pdf_exported` is logged by the **backend** on every export, so one user with 500
exports writes 500 rows: it measures **volume, not activation**. §5's metric is
"share of sessions that … end with a completed export", which needs a
**once-per-user marker**. `first_export_completed` is that marker, and it makes the
funnel's terminal step directly countable rather than derived.

It IS derivable from `pdf_exported` (earliest row per user). The event buys a
simpler read path at the cost of one redundant row per user. That trade is
accepted, not overlooked.

### B.2 DEVIATION from §5: scoped per USER, not per browser
§5 says "once per browser". Implemented as **once per user per browser**
(`mapdoc.firstExport.v1:<userId>`, the key shape `draftStore` already uses).

§5's wording is a bug: on a shared machine, the second account to sign in would
have its first export suppressed by the first account's flag and would **silently
never appear to activate**. Per-user scoping is strictly more correct and no more
complex.

### B.3 Known bias, stated rather than hidden
The flag is `localStorage`. A new device, a cleared browser, or a private window
means the same user can emit `first_export_completed` more than once, so the metric
**over-counts activation**. Anyone reading the funnel must treat it as an upper
bound. Removing the bias means deriving from `pdf_exported` server-side instead —
deliberately not done (§5 chose the event).

### B.4 Fails CLOSED
When `localStorage` is unavailable (private mode, quota, disabled),
`markFirstExport` returns **false**, not true. Returning true would log "first
export" on *every* export from that browser and destroy the metric it exists to
produce. Under-counting is recoverable; a corrupted funnel is not.

### B.5 All three export paths fire it
Single download, **bulk**, and **email** — a first-time user can activate via any
of them, and counting only the single-download path would bias the funnel.
`BulkExportPanel` reports completion through a new `onExportCompleted` callback, so
analytics and auth stay out of that component; it fires on the transition into
`done`, so a re-render cannot double-report.

### B.6 Schema
`first_export_completed` is added to `AnalyticsEventType`, to `supabase/schema.sql`
and to `supabase/canvas_activation_events.sql`. **The migration must run against the
deployed database or this event is rejected on insert like the others** (see the
previous amendment). `analytics.test.ts` fails the build if any of the three ever
disagree again.

---

## AMENDMENT (2026-07-13) — migration APPLIED

`supabase/canvas_activation_events.sql` was run against the deployed database and
succeeded. The CHECK constraint now accepts all five funnel events. This resolves
the "must be run" caveat in both amendments above.

What this does and does not mean:

- **From now on, the funnel records.** The four events already live in prod
  (`start_layer_shown`, `start_layer_card_clicked`, `draft_restored`, `data_bound`
  shipped in TC-0187 and were being rejected on every insert) will start landing
  from the moment the next event fires. No frontend deploy is needed for those —
  the code was always correct; the database was rejecting it.
- **`first_export_completed` still needs the frontend deployed** (TC-0193). The
  constraint accepts it; nothing emits it yet in prod.
- **There is NO backfill.** Every activation event between TC-0187 and today was
  rejected at insert time and is gone — not recoverable, not derivable. §5's funnel
  has data starting today and nothing before it.
- **Consequence for the Start Layer retirement** (APP_SHELL_RELAYOUT T5.6/T5.7):
  the "before" baseline starts accumulating only now. Either wait for a baseline
  before retiring the layer, or retire it on design merits and say so — but do not
  claim it was measured against prior data, because there is none.

---

## AMENDMENT (2026-07-14) — "Start from your data" removed from the Start Layer (TC-0210)

§4's card 3 ("Start from your data") and its T1.7 wiring in the Start Layer are
**removed**. The layer now offers four cards: Continue where you left off · Start from
a template · Rebuild a PDF with AI · Start blank.

**Why.** The editor's right panel now carries a permanent **Data** tab with its own
Upload button (relayout Amendment 7). An empty-canvas card offering the same upload was
a second door two feet from the first.

**T1.7 is NOT affected, and this is the important part.** §4's post-condition — *"the
flow must not end on an empty canvas"* — is enforced in `handleDataConfirm`, gated on
`isCanvasPristine(pages)` **alone**, never on the card. So binding data from the Data
tab onto a pristine canvas still seeds a starter layout (title + a table bound to the
detected structure) and still logs `data_bound`. That decoupling was made deliberately
in Phase 1 (so that dismissing the layer with "Start blank" could not disable the
post-condition) and it is what makes this removal safe.

**Funnel consequence.** `start_layer_card_clicked` is documented in §5 with
`metadata: { card: 'continue_draft' | 'template' | 'ai_rebuild' | 'bind_data' | 'blank'
| 'sample' }`. **`'bind_data'` is now never fired** — nothing emits it. No schema impact
(`metadata` is `jsonb`), but any funnel query splitting on that value will find an empty
branch from today. `'data_bound'` still fires and remains the mid-funnel step for the
bind leg, which is the one §5 actually needs.

Note the Dashboard's own "Start from your data" action card is **unchanged** — it
dispatches the `bind-data` launch intent and is a different surface.
