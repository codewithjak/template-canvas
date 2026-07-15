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
export type CanvasLaunchIntent = 'restore-draft' | 'rebuild-ai' | 'bind-data'
```

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
- T2.1 Pure `usageTiles(usage: UsageSummary | null): Tile[]` — encodes §4.1 and §4.2:
  omits `aiBuildsThisMonth` when absent, handles `limit: null`, returns `[]` when
  `usage` is null. **Unit-tested; this is where the honesty lives.**
- T2.2 `StatTile.tsx` — presentational.
- T2.3 `RecentProjects.tsx` — `listTemplates('document')`, already sorted. Name +
  relative time. Opens the canvas.
- T2.4 `/dashboard` route; add it to the frame; make it the post-login landing.
- T2.5 Loading skeleton + failure state that renders no numbers (§4.3).
- T2.6 Empty state for an account with no templates.

Exit check: no number on the page comes from anywhere but `usage` / `listTemplates()`;
with a server lacking `aiBuildsThisMonth`, two tiles render and nothing is `undefined`.

### Phase 3 — Launch intent + "Start something"
- T3.1 `launchIntent.ts` — the type (§5).
- T3.2 Canvas: consume the intent once on mount; call the existing handler. No new logic.
- T3.3 Dashboard: the two action cards (AI, data) dispatch intents.
- T3.4 `New template` (sidebar) → `/canvas`, no intent.

Exit check: each card lands in the canvas with the right modal open; a direct visit to
`/canvas` with no intent behaves exactly as today.

### Phase 4 — Draft restore card (host only)
The card itself is **T5.1–T5.5 of `APP_SHELL_RELAYOUT_ARCHITECTURE.md`**. This phase
only mounts it at the top of the Dashboard and verifies it end-to-end. **The Start Layer
must not be removed until this passes** (A2.3).

Exit check: a draft written before a crash is offered here and restores; a draft from
another team is not offered; `clearDraft` on Discard.

---

## 8. Definition of done

The frame and Dashboard ship, and `git diff` shows **no new endpoint, no schema change,
and no modification to any existing handler**. The only logic this document adds is
three pure, unit-tested functions — `navItems`/`isActive` (T1.7) and `usageTiles`
(T2.1) — plus a typed string and one `useEffect` (§5).

If the diff shows more, this document has been violated.
