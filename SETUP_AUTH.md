# Mapdoc Auth Setup (Milestone 1: Google login + gated canvas)

This wires up **Supabase** (managed Postgres + Auth) with **Google OAuth**.
Teams exist in the schema but are not surfaced in the UI yet — every new user
silently gets a personal team.

Code is already in the repo. The steps below are the **manual, one-time setup**
only you can do (creating cloud accounts + secrets).

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> → **New project**.
2. Pick a name, region, and a database password (save it somewhere).
3. Wait for it to finish provisioning (~1–2 min).

## 2. Run the database schema

1. In the Supabase dashboard: **SQL Editor → New query**.
2. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql).
3. Click **Run**. You should see "Success".

This creates `profiles`, `teams`, `memberships`, `invites`, `templates`,
the RLS policies, and the trigger that auto-provisions a profile + personal
team on every new signup.

## 3. Create Google OAuth credentials

1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → OAuth consent screen** → configure (External, app name,
   support email). Add your email as a **Test user** while in testing mode.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized redirect URI** — paste the Supabase callback URL, found in
     Supabase under **Authentication → Providers → Google** (looks like
     `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`).
4. Copy the **Client ID** and **Client secret**.

## 4. Enable Google in Supabase

1. Supabase → **Authentication → Providers → Google** → enable.
2. Paste the **Client ID** and **Client secret** from the previous step → save.

## 5. Set the app's redirect URLs in Supabase

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `http://localhost:5174`
- **Redirect URLs:** add
  - `http://localhost:5174/auth/callback`
  - (later, your production URL + `/auth/callback`)

> The dev server runs on port **5174** (see `vite.config.ts`). Adjust if yours
> differs.

## 6. Add the client env vars

1. Copy the template:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in from Supabase → **Project Settings → API**:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
   ```
   (The `anon` public key is safe for the browser — RLS is what protects data.)

## 7. Run it

```bash
npm run dev
```

- Open the app → click **Launch App** / **Open Mapdoc**.
- You hit the `/canvas` gate → **Continue with Google** → Google consent →
  redirected back → you land on the canvas.
- A `profiles` row, a `teams` row, and an owner `memberships` row are created
  automatically (check the Supabase Table Editor).
- **Sign out** is in the canvas top bar.

---

## How the pieces fit

| Concern | Where |
| --- | --- |
| Session source of truth | Supabase client (`src/services/supabaseClient.ts`) — persists + refreshes tokens |
| Auth state for React | `src/auth/AuthContext.tsx` (`useAuth()`) — mirrors the session, never stores the credential |
| Sign-in gate (modal) | `src/auth/AuthModal.tsx` |
| Route protection | `src/auth/ProtectedRoute.tsx` wraps `/canvas` in `src/App.tsx` |
| OAuth redirect landing | `src/pages/AuthCallback.tsx` (`/auth/callback`) |
| DB schema + tenancy + RLS | `supabase/schema.sql` |

## Template persistence (Milestone 2 — done)

Templates now save to the Supabase `templates` table, scoped to the user's
team via RLS:

- **Save** (toolbar 💾) → writes the current canvas to the cloud. First save
  creates a row; later saves update the same row. A toast confirms.
- **My Templates** (toolbar 📚) → lists the team's saved templates; open or
  delete any of them. Everyone on the team sees the same list.
- **Load** (toolbar ⬇) still imports a `.json` file from disk (unchanged).

Code: `src/services/templatesRepo.ts` (CRUD), `src/services/teamService.ts`
(resolves the active team), `src/components/TemplateCanvas/TemplatesLibraryModal.tsx`.

> Note: the old Save behaviour (download a `.json` file) was replaced by cloud
> save. File **import** via Load still works for bringing in external templates.

## What's next

- Phase 3: surface teams — invites, roles, team switcher (schema already supports it).
- Optional: add magic-link login for non-Google users.
- Optional: re-add a "Download JSON" export action if you still want offline copies.
