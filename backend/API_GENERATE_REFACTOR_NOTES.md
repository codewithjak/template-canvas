# API/connector layer — refactor log

Tracks the consolidations around the API-key routes (`/v1/generate`, `/v1/ingest`,
`/v1/webhooks`, `/v1/me`, `/v1/hooks/*`). Originally these were built
self-contained so no shared module had to change; this file records what has
since been consolidated and what remains.

---

## Done — shared-module consolidation (was "A 1–4")

1. **Export entitlement** — extracted `usage.evaluateExportEntitlement({ teamId,
   plan, … })`; `checkExportAllowed` (JWT) and the new `checkExportAllowedForTeam`
   (API key) both delegate to it. `/v1/generate` now calls
   `checkExportAllowedForTeam` instead of a local copy. One enforcement source.

2. **API-key auth** — `requireApiTeam` / `httpError` / `sendError` live in
   `lib/apiAuth.js` and are used by `/v1/generate`, `/v1/webhooks`, `/v1/connector`
   **and** `/v1/ingest` (the last inlined copy is gone).

3. **Template + bindings loaders** — `lib/templateStore.js` (`loadTemplate`,
   `loadBindings`) is shared by `/v1/generate` and `/v1/ingest`.

4. **Team-attributed logging** — `analytics.logExportEventForTeam(teamId, metadata)`
   replaced the direct insert that `/v1/generate` had inlined.

---

## Remaining

5. **Validation helpers (cosmetic)** — `routes/webhooks.js` (`parseEndpointInput`)
   and `routes/connector.js` (`requireHttpUrl` / `requireKnownEvent`) repeat the
   `^https?://` URL check and event-name validation. Move both next to the
   catalogue (`webhooks/events.js`, or a small `webhooks/validate.js`).

6. **Test Supabase fakes (cosmetic)** — each e2e test file defines its own
   in-memory Supabase query-builder. Extract one `test/helpers/fakeSupabase.js`
   (the stateful builder in `connector.e2e` / `v1-ingest.e2e` is the most capable)
   and reuse it.

7. **Job registry → durable + team-aware (Step 2)** — `backend/index.js`: stamp
   `team_id`/`source` on async jobs, stop delete-on-download, move artifacts to S3
   with a signed URL, and fire `bulk.completed` from the async completion site.
   This necessarily edits existing code; it is the substance of Step 2.

8. **Unify browser ↔ API assembly (separate decision)** — `lib/templateAssembly.js`
   restates the ~30-line payload-shaping the frontend does
   (`TemplateCanvas.tsx` `exportPages` + `dataSourceService.generatePayload`). The
   engine (`normalisePayload`, renderers) is already shared. Removing the small
   remaining duplication means routing the browser's **saved-template** exports
   through the server assembler — a deliberate "move assembly server-side" step
   that changes the existing browser flow. Not Step 2; its own decision.
