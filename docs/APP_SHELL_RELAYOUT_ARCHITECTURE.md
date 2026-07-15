# App Shell Re-layout — Architecture

Status: proposed. Scope: **layout and visual system only.**
Date: 2026-07-13. Companion to `UI_UX_GAP_ANALYSIS.md` (which evaluated the mockup).

---

## 0. The one rule this document is built on

**Nothing in here adds, removes, or changes a single behaviour.**

Every surface we build is a new *container* for a handler, component, or piece of
state that **already exists and already works today**. If the mockup shows a
control we do not already have behind it, **we do not build that control** — we
leave the slot out rather than fake it or grow the feature to fill it.

That gives us a hard, mechanical test for every task below:

> Does this task call any handler, read any state, or render any data that does
> not already exist in `main`? If yes, it does not belong in this document.

Two consequences worth stating up front, because they are the whole discipline:

- The Layout panel keeps **X/Y coordinates**. The mockup's `Flow / Anchor /
  Fill column` model implies a layout engine we do not have (see
  `UI_UX_GAP_ANALYSIS.md` §3.1). We render the mockup's *field-row styling* around
  our *existing* `PositionProperties`. It will look like the mockup and behave
  exactly like today.
- The **Live-data toggle is not built.** It is only a boolean and a ternary, but a
  boolean and a ternary is a behaviour change. Preview stays always-on, exactly as
  it is now.

---

## 1. Current code behaviour (rule a)

What exists today, and therefore what we have to re-house:

**Shell.** There is none. `pages/Canvas.tsx` is a fixed 52px bar (`UserMenu` + an
"Integrations" button) with `<TemplateCanvas />` beneath. Routes are Home, Features,
Pricing, Careers, Login, Canvas, Builder, Settings, Admin (`App.tsx`). No sidebar,
no dashboard, no templates route.

**Editor.** One screen, no modes:
- Left rail: `Toolbar.tsx:92-137` (`tb--rail`), 13 element types via `IconBtn`.
- Top-right bar: `Toolbar.tsx:140-235` — undo/redo, page size, rulers, save,
  templates, projects, load, AI rebuild, upload, data controls, export menu.
- Canvas: `TemplateCanvas.tsx:1291` renders `previewPages` (values substituted
  whenever `ir` exists). Elements are **absolutely positioned** (`position:{x,y}`).
- Editing happens on **floating bars** (`TextFormatBar`, `ElementFormatBar`,
  `ElementQuickBar`), not a persistent panel.
- `PropertiesPanel` renders **only** for chart, layout table, and page-number text
  (`TemplateCanvas.tsx:1456-1458`).
- `CanvasStatusBar` sits at the bottom; `CloudStatusToast` reflects `cloudStatus`.
- `CanvasStartLayer` occupies the pristine first page (activation Phase 1).

**Data we can legitimately display:**
- `UsageSummary` (`apiIntegration.ts:34`): plan, `templates{used,limit}`,
  `exportsThisMonth{used,limit}`, `aiBuildsThisMonth{used,limit}` — via `PlanProvider`.
- `listTemplates()` (`templatesRepo.ts:38`) → `TemplateSummary { id, name, updated_at }`.
- `BUILTIN_TEMPLATES` (`templates/registry.ts`): 35 templates, `name`, `description`,
  `category` (`BuiltinCategory`), `sizeLabel`.
- Token/binding state: `parseTextWithPlaceholders`, `fieldMapping`,
  `LayoutTable.binding`, `CanvasPage.repeatHeader`, header/footer `BoundaryLine`.

**Design tokens** (`src/index.css`): colour, shadow, and button-radius tokens exist
(`--color-accent: #2355f4`, `--color-text-*`, `--color-border-*`, `--shadow-*`).
There is **no spacing scale, no radius scale, no font scale**, and no semantic
colour for "data" or "repeat".

---

## 2. What the mockup asks for, and what backs it

The honest slot-by-slot mapping. **OMIT** means: the mockup shows it, we have
nothing behind it, so we do not build it.

| Mockup slot | Backed by (existing) | Verdict |
|---|---|---|
| Sidebar: Templates | `BUILTIN_TEMPLATES` + `listTemplates()` | BUILD |
| Sidebar: Dashboard | `UsageSummary` + `listTemplates()` | BUILD (reduced, see §4.2) |
| Sidebar: Team / Settings / Integrations | `pages/Settings.tsx` (Plan·Team·API·Webhooks·Usage) | BUILD as links to existing page |
| Sidebar: Data Sources | *nothing — no table, uploads are in-memory* | **OMIT** |
| Sidebar plan card + usage bar | `PlanProvider` → `usage.templates` | BUILD |
| Dashboard: 4 stat tiles | only 3 real metrics exist | BUILD 3, **OMIT** "avg. batch time" |
| Dashboard: "Jump back in" | `listTemplates()` (`updated_at`) | BUILD (no doc counts — we don't have them) |
| Dashboard: recent generations feed | `analytics_events` is **write-only** from the frontend | **OMIT** |
| Dashboard: data health | no sources model | **OMIT** |
| Templates page: category chips | `BuiltinCategory` | BUILD |
| Templates page: thumbnails | **owned by canvas-activation Phase 2** | **OMIT here** (rule k) |
| Templates page: favourites (star) | no column, no UI | **OMIT** |
| Editor: back / breadcrumb / title | `templateMeta.name` | BUILD |
| Editor: "Saved" chip | `cloudStatus` | BUILD |
| Editor: undo/redo, export button | existing Toolbar handlers | BUILD (re-housed) |
| Editor: mode tabs (Design/Data/Preview/Export) | would re-route existing panels = interaction change | **OMIT** (see §5.1) |
| Editor: Live-data toggle | preview is always-on today | **OMIT** (§0) |
| Editor: zoom control | no zoom exists | **OMIT** (own future doc) |
| Editor: Share | no sharing model | **OMIT** |
| Editor: 58px icon rail + tooltips | `Toolbar` `tb--rail` + `IconBtn` | BUILD (restyle; keep all 13 types) |
| Right panel: Insert tab | existing `onAddText/Table/Image/...` handlers | BUILD (delegates, no new logic) |
| Right panel: Data tab | `DataStructureViewer`, `staticPlaceholders`, `fieldMapping` | BUILD (re-house) |
| Right panel: Data tab — hover-to-locate, drag-to-bind | new behaviour | **OMIT** |
| Right panel: Layout tab | `PropertiesPanel` + `PositionProperties` (**X/Y**) | BUILD (§5.2) |
| Right panel: Visible / Lock toggles | no such element state | **OMIT** |
| Canvas: token chips | `parseTextWithPlaceholders` ×3 | BUILD (restyle — dedupe first, §5.3) |
| Canvas: "repeats" region frames | `BoundaryLine`, `repeatHeader`, `LayoutTable.binding` | BUILD (label existing state) |
| Canvas: paper shadow / dotted stage | pure CSS | BUILD |
| Bottom hint chip, mobile note | pure CSS | BUILD |

**Net:** of 30 mockup slots, **19 build on things we already have**, and **11 are
omitted** because nothing backs them. The omissions are the point of this document,
not a shortfall in it.

---

## 3. Architecture

### 3.1 Structure

```
src/shell/
  AppShell.tsx        // sidebar + topbar + <Outlet/>; owns no domain state
  Sidebar.tsx         // nav items + plan card (reads PlanProvider)
  TopBar.tsx          // page title + slot for page actions
  shell.css
src/pages/
  Dashboard.tsx       // composes existing data only
  Templates.tsx       // composes the extracted gallery/list (below)
src/components/TemplateCanvas/
  library/
    TemplateGallery.tsx  // EXTRACTED from TemplatesLibraryModal (presentational)
    ProjectList.tsx      // EXTRACTED from TemplatesLibraryModal (presentational)
  panel/
    EditorPanel.tsx      // 3 tabs; hosts existing components, owns only tab state
    InsertPane.tsx       // grid of buttons → existing add-element callbacks
    DataPane.tsx         // hosts DataStructureViewer + placeholder list
    LayoutPane.tsx       // hosts existing PropertiesPanel / PositionProperties
```

### 3.2 Dependency rule (rule e)

Dependencies point **inward only**: shell → pages → existing components → existing
services. No shell component imports canvas internals; no canvas component imports
the shell. Every new component is **presentational**: props in, callbacks out, zero
business logic — the same contract `CanvasStartLayer` already honours.

`TemplatesLibraryModal` is **not deleted** (rule g). Its gallery and list are
*extracted* into `TemplateGallery` / `ProjectList`, and the modal then **renders
those same components**. Modal and page therefore cannot drift, and no behaviour
changes on either path.

### 3.3 The token layer

Extend `src/index.css` **in place**. Do not create a second `:root` system.

- Re-point existing tokens to the mockup palette (`--color-accent` → indigo).
- Add the scales that don't exist: `--space-*`, `--radius-*`, `--font-*`.
- Add two semantic colours the mockup relies on and we lack:
  `--color-data-*` (jade — bound/placeholder) and `--color-repeat-*` (amber — repeat regions).

Every component below consumes tokens only. No hex literals.

**Fonts are a decision, not a default.** The mockup pulls Bricolage Grotesque /
Hanken Grotesk / JetBrains Mono from Google Fonts. That is a new external
dependency and a privacy/perf consideration. Recommendation: **self-host**, or keep
current fonts for v1 and treat the typeface swap as its own change.

---

## 4. Phases

Each task is small, single-purpose, and independently reviewable (rule d).

### Phase 0 — Token layer (no component changes)
- T0.1 Extend `src/index.css`: re-point palette; add `--space-*`, `--radius-*`, `--font-*`.
- T0.2 Add `--color-data-*` and `--color-repeat-*` semantic tokens.
- T0.3 Font decision (self-host vs defer). No code until decided.

Exit check: app renders in the new palette with **zero component edits**; nothing moves.

### Phase 1 — Shell and routes
- T1.1 `AppShell.tsx` — sidebar + topbar + `<Outlet/>`. No domain state.
- T1.2 `Sidebar.tsx` — nav (Dashboard, Templates, Editor, Settings) + plan card from `PlanProvider`.
- T1.3 `TopBar.tsx` — title + actions slot.
- T1.4 Wrap the protected routes in `AppShell`; add `/dashboard`, `/templates`.
- T1.5 `pages/Canvas.tsx`: its ad-hoc fixed bar is **replaced by the shell topbar**;
  the Integrations button becomes a Settings nav item. `<TemplateCanvas />` untouched.

Exit check: every existing route still works; the editor behaves identically inside the shell.

### Phase 2 — Dashboard (only real data)
- T2.1 `StatTile` (presentational).
- T2.2 Dashboard: three tiles from `usage` — templates, exports this month, AI builds.
- T2.3 "Jump back in": `listTemplates()` sorted by `updated_at`; opens the editor.
- T2.4 Empty state when the account has no templates.

Exit check: no number on this page comes from anywhere but `UsageSummary` / `listTemplates()`.

### Phase 3 — Templates page
- T3.1 Extract `TemplateGallery` from `TemplatesLibraryModal` (presentational).
- T3.2 Extract `ProjectList` likewise.
- T3.3 `TemplatesLibraryModal` re-renders those two components — **behaviour identical**.
- T3.4 `pages/Templates.tsx`: chips (`BuiltinCategory`) + gallery + project list.
- T3.5 Category filter is a pure helper `filterByCategory(templates, cat)` — unit-tested.

Exit check: modal and page render the same tiles from the same components; opening a
template from either path does exactly what it does today.

**Phase 3 status (2026-07-14) — implemented.**
`library/TemplateGallery.tsx` (T3.1) and `library/ProjectList.tsx` (T3.2) extracted;
`TemplatesLibraryModal` now renders both and is otherwise unchanged (T3.3);
`pages/Templates.tsx` + `templates.css` (T3.4); `templates/filterByCategory.ts` +
test (T3.5). `/templates` added to the frame's routes and to `NAV_ITEMS`.
`tsc -b` clean; ESLint clean on all new files and byte-identical to baseline on the
canvas; 67/67 tests.

Design notes:

1. **`ProjectList` owns its data, not its meaning of "open".** It fetches, and owns
   loading/error/delete/copy-id/busy — but takes `onOpen(id)`, which may be async.
   That is the one thing that genuinely differs between its two callers: the modal
   lives *inside* the canvas, so its `onOpen` fetches the record and hands it over
   (exactly today's behaviour); the page is a different route, so its `onOpen`
   navigates with a launch intent. Awaiting the callback covers both without the
   component knowing which is which.
2. **New intent kind `open-builtin`** (T3.4 needs it, and it did not exist).
   Built-ins are bundled with the app, so the canvas resolves the id against
   `BUILTIN_TEMPLATES` — a lookup, not a fetch — and calls the **existing**
   `handleOpenBuiltin`, which still bakes in the template's sample data through the
   normal data path. A missing id says so (`template.builtinMissing`) rather than
   opening a blank canvas.
3. **Chips are derived from the templates**, not hard-coded (`categoriesOf`). A chip
   therefore cannot filter to an empty page, and adding a built-in with a new
   category makes its chip appear on its own. A test pins that against the real
   registry.
4. **Deliberately absent: thumbnails** (owned by canvas-activation Phase 2 — not
   forked here), favourites, and search. Nothing backs the latter two.

Not verified in a browser: the page renders behind auth. Build, lint and unit tests
are green.

### Phase 4 — Editor chrome
- T4.1 Editor topbar: back, breadcrumb (`templateMeta.name`), `cloudStatus` chip,
  undo/redo, export — **all existing handlers, re-housed**.
- T4.2 Restyle `Toolbar` `tb--rail` to the 58px icon rail with hover labels. **All 13
  element types stay.** Icons/labels unchanged.
- T4.3 `EditorPanel` shell (300px, three tabs, owns tab state only).
- T4.4 `InsertPane` — button grid wired to the **existing** add-element callbacks.
- T4.5 `DataPane` — hosts `DataStructureViewer` + placeholder list; bound/unbound dots
  derived from the **existing** `fieldMapping`. No new interactions.
- T4.6 `LayoutPane` — hosts the **existing** `PropertiesPanel` and `PositionProperties`
  (X/Y preserved), in the mockup's field-row styling.
- T4.7 Stage/paper styling: dotted stage, paper shadow, page label.
- T4.8 Region frames: label the **existing** header/footer boundaries and bound-table
  state ("Repeats on every page" / "Repeats per data row"). Read-only labels.
- T4.9 Bottom hint chip. Keep `CanvasStatusBar`.

Exit check: every editor action reachable today is still reachable, in the same number
of clicks or fewer; `CanvasStartLayer` still owns the pristine canvas.

### Phase 5 — Responsive + a11y
- T5.1 Sidebar collapse < 1180px; `<900px` mobile note.
- T5.2 Keyboard pass: nav, tabs, rail, panel. Real `<button>`s; visible focus ring
  (`--color-accent-ring`), matching the Start Layer's contract.
- T5.3 `prefers-reduced-motion` honoured.

Exit check: keyboard-only walkthrough of shell + editor; no focus traps.

---

## 5. Caveats (rule b)

### 5.1 Mode tabs are an interaction change, not a layout change
Design/Data/Preview/Export re-routes existing panels into a tab model. That changes
how the product is navigated even if no handler changes. It is **omitted** here. If
we want it, it gets its own decision — it is exactly the kind of thing that looks
like layout and behaves like product.

### 5.2 The Layout tab will not look like the mockup, and that is correct
The mockup shows `Flow`, `Anchor`, `Fill column`. We render `X` and `Y`. The panel
**chrome** matches the mockup; the **controls** are ours. Anyone expecting the
mockup's layout semantics will be disappointed, and should read
`UI_UX_GAP_ANALYSIS.md` §3.1 before proposing we "just finish it".

### 5.3 `parseTextWithPlaceholders` is triplicated — fix before restyling
It exists in `TextElement.tsx:97`, `ParagraphElement.tsx:83`, and
`LayoutTableElement.tsx:199`. Restyling token chips means touching token rendering,
so **extract it to one shared helper first** and have all three call it (rule g:
fix the existing code; do not add a fourth copy).

### 5.4 `PropertiesPanel` is currently conditional
It renders only for chart / layout table / page-number text. A persistent Layout tab
means it must render for **all** element types. That is a *container* change — but
be careful it does not become an excuse to add properties that don't exist today
(no Visible, no Lock).

### 5.5 Collision with the canvas-activation workstream
That doc owns **Phase 2 (template thumbnails)** and **Phase 4 (toolbar clarity)** —
both overlap this one. Per rule k, this document does **not** restate or fork them.
Finish canvas activation first, then re-layout, or the two will fight over the same
files. The Start Layer must survive Phase 4 here untouched.

### 5.6 Two visual languages during rollout
Between Phase 0 and Phase 5, some screens carry the new palette and some the old.
Keep the gap short; do not pause mid-migration.

---

## 6. Explicitly out of scope (rule h, i)

Flow/anchor layout · persisted data sources · the Data Sources page · the recent-
generations activity feed · the Live-data toggle · zoom/fit · Share · favourites ·
global search · template thumbnails (activation Phase 2) · any new backend endpoint
· any new element property · any new table or column.

If a task seems to need one of these, it is out of scope by definition — stop and
raise it, do not grow the phase.

---

## 7. Definition of done

The app looks like the mockup, and **`git diff` shows no change to any handler, any
service, any type in `types/`, or any business rule.** The only logic added in the
whole workstream is `filterByCategory` (T3.5) and tab-index state (T4.3).

If the diff shows more than that, this document has been violated.

---

## AMENDMENT 1 (2026-07-13) — rebuild the existing chrome; do not add a parallel one

Raised in review: *"what is shell? and why are you implementing a new structure?
why not rebuild the existing?"* The objection is correct and §3.1 above was wrong.
These points **amend** §3.1 and §4; the rest of the document stands.

### A1.1 "Shell" was jargon — it means the app frame
Sidebar + topbar + content area (the mockup's `.app` → `.sidebar` + `.main`).
Nothing more. The term is dropped; this doc should be read as "app frame".

### A1.2 The codebase ALREADY occupies the mockup's slots
Verified in code — this is why a parallel structure was a mistake:
- `PropertiesPanel.css:2-10` is **`position: fixed; top: 68px; width: 300px`**,
  right-aligned, `z-index: 999`. That is *already* the mockup's 300px right panel,
  same edge, same width. It already hosts every property component.
- `Toolbar.tsx` already renders **two** fixed bars: `tb--rail` (vertical, left — the
  mockup's icon rail) and `tb--export` (`top: 68px; right: 16px` — the mockup's
  topbar actions).
- `pages/Canvas.tsx` already renders a **fixed 52px top bar** (UserMenu +
  Integrations) — the mockup's topbar, built with inline styles.

The mockup's editor is therefore **not a new structure**. It is a re-arrangement of
chrome that already sits in those exact positions.

### A1.3 Superseding §3.1: what is rebuilt vs what is new
§3.1's `src/shell/AppShell.tsx` and `panel/EditorPanel.tsx` are **withdrawn** —
creating them alongside the existing panel and topbar would leave two of each in the
tree, i.e. a new layer wrapped around working code, which rule (g) forbids.

**REBUILT (the file exists and already holds the slot):**
| File | Rebuilt into |
|---|---|
| `PropertiesPanel.tsx` (+`.css`) | the 3-tab panel: add the tab header, un-gate it so it renders for all element types, host the Insert and Data panes |
| `Toolbar.tsx` — `tb--rail` half | the 58px icon rail (restyle; **all 13 element types stay**) |
| `Toolbar.tsx` — `tb--export` half | the editor topbar (breadcrumb, saved chip, undo/redo, export) |
| `pages/Canvas.tsx` | the app frame (sidebar + topbar); its inline styles become tokens |

**NEW (nothing exists to rebuild):** `Sidebar`, `Dashboard` page, `Templates` page.

Three new files, four rebuilt — not the ~10 new components §3.1 implied.

### A1.4 Structure fidelity, and the one place it forces a decision
The mockup dictates the **containers** exactly: sidebar, topbar, 58px rail, 300px
right panel with three tabs, stage, bottom bar. Our existing controls fill them.

Our editor has controls the mockup draws **no section for**: typography
(`TextFormatBar`), colour/opacity (`ElementFormatBar`), z-order/duplicate/delete
(`ElementQuickBar`), add-page, rulers, page size, bulk/email export.

Resolution: they live **inside the mockup's containers as additional sections** —
the Layout tab carries `Placement` (our X/Y), then `Typography`, then `Arrange`,
then `Bound to data`. The container structure stays pixel-faithful to the mockup;
the section list inside it is ours. This is the only arrangement where "exact
structure" and "no functionality loss" both hold.

Consequence: the **floating bars are retired**, because their contents now have a
home in the panel. Retire = stop rendering them and delete them **in a separate
commit, after the panel is verified** (safety rule: no deletion without explicit
confirmation).

### A1.5 Phases restated as rebuilds
Phase 0 (tokens) and Phases 1–3 (frame, Dashboard, Templates) are unchanged except
that Phase 1 **rebuilds `pages/Canvas.tsx`** rather than adding `AppShell.tsx`.

Phase 4 is restated:
- T4.1 Rebuild `Toolbar.tsx`'s `tb--export` half into the editor topbar. Same handlers.
- T4.2 Restyle `Toolbar.tsx`'s `tb--rail` half to the 58px rail. Same 13 types.
- T4.3 Rebuild `PropertiesPanel.tsx` into the tabbed panel (tab state only).
- T4.4 Insert pane inside it — delegates to the **existing** add-element callbacks.
- T4.5 Data pane inside it — hosts `DataStructureViewer` + placeholder list.
- T4.6 Layout pane — `Placement` (existing `PositionProperties`, X/Y), plus
  `Typography` (hosts `TextFormatBar`), `Arrange` (hosts `ElementQuickBar`),
  `Bound to data`. All existing components, re-hosted.
- T4.7 Stage/paper styling. T4.8 region frame labels. T4.9 hint chip.
- T4.10 Retire the floating bars **only once T4.6 is verified**, in its own commit.

Exit check (unchanged): every action reachable today is still reachable, in the same
number of clicks or fewer; `CanvasStartLayer` still owns the pristine canvas.

---

## AMENDMENT 2 (2026-07-13) — the Start Layer is superseded; Phase 0 must survive it

This **supersedes A1.4's** "`CanvasStartLayer` still owns the pristine canvas" and the
Phase 4 exit check above. Everything else in Amendment 1 stands.

### A2.1 Why it goes
The Start Layer (canvas-activation Phase 1) answers *"cold empty canvas, no visible
way in"*. The shell answers that earlier and better. After the shell, the **only** way
to reach an empty canvas is to click **New template** — which is already the user
answering "what do you want to make?". The layer then re-asks the question they
answered one click ago, and its own *Start blank* card exists only to dismiss the
interruption. The rail (13 tools) and the topbar (upload, AI) are already right there.

Card-by-card, every job has a better home:

| Start Layer card | New home |
|---|---|
| Start from a template | Templates page (sidebar) |
| Start blank | the **New template** button itself |
| Rebuild a PDF with AI | Dashboard → "Start something" |
| Start from your data | Dashboard → "Start something" |
| **Continue where you left off** | **Dashboard → restore card** (A2.3 — this one is load-bearing) |

### A2.2 What must be KEPT — Phase 0 in full, plus three Phase-1 survivors

**Phase 0 (trust) — keep entirely. None of it is layer-coupled:**
- `services/draftStore.ts` — `saveDraft(doc, userId, teamId)`, `restoreDraft(userId)`,
  `clearDraft(userId)`, `DraftRestore` (+ `draftStore.test.ts`)
- `utils/useUnsavedChangesGuard.ts` — beforeunload flush + prompt
- `utils/useUndoRedo.ts` — the savepoint (`markSaved`, `isAtSavepoint`, `reset`,
  `getLatest`, `isDirty`)
- `utils/documentDirty.ts` (`samePageSize`, `sameStringMap`) + test
- `utils/draftSchedule.ts` (`draftDeadline`, `nextDraftDelay`) + test
- All `TemplateCanvas` draft wiring: `savepoint` / `fieldsDirty` / `isDirty`,
  `buildCurrentDocument`, `markDocumentSaved`, `flushDraft` + `flushRef`, the
  max-wait autosave effect, the unmount flush, `clearDraftIfClean` +
  `handleUndo`/`handleRedo`, the `persistToCloud` race guard, `applyDocument`'s
  outgoing flush, `pageSizeRef` / `globalsRef` / team refs
- `scripts/run-tests.mjs` and `npm test`

**Phase 1 survivors — keep, they are not the layer:**
- `seedLayout.ts` + `seedLayout.test.ts` (**T1.7**) — "binding data must not end on an
  empty canvas" is a data-flow post-condition, not layer UI. Already correctly gated on
  `isCanvasPristine(pages)` alone (`TemplateCanvas.tsx:917`), not on layer visibility.
- `isCanvasPristine` in `startLayer.ts` — sole remaining consumer is the seeding gate.
- `makeRow` export in `model/layoutTable.ts` — consumed by `seedLayout`.
- Analytics `'draft_restored'` and `'data_bound'`.
- `canvas-empty-hint` (`TemplateCanvas.tsx:1350`) — becomes the **only** empty state.
  Correct register for someone who deliberately asked for a blank page.

### A2.3 The load-bearing dependency — read before deleting anything

**`CanvasStartLayer` is the only caller of `restoreDraft()` in the codebase.**

Remove the layer without a replacement and every line of Phase 0 keeps faithfully
writing drafts that **nothing can ever offer back** — the whole trust workstream
(user + team scoping, quota-skip, max-wait autosave, five review rounds) becomes dead
code, silently. This is the single reason this amendment exists.

The Dashboard restore card is that replacement. Its gates must be **preserved exactly**
as the layer implements them today (`TemplateCanvas.tsx:388-396`):
- the draft's `teamId` must equal the active team (**no cross-team leak**), and
- the draft is user-scoped by key (`restoreDraft(userId)`).

(The layer's third gate — `!isDirty` — is moot on the Dashboard: no document is open
there, so there is no live dirty state to confuse with a prior-session draft.)

**Ownership split (SOLID — the canvas keeps hydration):**
- The **Dashboard** decides whether to offer the draft and renders the card. It does
  **not** hydrate.
- The **canvas** keeps `applyDocument` as the one hydration path.
- The card signals intent (router state / query flag); the canvas restores from the
  draft on mount and logs `'draft_restored'`.

### A2.4 What is REMOVED
- `CanvasStartLayer.tsx` + `CanvasStartLayer.css`
- `shouldShowStartLayer` in `startLayer.ts` (and its cases in `startLayer.test.ts`;
  the `isCanvasPristine` cases stay)
- `TemplateCanvas` wiring: `startLayerDismissed`, `showStartLayer`, `priorDraft`,
  `continueDraft`, `startLayerShownLogged`, the `start_layer_shown` effect, and the
  JSX branch at ~1335 (the `canvas-empty-hint` branch becomes unconditional)
- Analytics `'start_layer_shown'` and `'start_layer_card_clicked'`

### A2.5 Tasks — Phase 5 (runs LAST, after Phases 1–4)
Order is not stylistic; it is what prevents a window in which Phase 0 is dead code.

- T5.1 Dashboard restore card, presentational: props are `savedAt`, `onContinue`,
  `onDiscard`. No logic.
- T5.2 Pure `offerableDraft(draft, activeTeamId): DraftRestore | null` — encodes the
  team gate. Unit-tested (same-team → offered; other-team → null; none → null).
- T5.3 Wire the card into the Dashboard: `restoreDraft(userId)` → `offerableDraft` →
  render. Continue navigates to the canvas with a restore signal; Discard calls
  `clearDraft(userId)`.
- T5.4 Canvas honours the restore signal on mount via the existing `applyDocument`;
  logs `'draft_restored'`.
- **T5.5 VERIFY end-to-end before touching the layer:** edit → crash/close → Dashboard
  offers the draft → Continue restores it. This is the gate for T5.6.
- T5.6 Only now: stop rendering `CanvasStartLayer`; make `canvas-empty-hint`
  unconditional; remove the dead wiring in A2.4.
- T5.7 Re-point the funnel: `'start_layer_card_clicked'` → Dashboard card events;
  drop `'start_layer_shown'`. Keep `'draft_restored'` and `'data_bound'`.
- T5.8 **Deletion is a separate commit, after T5.5 passes**, and requires explicit
  confirmation (safety rule: never delete files without it). Until then the files stay
  in the tree, merely unrendered.

Exit check (replaces Phase 4's): a draft written before a crash is offered on the
Dashboard and restores; a draft from another team is **not** offered; binding data on a
pristine canvas still seeds a layout; `npm test` green; no caller of `restoreDraft()`
was removed before its replacement was verified.

### A2.6 Cross-document consequence (rule f / j / k)
`CANVAS_ACTIVATION_ARCHITECTURE.md` §5 measures cold-start activation via
`start_layer_shown` / `start_layer_card_clicked`, and its Phase 1 declares the layer
shipped. Both become false when T5.6 lands. That doc needs its own **amendment**
(appended, not rewritten) recording that Phase 1's component was superseded by the
shell, that T1.6 relocated to the Dashboard, and that T1.7 survives unchanged. Do not
fork or restate its content here.

---

## AMENDMENT 5 (2026-07-14) — THE PREMISE WAS BACKWARDS. Corrected.

**This supersedes A1.4, A3.1, A3.2, A4.2 and the "Right panel: Layout tab" row of
§2.** Those said the floating format bars would retire into a properties panel.
**That is the opposite of the direction this codebase is going, and of what was
asked.** TC-0197 implemented the wrong direction and is reverted.

### A5.1 What is actually true
The floating bars are the editing model. `ElementFormatBar`'s own header says so:

> "It carries the FULL set of controls for each element type (image, box, line,
> barcode, radio, checkbox, date) plus quick table controls, so the Properties panel
> is no longer needed for these — **the panel is kept only for tables and charts**."

And commit **TC-0132** is literally *"properties panel changed to format bar"*. The
panel is **legacy**, mid-removal. I read the mockup's right-hand panel, assumed it
was the target, and inverted a migration that was already 90% finished.

Coverage today:
| Element | Editing surface |
|---|---|
| text, paragraph | `TextFormatBar` |
| image, box, line, table, barcode, radio, checkbox, date | `ElementFormatBar` |
| all | `ElementQuickBar` (z-order, duplicate, delete) |
| **chart** | **nothing but the panel** — it has no bar at all |

The panel's only live cases are the three the call-site gate allows: **layout table**
(advanced), **chart**, and **page-number text**. Everything else it contains
(`ImageProperties`, `LineProperties`, `BoxProperties`, `PositionProperties`,
`TypographyProperties`, `DateProperties`, `BarcodeProperties`,
`RadioCheckboxProperties`, `TextContentProperties`) is **unreachable dead code**.

### A5.2 The target
**The left properties panel is REMOVED.** Its three live cases move onto the
floating bar: controls already on the bar stay where they are, and the remaining
ones go behind a **⋯ (three dots)** button on the bar that opens a popover.

The mockup's right-hand Insert/Data/Layout panel is **not built**. The bars are the
editing model.

### A5.3 Phase 4, restated (replaces A3.2's slices)
- **4A** `FormatBarMore` — the ⋯ button + popover, shared by both bars.
- **4B** Route the three panel cases into it, re-housing the EXISTING components
  (rule g — they are moved, not rewritten):
  - table → `LayoutTableProperties` + `LayoutTableTypography`
  - chart → `ChartProperties` (and `chart` joins `ELEMENT_BAR_TYPES`; it is the only
    element with no bar today)
  - page-number text → `PageNumberProperties` (in `TextFormatBar`)
- **4C** Delete `PropertiesPanel.tsx`. `PropertiesPanel.css` STAYS — the property
  components still use its classes inside the popover.
- **4D** The dead property components are DELETED (confirmed 2026-07-14). Removing
  the panel orphaned ten of them — they had already been unreachable behind the old
  call-site gate, and after the panel went nothing imported them at all:
  `BarcodeProperties`, `BoxProperties`, `DateProperties`, `DateTypography`,
  `ImageProperties`, `LineProperties`, `PositionProperties`,
  `RadioCheckboxProperties`, `TextContentProperties`, `TypographyProperties`.
  Their functionality lives in `ElementFormatBar` / `TextFormatBar`; nothing was
  lost. `properties/` now holds only what is still rendered: `ChartProperties`,
  `LayoutTableProperties`, `LayoutTableTypography`, plus the shared
  `elementTypes`, `FontFamilyOptions` and `layoutTableCellHelpers`.
- **4E** The chrome (rail/topbar/stage) and `/canvas` joining the frame — unchanged
  from before, still last.
