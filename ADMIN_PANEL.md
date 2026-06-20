# Admin Panel (isolated feature)

A standalone platform-admin panel at **`/admin`** where a platform operator can:

1. See every account in the system (newest signups first).
2. Grant a plan (in particular **Business**) to any account by email.

This is the UI replacement for the one-off `backend/scripts/setPlan.js` script.

---

## Design goal: complete isolation

This feature is intentionally built so it can be **added or removed without
touching or risking any existing flow**. Everything lives in two self-contained
folders:

```
backend/admin/     ← all server code
src/admin/         ← all client code
```

The only edits to pre-existing files are **two one-line additions**, each tagged
with the comment marker `[ADMIN PANEL]` so they are trivial to find and delete:

| File | The single added line |
|------|-----------------------|
| `backend/index.js` | `app.use(require('./admin'));            // [ADMIN PANEL]` |
| `src/App.tsx`      | one `<Route path="/admin" …>` + its import `// [ADMIN PANEL]` |

No database migrations. No changes to auth, teams, plans, usage, or the standalone
`setPlan.js` script. The admin code only *imports* (read-only) two stable
infrastructure helpers — `resolveTeamFromJwt` and `getAdmin` — it never modifies
them.

---

## Access control

Admin access is gated by a comma-separated allow-list in the backend environment:

```
# backend/.env
ADMIN_EMAILS=you@example.com,teammate@example.com
```

- The gate is enforced **server-side** in `backend/admin/middleware.js`
  (`resolveAdmin`). It verifies the Supabase JWT (reusing `resolveTeamFromJwt`)
  and 403s unless the caller's email is in `ADMIN_EMAILS`.
- The frontend `AdminRoute` guard and the `useIsAdmin` hook only decide what UI
  to *show*. They are cosmetic — every admin API route re-checks server-side, so
  a non-admin hitting the endpoints directly is always rejected.

> Production: `ADMIN_EMAILS` must be set on the **deployed** backend environment
> (App Runner / Lightsail), not just the local `.env`.

---

## Architecture

### Backend — `backend/admin/`

| File | Responsibility |
|------|----------------|
| `middleware.js` | `resolveAdmin(authHeader)` — JWT verify + `ADMIN_EMAILS` gate |
| `setPlan.js`    | `setPlanForEmail(email, plan)` — find profile → resolve owned team → update `teams.plan` (self-contained copy of the script's logic) |
| `users.js`      | `listAllUsers()` — every profile with its team, plan, role, signup date |
| `index.js`      | Express router exposing the routes below; the file you mount |

**Routes** (all under the existing API origin, JWT-authed, admin-gated):

| Method & path | Purpose |
|---------------|---------|
| `GET  /v1/admin/me`        | `{ isAdmin: boolean }` — lets the client decide whether to render the panel (returns `false` instead of 403 so the UI can branch) |
| `GET  /v1/admin/users`     | `{ users: [...] }` — all accounts, newest first |
| `POST /v1/admin/set-plan`  | body `{ email, plan }` → sets that account's team plan |

### Frontend — `src/admin/`

| File | Responsibility |
|------|----------------|
| `adminApi.ts`    | `fetchIsAdmin()`, `fetchUsers()`, `setUserPlan()` — fetch helpers using `API_BASE` + `authHeaders()` |
| `useIsAdmin.ts`  | hook that probes `GET /v1/admin/me` |
| `AdminRoute.tsx` | route guard: requires a session **and** `isAdmin`; otherwise redirects |
| `AdminPage.tsx`  | the page — searchable user table + per-row plan control + quick grant-by-email |
| `AdminPage.css`  | scoped styles |

---

## Why a duplicated `setPlanForEmail` (not a shared refactor)

The standalone `backend/scripts/setPlan.js` is deliberately **left untouched**.
Sharing logic between it and the admin module would couple the two, which works
against clean removal. The ~15 lines are duplicated on purpose so that deleting
`backend/admin/` leaves the CLI script — and everything else — fully intact.

---

## Removal procedure

To remove the feature entirely, with no residue:

1. `rm -rf backend/admin/ src/admin/`
2. Delete the `[ADMIN PANEL]` line in `backend/index.js`.
3. Delete the `[ADMIN PANEL]` `<Route>` and its import in `src/App.tsx`.
4. (Optional) Unset `ADMIN_EMAILS` in the environment — harmless if left.

No migrations to reverse, no shared code to untangle. Existing flows are
unaffected because they never depended on any of it.

---

## Not included (kept out for isolation)

- **No nav link** in `UserMenu`/header — admins navigate to `/admin` directly.
  (Adding a conditional link later is a one-line change but is deliberately
  excluded from the isolated baseline.)
- **No audit-log table** — to avoid leaving rows behind after removal. If an
  audit trail is wanted later, add a dedicated `admin_audit` table that can be
  dropped alongside the feature.
