# App Frame & Dashboard — Architecture

Status: proposed. Date: 2026-07-13.
Scope: **the persistent frame (sidebar + topbar) and the Dashboard page.** Nothing else.

Companions (do not fork them):
- `UI_UX_GAP_ANALYSIS.md` — what the mockup asks for vs what the codebase has.
- `APP_SHELL_RELAYOUT_ARCHITECTURE.md` — the editor re-layout, the Templates page, and
  the Start Layer retirement. **The Templates page and the Start Layer removal are owned
  there, not here.**
- `CANVAS_ACTIVATION_ARCHITECTURE.md` — Phase 0 trust fixes (the draft store).

---

## 0. The rule

Same discipline as the re-layout doc: **this adds no behaviour.** Every number the
Dashboard shows, and every action it offers, is already served by code in `main`. If a
tile has no data source today, it is not built. No new endpoint, no new table, no new
column ships under this document.

---

## 1. Current code behaviour (rule a)

**There is no frame.** `pages/Canvas.tsx` renders an ad-hoc fixed 52px bar built from
inline styles (a `UserMenu` and an "Integrations" button that navigates to `/settings`),
with `<TemplateCanvas />` beneath it. `pages/Settings.tsx` renders its own page chrome.
Routes live flat in `App.tsx`; the protected ones are `/canvas`, `/settings`, `/admin`.
There is no `/dashboard`, no sidebar, and no shared layout.

**There is no dashboard**, but the data for a truthful one already exists:

| Source | Gives us | Where |
|---|---|---|
| `usePlan()` | `plan`, `usage`, `loading`, `atLimit`, `limit`, `promptUpgrade` | `plan/PlanProvider.tsx:112` |
| `UsageSummary` | `templates{used,limit}`, `exportsThisMonth{used,limit}`, `aiBuildsThisMonth?{used,limit}` | `services/apiIntegration.ts:34` |
| `listTemplates('document')` | `TemplateSummary[]` = `{id, name, updated_at}`, **already ordered `updated_at desc`** | `services/templatesRepo.ts:38` |
| `restoreDraft(userId)` | `DraftRestore` = `{doc, savedAt, teamId}` | `services/draftStore.ts:76` |
| `UserMenu` | the account menu / avatar | `auth/UserMenu.tsx` |

**What does NOT exist, and therefore is not built here:** any read path for
`analytics_events` from the frontend (it is write-only in `src/`), any per-template
"documents generated" count, any "average batch time", and any data-source model. The
mockup shows all four. See `UI_UX_GAP_ANALYSIS.md` §3.2.

---

## 2. The frame

### 2.1 Structure
One layout component wrapping the app routes via a React-Router layout route:

```
src/frame/
  AppFrame.tsx      // sidebar + topbar + <Outlet/>. Owns NO domain state.
  Sidebar.tsx       // nav + plan card. Reads usePlan(). Presentational otherwise.
  TopBar.tsx        // page title/breadcrumb + an actions slot + UserMenu.
  frame.css         // tokens only, no hex literals
src/pages/
  Dashboard.tsx     // composes existing data only
```

**Refinement of `APP_SHELL_RELAYOUT_ARCHITECTURE.md` A1.3:** that amendment said
`pages/Canvas.tsx` becomes the app frame. It cannot — the frame is shared by four routes,
so it must be a layout route. What actually happens to `Canvas.tsx` is still a rebuild,
not a new layer: **its inline-styled bar is removed and its two controls move into the
frame** (`UserMenu` → topbar, "Integrations" → sidebar nav). `Canvas.tsx` shrinks to
rendering `<TemplateCanvas />`. Nothing is left behind to rot. That doc needs a one-line
amendment recording this (rule k).

### 2.2 Which routes get the frame
**In:** `/dashboard`, `/templates`, `/settings` — immediately.
**In, but later:** `/canvas` — only once the editor re-chrome lands (§4.5). Its bars are
viewport-fixed and would float over the frame at wrong offsets.
**Out:** the marketing routes (`/`, `/features`, `/pricing`, `/careers`, `/login`,
`/auth/callback`, `/invite`), `/admin` (own chrome, own guard), `/builder` (a separate
product surface with its own canvas).

**No page keeps its own header.** Both `Canvas.tsx`'s inline bar and `Settings.tsx`'s
`settings__bar` are removed; the frame's topbar is the app's only header (§4.5).

### 2.3 Nav
Dashboard · Templates · Integrations — then a **Workspace** group: Team · Settings.

- **Integrations** and **Team** are not new: `pages/Settings.tsx` already renders the
  Team card (members, invites, seats) and the API access / Webhooks / Push data cards,
  and the canvas's current "Integrations" button already navigates to `/settings`. These
  nav items point at surfaces that exist.
- **No "Editor" nav item.** The editor is reached by *action* — the **New template**
  button, or opening a template. A nav item would duplicate the button.
- **No "Data Sources" item.** No table, no model. Omitted, not faked.

### 2.4 Plan card
Bottom of the sidebar: plan name, an ACTIVE chip, and a usage bar from
`usage.templates`. Straight from `usePlan()`. `limit === null` means unlimited — render
the count with no bar rather than dividing by null.

---

## 3. The Dashboard

Top to bottom, and every row is defensible:

1. **Continue where you left off** — the draft restore card. **Owned by
   `APP_SHELL_RELAYOUT_ARCHITECTURE.md` A2.3/A2.5 (T5.1–T5.5).** This document supplies
   only its *host*. Load-bearing: `CanvasStartLayer` is currently the only caller of
   `restoreDraft()`, so until this card exists and is verified, the Start Layer must not
   be removed or all of activation Phase 0 becomes dead code.
2. **Stat tiles** — from `usage`, and nothing else (§4.1).
3. **Start something** — two action cards: *Rebuild a PDF with AI* and *Start from your
   data*. They open the **existing** modals via the launch intent (§5).
4. **Jump back in** — recent projects from `listTemplates('document')`, which is already
   sorted `updated_at desc`. Name + relative time only. **No document counts** — we do
   not have them.

Deliberately absent: the recent-generations feed, data health, and avg. batch time.

---

## 4. Caveats (rule b)

### 4.1 `aiBuildsThisMonth` is OPTIONAL — the third tile must degrade
`UsageSummary.aiBuildsThisMonth?` is marked "present on servers running the metered-AI
build" (`apiIntegration.ts:40`). A frontend deployed against an older server gets
`undefined`. The tile must therefore **not render at all** when the field is absent —
never `undefined / undefined`, never a 0-of-0 bar. Two tiles is a correct dashboard;
a lying third tile is not.

### 4.2 `limit: null` means unlimited
`{used, limit: null}` is the unlimited case, not a missing value. `used / null` is
`Infinity` in a progress bar. Guard it.

### 4.3 `usage` is `null` while loading, and may stay null
`usePlan()` exposes `loading`; `usage` is `null` until `GET /v1/usage` returns, and stays
null if it fails. Tiles need a skeleton and a failure state that does not render zeros —
a zero is a claim, and a wrong one.

### 4.4 The Dashboard must not become an analytics page
The moment someone asks for "documents generated per template" or an activity feed, they
are asking for a new backend read path. That is out of scope by definition (§6). Say no
and open a document.

### 4.5 The page headers are DELETED, not reconciled — and the editor is viewport-fixed
`/canvas` and `/settings` each draw their own header today and run independently. In the
new design **neither exists**: the frame's topbar is the only header in the app.

- `pages/Canvas.tsx` — its inline-styled 52px bar is removed. `UserMenu` → frame topbar;
  "Integrations" → sidebar nav item.
- `pages/Settings.tsx:333` — `<header className="settings__bar">` is removed. Its `<h1>
  Settings</h1>` becomes the frame topbar's title, and its **"Back to canvas" button is
  obsolete** — the sidebar is the navigation now.

The harder half: **the editor's chrome is `position: fixed` to the viewport, not laid
out.** All three pieces are anchored to the window, with offsets tuned to the very header
we are deleting:

| Element | Current | Tuned to |
|---|---|---|
| `Toolbar` `.tb` (actions/export) | `fixed; top:12px; right:16px; z-index:1001` | the 52px bar |
| `Toolbar` `.tb--rail` (elements) | `fixed; top:68px; right:16px` — comment: *"below the header"* (`Toolbar.css:29`) | the 52px bar |
| `PropertiesPanel` | `fixed; top:68px; right; z-index:999` | the 52px bar |

Delete the header and every one of those offsets is wrong. Add a 220px sidebar and they
are wrong in the other axis too — viewport-fixed elements know nothing about it. (Note
also that the rail is currently on the **right**; the mockup puts it on the left. That
move is owned by the re-layout doc, not this one.)

**Consequence for sequencing (§7):** `/canvas` cannot enter the frame while its chrome is
still viewport-fixed. It joins the frame **together with the editor re-chrome**
(`APP_SHELL_RELAYOUT_ARCHITECTURE.md` Phase 4), where those fixed bars become part of a
flex layout. Until then the frame wraps `/dashboard`, `/templates` and `/settings` only.
This is not a compromise — it removes the need for any temporary offset fudging, and no
route is ever left half-framed.

---

## 5. Canvas launch intent (the one new mechanism, and it carries no logic)

The Dashboard needs to open the canvas *and* have it do something on arrival (restore a
draft, open the AI modal, open the upload panel). It must not reach into the canvas to
do it.

**Contract:** the Dashboard declares an intent; the canvas executes it with handlers it
already has.

```ts
// src/frame/launchIntent.ts
export type CanvasLaunchIntent =
  | { kind: 'open-template'; templateId: string }
  | { kind: 'restore-draft' }
  | { kind: 'rebuild-ai' }
  | { kind: 'bind-data' }
```

**AMENDED 2026-07-13, before Phase 2 was written.** The original type was a bare string
union with no `open-template`, and the mechanism sat in Phase 3 — both wrong:

- **The canvas has no deep link.** `handleOpenCloudTemplate` (`TemplateCanvas.tsx:864`)
  is reachable *only* from the templates modal. So "Jump back in" (T2.3) cannot open the
  template it names without this mechanism, and a recent-projects list whose cards don't
  open their template is not worth shipping. **The mechanism therefore moves into
  Phase 2** (T2.0 below); Phase 3 keeps only the two action cards that need the other
  kinds.
- **A bare string cannot carry a template id**, so the type is now a discriminated union.
  It ships with only the member Phase 2 needs; Phase 3 and 4 add theirs.

Router state is `unknown` at runtime, so a pure `readLaunchIntent(state: unknown)`
validates it and returns `null` on anything unrecognised — a malformed or stale history
entry must never wedge the canvas (same contract as `restoreDraft`).

- Passed as router state when navigating to `/canvas`.
- The canvas consumes it **once** on mount and calls its existing handler:
  `restore-draft` → `applyDocument(draft.doc)`; `rebuild-ai` → `setRebuildAiOpen(true)`;
  `bind-data` → `setUploadPanelOpen(true)`.
- Ownership: the **Dashboard decides**, the **canvas executes**. No hydration logic
  leaves `TemplateCanvas`; no canvas state leaks into the Dashboard.

That is the entire mechanism. It adds no business rule — it is a typed string plus a
`useEffect` that calls functions that already exist.

---

## 6. Out of scope (rules h, i)

The Templates page (owned by the re-layout doc) · the Start Layer removal (same) · the
editor re-chrome (same) · data sources · the activity feed · per-template document
counts · avg. batch time · global search · favourites · any new endpoint, table, or
column · any change to an existing handler.

If a task appears to need one of these, stop and raise it. Do not grow a phase.

---

## 7. Phases

Each task is small and single-purpose (rule d); each new component is presentational
with dependencies pointing inward only (rule e).

### Phase 1 — The frame (`/settings` only; no Dashboard, no canvas yet)
`/settings` is the ideal first tenant: it is a plain page, it already has a header to
remove, and it has no fixed-position chrome to fight (§4.5).

- T1.1 `AppFrame.tsx`: sidebar + topbar + `<Outlet/>`. No domain state.
- T1.2 `Sidebar.tsx`: nav items + plan card (`usePlan()`). Active item from the route.
- T1.3 `TopBar.tsx`: title/breadcrumb, an actions slot, `UserMenu`.
- T1.4 Pure `navItems(): NavItem[]` + `isActive(path, route)` — unit-tested, no React.
- T1.5 `App.tsx`: layout route wrapping `/settings`.
- T1.6 Rebuild `pages/Settings.tsx`: **remove `settings__bar`** (`Settings.tsx:333`) —
  its `<h1>` becomes the frame's title and "Back to canvas" is obsolete. The page keeps
  every card (Plan · Team · API · Webhooks · Push data) untouched.

Exit check: Settings renders inside the frame with exactly one header; Team, API keys and
Webhooks all still work; keyboard-only nav works; `npm test` green.

**Phase 1 status (2026-07-13) — implemented.** `src/frame/`: `AppFrame.tsx` (T1.1),
`Sidebar.tsx` + plan card (T1.2), `TopBar.tsx` with an `actions` slot (T1.3),
`navModel.ts` + `navModel.test.ts` (T1.4), `frame.css`. `App.tsx` wraps `/settings` in a
layout route (T1.5). `Settings.tsx`'s `settings__bar` and its three CSS rules are removed
(T1.6); every card is untouched. `tsc -b` clean, ESLint clean, 30/30 tests.

Two deviations from the plan above, recorded rather than hidden (rule j):

1. **The sidebar nav currently lists only Settings.** §2.3 specifies Dashboard ·
   Templates · Integrations · Team · Settings. Those first four have no route yet
   (Dashboard is Phase 2; Templates is the re-layout doc's Phase 3), and a nav item that
   404s is worse than no nav item. `navModel.ts` is the seam: each becomes one entry in
   `NAV_ITEMS` in the same commit that lands its route. `navModel.test.ts` asserts every
   item points at a built route, so this cannot rot.
2. **`pageTitle(path)` was added** to `navModel.ts` — not named in T1.4. The frame's one
   header needs a title per route; keeping it as data beside the nav (rather than
   machinery in the TopBar) means the two cannot drift. Pure and covered by the same test
   file.

Not verified: the visual/keyboard pass behind auth (`/settings` is a protected route, so
it needs a signed-in session). Build, lint and unit tests are green.

### Phase 1b — `/canvas` joins the frame
**Blocked on `APP_SHELL_RELAYOUT_ARCHITECTURE.md` Phase 4** (rail, panel and topbar stop
being viewport-fixed). Do not attempt earlier — see §4.5.

- T1b.1 Rebuild `pages/Canvas.tsx`: delete the inline-styled bar. `UserMenu` and
  "Integrations" are the frame's now. The file becomes `<TemplateCanvas />`.
- T1b.2 Add `/canvas` to the layout route.
- T1b.3 The editor's title + Save/Export/undo/redo render into the frame topbar's
  actions slot (existing handlers, re-housed).

Exit check: one header; the canvas has no viewport-fixed chrome left; every editor action
reachable today is still reachable.

### Phase 2 — Dashboard: usage + recent
- T2.0 `launchIntent.ts` — the union (§5) with its `open-template` member, plus pure
  `readLaunchIntent(state: unknown)`. Canvas consumes it once on mount and calls the
  **existing** `handleOpenCloudTemplate` with a record from `getTemplate(id)`. Moved here
  from Phase 3: T2.3 cannot work without it (§5, amended).
- T2.1 Pure `usageTiles(usage: UsageSummary | null): Tile[]` — encodes §4.1 and §4.2:
  omits `aiBuildsThisMonth` when absent, handles `limit: null`, returns `[]` when
  `usage` is null. **Unit-tested; this is where the honesty lives.**
- T2.2 `StatTile.tsx` — presentational.
- T2.3 `RecentProjects.tsx` — `listTemplates('document')`, already sorted. Name +
  relative time. A card opens its template in the canvas via T2.0.
- T2.4 `/dashboard` route; add it to the frame and to `NAV_ITEMS`; make it the post-login
  landing (the `'/canvas'` default in `Login.tsx:107` and `AuthCallback.tsx:28`).
- T2.5 Loading skeleton + failure state that renders no numbers (§4.3).
- T2.6 Empty state for an account with no templates.

Exit check: no number on the page comes from anywhere but `usage` / `listTemplates()`;
with a server lacking `aiBuildsThisMonth`, two tiles render and nothing is `undefined`;
a recent card opens *that* template; a direct `/canvas` visit with no intent behaves
exactly as today.

**Phase 2 status (2026-07-13) — implemented.**
`frame/launchIntent.ts` + test (T2.0); `pages/dashboard/usageTiles.ts` + test (T2.1);
`StatTile.tsx` (T2.2); `RecentProjects.tsx` (T2.3); `pages/Dashboard.tsx` +
`dashboard.css`; `/dashboard` in the frame's layout route and in `NAV_ITEMS`; post-login
default moved from `/canvas` to `/dashboard` in **both** places (`Login.tsx:107`,
`AuthCallback.tsx:28`) — `?next=` still wins, so deep links survive login (T2.4).
Skeleton + "usage unavailable" state render **no numbers** (T2.5); empty state for a new
account (T2.6). `TemplateCanvas` consumes the intent once per mount and calls the
**existing** `handleOpenCloudTemplate` with a record from `getTemplate(id)`.
`tsc -b` clean; ESLint on the canvas is byte-identical to its baseline (13 errors, 4
warnings — all pre-existing `any`); 45/45 tests.

Two additions beyond the task list, recorded rather than hidden (rule j):

1. **`utils/relativeTime.ts` (+ test)** — the recent list needed "3 hours ago", and
   `CanvasStartLayer.savedAgo` was already the exact same function. Rather than write a
   second copy, it was **extracted and both now call it** (rule g: fix the existing code,
   do not layer a parallel one). It also pre-empts a third copy when the draft-restore
   card lands.
2. **`template.openFailed`** locale key — the intent path can fail (a deleted template,
   a network error) and reusing `template.readError` would have described the wrong
   failure.

Not verified: the visual/keyboard pass. `/dashboard` is behind `ProtectedRoute`, so it
needs a signed-in session. Build, lint and unit tests are green.

### Phase 3 — Launch intent + "Start something"
- T3.1 `launchIntent.ts` — the type (§5).
- T3.2 Canvas: consume the intent once on mount; call the existing handler. No new logic.
- T3.3 Dashboard: the two action cards (AI, data) dispatch intents.
- T3.4 `New template` (sidebar) → `/canvas`, no intent.

Exit check: each card lands in the canvas with the right modal open; a direct visit to
`/canvas` with no intent behaves exactly as today.

**Phase 3 status (2026-07-13) — implemented.**
T3.1: the union gains `{kind:'rebuild-ai'}` and `{kind:'bind-data'}`; `readLaunchIntent`
validates them via a `BARE_KINDS` allow-list, so an unknown `kind` still returns null.
T3.2: the canvas's mount effect is now a `switch` calling the **existing**
`setRebuildAiOpen(true)` / `setUploadPanelOpen(true)` — no new logic, and the union makes
the switch exhaustive, so a future intent kind cannot be silently forgotten.
T3.3: `StartActions.tsx` — two cards, presentational, dispatching intents.
T3.4 shipped in Phase 1 (the sidebar's New template button already navigates to `/canvas`
with no intent).
`tsc -b` clean; ESLint clean on new files and byte-identical to baseline on the canvas
(17 pre-existing problems, none added); 46/46 tests.

No drift from the task list. One deliberate omission: **no analytics events on these
cards.** The activation doc's funnel (`start_layer_card_clicked`) is re-pointed by
`APP_SHELL_RELAYOUT_ARCHITECTURE.md` **T5.7**, which owns that change; adding events here
would fork it (rules h, k).

Not verified: the visual/keyboard pass — `/dashboard` is behind `ProtectedRoute` and
needs a signed-in session. **Three phases are now unverified behind auth**; a signed-in
pass should happen before Phase 4 adds the draft-restore card, whose whole value is that
it fires after a crash.

### Phase 4 — Draft restore card (host only)
The card itself is **T5.1–T5.5 of `APP_SHELL_RELAYOUT_ARCHITECTURE.md`**. This phase
only mounts it at the top of the Dashboard and verifies it end-to-end. **The Start Layer
must not be removed until this passes** (A2.3).

Exit check: a draft written before a crash is offered here and restores; a draft from
another team is not offered; `clearDraft` on Discard.

**Phase 4 status (2026-07-13) — code complete, NOT yet verified.**
`ContinueDraft.tsx` at the top of the Dashboard (T5.1/T5.3): it offers the draft, and on
Continue navigates to `/canvas` with a `restore-draft` intent; Discard calls
`clearDraft`. The canvas restores through its **existing** `applyDocument` and logs
`draft_restored` (T5.4). `tsc -b` clean; ESLint clean on new files and byte-identical to
baseline on the canvas; 51/51 tests.

**T5.5 (verify end-to-end) is NOT done — it is auth-gated. The Start Layer therefore
must NOT be retired yet (relayout T5.6).** That ordering is the whole point of A2.3: the
layer is still the only *proven* restore surface.

Design decisions worth recording:

1. **`offerableDraft(draft, activeTeamId)` lives in `draftStore.ts`** (T5.2) and is now
   used by **both** the Dashboard card and the canvas. `TemplateCanvas`'s inline
   `priorDraft.teamId === activeTeamId` check was replaced by it (rule g: fix the
   existing code, don't add a parallel copy), so the surface that *offers* a draft and
   the surface that *restores* it cannot disagree about what is safe.
2. **`useActiveTeamId` (new, `utils/`) reports `loading` separately from `teamId`.**
   Extracted from the canvas, which had the only copy. This is not cosmetic: the lookup
   is async, so on first render `teamId` is null — and null is *also* the legitimate "no
   team" answer. A caller that cannot tell them apart compares the draft against a
   not-yet-resolved null and **silently withholds a draft it should have offered**. Both
   the card and the canvas's restore branch now wait for `loading` to settle. The other
   launch intents do not read the team and are not held up by it.
3. **The draft never rides in router state.** A document can embed base64 images and
   router state is serialised into the history entry, so `restore-draft` carries no
   payload; the canvas re-reads the draft from storage on arrival.
4. **The canvas re-checks `offerableDraft` rather than trusting the Dashboard.** The
   intent survives in the history entry, so a back/forward navigation could replay it
   after the active team changed. If the draft is no longer offerable it says so
   (`draft.restoreUnavailable`) instead of restoring the wrong team's work.

---

## 8. Definition of done

The frame and Dashboard ship, and `git diff` shows **no new endpoint, no schema change,
and no modification to any existing handler**. The only logic this document adds is
three pure, unit-tested functions — `navItems`/`isActive` (T1.7) and `usageTiles`
(T2.1) — plus a typed string and one `useEffect` (§5).

If the diff shows more, this document has been violated.


---

## AMENDMENT (2026-07-14) — Phase 1b done: /canvas is in the frame

§2.2 and §4.5 said `/canvas` could not be framed while its chrome was viewport-fixed.
That is resolved for the header; the rail is next.

**What changed (TC-0202)**
- `pages/Canvas.tsx` is now just `<TemplateCanvas />`. Its fixed 52px header — a
  `UserMenu`, an "Integrations" button, both inline-styled, plus a 52px spacer — is
  deleted. The UserMenu lives in the frame's header; Integrations is a nav item.
- `/canvas` moved into the frame's layout route.
- **`frame/FrameActions.tsx`** is the new seam. `TopBar` is rendered by `AppFrame`,
  *above* the `<Outlet/>`, so a page cannot pass it anything by props. `AppFrame` now
  publishes the header's actions container through context and the page portals into
  it. The editor keeps ownership of its buttons and handlers — only where they LAND
  changes. Outside the frame the portal renders in place, so nothing is dropped.
  The slot is React **state**, not a ref: a ref would still be null on the page's
  first render and the toolbar would silently never appear.
- `Toolbar`'s `.tb--export` half portals up. Its CSS stops being
  `position: fixed; top: 12px` — kept fixed, it would float *over* the header it is
  meant to be part of.
- `pageTitle('/canvas')` → **"Editor"**. The editor is reached by action, not by nav,
  so it has no nav item — but the one header still has to name it, or it renders
  under a blank title. Pinned by a test.

**Not done, and still true from §4.5:** the tool rail is still
`position: fixed; right: 16px` — it floats on the RIGHT of the canvas. The mockup puts
it on the left at 58px. Moving it is the next slice; it is a real layout change (the
rail must become a flex child instead of a viewport-fixed pill), not a restyle.

The floating format bars (`.tfb`) stay fixed and centred over the canvas — they are
the editing model (relayout Amendment 5) and are not part of the frame.
