# `/v1/generate` — deferred refactors

`POST /v1/generate` (Step 1 of `WEBHOOK_CONNECTOR_ARCHITECTURE.md`) was added as a
**self-contained** router (`backend/routes/apiGenerate.js`) so no existing shared
module had to change yet. To stay standalone it restates a few things that already
exist elsewhere. None of these are bugs; they are **intentional, tracked
duplications** to clean up when we deliberately choose to touch the shared modules.

Until then, if you change the original in any item below, mirror it in
`routes/apiGenerate.js`.

---

## 1. Export entitlement check (the most important one)

- **Original:** `usage.checkExportAllowed({ authHeader, mode, rows, format, delivery })`
  resolves the team **from a JWT**, then checks capability + per-job row ceiling +
  monthly cap and computes `watermark`.
- **Restated as:** `checkEntitlement(teamId, format)` in `apiGenerate.js`
  (`assertFormatAllowed` + `assertUnderMonthlyCap` + watermark), because the API
  path has a `teamId`, not a JWT. It only covers the single-document case.
- **Consolidation:** extract the JWT-free core into
  `usage.evaluateExportEntitlement({ teamId, plan, mode, rows, format, delivery })`
  and have **both** `checkExportAllowed` (JWT) and a new
  `checkExportAllowedForTeam({ teamId, … })` delegate to it. Then delete
  `checkEntitlement` here and call `checkExportAllowedForTeam`.
- **Risk if it drifts:** the API path could under-/over-enforce caps relative to the
  browser path.

## 2. API-key auth sequence  — _partly done_

- **Now shared:** `requireApiTeam` / `httpError` / `sendError` live in
  `backend/lib/apiAuth.js` and are used by both `/v1/generate` and `/v1/webhooks`.
- **Still inlined:** the app's own `/v1/ingest` in `routes/teamApi.js` repeats the
  same sequence (extract key → `resolveTeamFromApiKey` → `planAllows('api')` →
  `getAdmin`).
- **Remaining consolidation:** point `/v1/ingest` at `lib/apiAuth.requireApiTeam`
  too. (Deferred only because it edits the pre-existing route.)

## 3. Template + bindings loaders

- **Original:** `/v1/ingest` loads `templates` (tenant check) and reads
  `template_bindings.field_mapping` inline.
- **Restated as:** `loadTemplate` / `loadBindings` in `apiGenerate.js`
  (`loadBindings` also returns collection/table maps, normalised to camelCase).
- **Consolidation:** share both loaders; `/v1/ingest` can use `loadBindings` and
  read `.fieldMapping`.

## 4. Team-attributed usage logging

- **Original:** `analytics.logExportEvent(authHeader, metadata)` derives the team
  from the JWT and inserts a `pdf_exported` event.
- **Restated as:** `logExport(sb, teamId, metadata)` in `apiGenerate.js` — a direct
  `analytics_events` insert with `user_id: null` (allowed by the schema/RLS).
- **Consolidation:** add `analytics.logExportEventForTeam(teamId, metadata)` and
  call it here.

---

## Bigger, separate decision — unifying browser + API assembly

`backend/lib/templateAssembly.js` reconstructs server-side the small payload the
browser builds at `src/.../TemplateCanvas.tsx` (`exportPages`) +
`dataSourceService.ts` (`generatePayload`). The heavy engine (`normalisePayload`,
`buildRowIr`, the renderers) is **already shared** — only the ~30-line *reshaping
contract* is now stated in two places.

This is unavoidable for a headless API (there is no browser to assemble in the
Zapier flow). The optional way to remove even the small duplication is to route the
browser's **saved-template** exports through the server assembler too (browser sends
`templateId` + any unsaved edits; server assembles). That changes the existing
browser generate flow and is a deliberate later step ("move assembly server-side"),
**not** part of Step 1.
