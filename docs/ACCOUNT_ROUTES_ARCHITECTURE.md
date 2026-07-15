# Account Routes Architecture — Integrations · Team · Settings

Splitting today's single `/settings` page into three real routes, each owning one
concern:

| Route           | Owns                                                        |
| --------------- | ----------------------------------------------------------- |
| `/integrations` | API key · Webhooks · Quickstart guide                       |
| `/team`         | Members · Invites · Seats · Team switcher                   |
| `/settings`     | Plan · Usage — and future account config                    |

---

## 1. Current behaviour

### 1.1 One page, six cards

`src/pages/Settings.tsx` (442 lines) is a single route, `/settings`, that renders
six stacked cards from one component:

1. **Plan** — plan name, price, Upgrade button → `/pricing`.
2. **Team** (`TeamCard`, defined inside the same file) — team switcher, members,
   pending invites, seats, invite form. Gated on `can('teams')`.
3. **API access** — issue / rotate / revoke the team API key. Gated on `can('api')`.
4. **Webhooks** (`src/pages/WebhooksCard.tsx`) — rendered only when `can('api')`.
5. **Usage** — templates used, PDF exports this month.
6. **Push data** — a `curl` snippet. Gated on `can('api')`.

The page fetches `getApiKeyMeta()` and `getUsage()` together in one `Promise.all`;
`TeamCard` and `WebhooksCard` fetch their own data independently.

### 1.2 Integrations and Team are anchors, not routes

`src/frame/navModel.ts` lists Integrations as `/settings#api` and Team as
`/settings#team`. They are hash anchors into the one page. Three pieces of
machinery exist **only** to support that:

- **`isActive(itemPath, currentPath)`** (`navModel.ts:68`) is fed the pathname
  *plus the hash* from `Sidebar.tsx:59`, because the hash is the only thing that
  distinguishes the three nav items from each other.
- **`pageTitle()`** (`navModel.ts:101`) must filter out any item whose `to`
  contains `#`, or `/settings#team` resolves to the first item whose route is
  `/settings` — "Integrations" — and the header names the wrong page.
- **A scroll effect** in `Settings.tsx:288` calls `scrollIntoView` on the hash,
  because a router navigation does not scroll to an anchor the way a page load
  does. It depends on `loading` as well as `hash`, since the cards are absent
  from the DOM while the page fetches.

`navModel.test.ts` pins this hash behaviour (lines 26–36).

### 1.3 Why this is the thing to change

The anchor design was a deliberate shortcut (app-frame doc §2.3: "Integrations
and Team are not new — Settings already renders those cards"). Its cost is now
visible: a user who clicks **Team** lands on a page whose header says "Settings",
scrolls past Plan, and sees API keys and webhooks below their invite form. Three
unrelated concerns share one scroll container, one loading state, and one file.

Giving each concern a route **removes** the machinery in §1.2 rather than adding
to it. That is the test this design has to pass.

---

## 2. Target architecture

### 2.1 Routes

Three sibling routes inside the existing `AppFrame` + `ProtectedRoute` layout
group in `App.tsx`:

```
/integrations   → pages/Integrations.tsx
/team           → pages/Team.tsx
/settings       → pages/Settings.tsx
```

Top-level, not nested under `/settings/*`: Integrations and Team are destinations
in their own right (they are top-level sidebar items), not sub-pages of Settings.
`/settings` keeps its path, so no existing link breaks.

### 2.2 Feature folder

A new `src/account/` folder, following the existing convention of `src/frame/`,
`src/plan/` and `src/admin/` — a feature owns its own directory:

```
src/account/
  account.css            ← moved from pages/Settings.css (unchanged rules)
  SectionCard.tsx        ← the `Card` shell + the header icon set
  PlanSection.tsx        ← plan name, price, Upgrade
  UsageSection.tsx       ← the usage bars
  TeamSection.tsx        ← moved out of Settings.tsx's TeamCard
  ApiKeySection.tsx      ← moved out of Settings.tsx's API access card
  WebhooksSection.tsx    ← moved from pages/WebhooksCard.tsx
  QuickstartSection.tsx  ← the curl snippet + links to the connect guides
  useApiKey.ts           ← the API-key fetch/issue/revoke hook

src/pages/
  Settings.tsx           → <PlanSection/> <UsageSection/>
  Team.tsx               → <TeamSection/>
  Integrations.tsx       → <ApiKeySection/> <WebhooksSection/> <QuickstartSection/>
```

Every section is **moved, not rewritten** (rule g). The JSX, the class names, the
gating and the service calls inside each card are the ones that ship today.

### 2.3 Where state lives

Each section fetches what it alone needs, so a page is a thin composition and
there is no god-loader whose one `loading` flag blocks unrelated cards:

- `TeamSection` — already self-fetching today. Unchanged.
- `WebhooksSection` — already self-fetching today. Unchanged.
- `UsageSection` — calls `getUsage()` itself. (Today the parent does.)
- **API key** is the one exception: `ApiKeySection` and `QuickstartSection` both
  need the key, and fetching it twice would be wasteful and could disagree. So
  `useApiKey()` owns that state and is called **once, by `Integrations.tsx`**,
  which passes what each section needs down as props. One fetch, one source of
  truth, no prop drilling past a single level.

### 2.4 Plan gating is unchanged

- `/integrations` — without `can('api')`, `ApiKeySection` shows the existing
  upsell and `WebhooksSection` / `QuickstartSection` do not render. Same
  conditions as today, just relocated.
- `/team` — without `can('teams')`, `TeamSection` shows the existing Business-plan
  copy. The team **switcher** still renders regardless, as it does today.

The pages are routable by anyone signed in; gating stays inside the sections.
No new capability, no new endpoint, no backend change anywhere in this work.

### 2.5 The Integrations guide

`QuickstartSection` shows the three steps that already exist as scattered
knowledge — issue a key, push JSON (the `curl` snippet moved verbatim from the
Push data card), receive a webhook — and names the no-code tools (Zapier, n8n,
Make) that connect through the same webhook.

Per-tool setup steps are **not** re-authored in React. Two copies of the Zapier
instructions would drift, and the markdown in `docs/CONNECT_*.md` is the one that
is maintained.

**Caveat — no hosted docs yet.** Those guides are markdown in the repo, not served
anywhere the app can link to. So the section does not fabricate a URL; it names the
tools and points at the Webhooks section on the same page. When a docs site exists,
turning the tool names into links is a one-line change here and nowhere else.

### 2.6 Nav model, simplified

`navModel.ts` changes from anchors to routes:

```ts
{ id: 'integrations', label: 'Integrations', to: '/integrations', group: 'main' },
{ id: 'team',         label: 'Team',         to: '/team',         group: 'workspace' },
{ id: 'settings',     label: 'Settings',     to: '/settings',     group: 'workspace' },
```

Three deletions follow directly, and they are the point of the exercise:

1. `Sidebar.tsx` passes `pathname` alone to `isActive`, not `${pathname}${hash}`.
2. `pageTitle()` drops its `!item.to.includes('#')` filter — with no anchored
   items left, no item can shadow another, and each route now titles itself
   ("Integrations", "Team", "Settings").
3. `Settings.tsx` loses the hash `scrollIntoView` effect entirely.

`routeOf()` stays: `defaultSidebarCollapsed()` uses it, and it is correct for any
future anchored link.

---

## 3. Caveats

1. **Old `/settings#api` and `/settings#team` links go stale.** They will land on
   `/settings` and show Plan + Usage, with no error. The only producer of those
   links was our own sidebar, so no redirect shim is added — a hash-reading
   redirect would resurrect exactly the hash coupling §2.6 deletes.

2. **`Settings.css` is renamed to `account.css` and moves.** It is imported by
   both `Settings.tsx` and `WebhooksCard.tsx` today; after the move all sections
   import it from `src/account/`. The CSS rules themselves are not touched — the
   `.scard`, `.srow`, `.usage`, `.field`, `.btn` classes stay exactly as they are.

3. **`/settings` becomes a thin page** (Plan + Usage). That is intended: it is the
   home for the account config that does not exist yet (billing details, defaults,
   notification preferences). It should not be padded to look full.

4. **Three sections now fetch on their own route instead of one page fetching for
   all of them.** Net requests per visit go *down* (visiting `/team` no longer
   fetches API-key meta and usage), but a user who walks all three pages issues
   the same calls they do today.

---

## 4. Phases

### Phase 1 — Extract the sections (no behaviour change)

| Task | Description |
| ---- | ----------- |
| T1.1 | Create `src/account/`. Move `pages/Settings.css` → `account/account.css` verbatim. |
| T1.2 | `SectionCard.tsx` — the `Card` component and the `I` icon set, lifted from `Settings.tsx:33–82`. |
| T1.3 | `TeamSection.tsx` — `TeamCard` lifted from `Settings.tsx:95–267`, unchanged. |
| T1.4 | `WebhooksSection.tsx` — `pages/WebhooksCard.tsx` moved, import path updated. |
| T1.5 | `useApiKey.ts` + `ApiKeySection.tsx` — the key state and the API access card lifted from `Settings.tsx`. |
| T1.6 | `PlanSection.tsx`, `UsageSection.tsx` (`UsageBar` + its own `getUsage()` call), `QuickstartSection.tsx`. |

Exit check: `npm run build` clean; nothing imports `pages/WebhooksCard` or
`pages/Settings.css` any more.

### Phase 2 — Three pages, three routes

| Task | Description |
| ---- | ----------- |
| T2.1 | `pages/Integrations.tsx`, `pages/Team.tsx`; `pages/Settings.tsx` reduced to Plan + Usage and its hash effect deleted. |
| T2.2 | `App.tsx` — add `/integrations` and `/team` to the framed, protected group. |
| T2.3 | `navModel.ts` — anchors → routes; drop the `#` filter in `pageTitle()`. |
| T2.4 | `Sidebar.tsx` — pass `pathname` to `isActive`, not `pathname + hash`. |
| T2.5 | `navModel.test.ts` — replace the hash assertions (lines 26–36) with route assertions: each of the three lights up alone, and the header titles each page correctly. |

Exit check: `npm test` green; the sidebar highlights exactly one item on each of
the three routes; the header reads "Integrations" / "Team" / "Settings".

### Phase 3 — The guide

| Task | Description |
| ---- | ----------- |
| T3.1 | `QuickstartSection` — three numbered steps (issue key → push JSON → receive webhook) around the moved `curl` block, plus the links out to the connect docs. |

Exit check: an API-less team sees the upsell and no guide; a Business team can
follow the page top to bottom and make a first call.

---

## 5. Status (amendment)

Phases 1–3 implemented in one pass. What landed, against the plan above:

- **Phase 1** — sections extracted into `src/account/`: `SectionCard` (+ `sectionIcons`,
  split out so the card module stays component-only for react-refresh),
  `PlanSection`, `UsageSection`, `TeamSection`, `ApiKeySection`, `useApiKey`,
  `WebhooksSection` (moved from `pages/WebhooksCard.tsx`), `QuickstartSection`.
  `account.css` moved from `pages/Settings.css` unchanged.
- **Phase 2** — `/integrations`, `/team`, `/settings` are three routes in the framed,
  protected group. `navModel` carries routes not anchors; `pageTitle` lost its `#`
  filter and `Sidebar` no longer appends the hash. The hash `scrollIntoView` effect
  is gone. `navModel.test.ts` rewritten to assert per-route highlight + titles.
- **Phase 3** — `QuickstartSection` ships the three-step guide. Per §2.5's caveat it
  names Zapier / n8n / Make rather than linking to an unbuilt docs site.

Verified: `npm run build` clean, `npm test` 68/68, `npm run lint` unchanged from
master (54 problems, all pre-existing). Not yet driven in a live browser session
(routes are auth-gated); the render tree is type-checked by the build and the nav
behaviour is covered by `navModel.test.ts`.
