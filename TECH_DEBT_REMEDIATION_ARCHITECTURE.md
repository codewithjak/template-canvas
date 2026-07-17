# Technical Debt Remediation Architecture

Status: DRAFT (Phase 0 not started)
Owner: (assign)
Created: 2026-07-17
Scope: structural risks that become catastrophic under growth (team size, feature velocity, horizontal scale). This doc is remediation, not a new product feature. It touches five identified hotspots and nothing else.

This doc follows the project architecture rules. It describes current behavior alongside the target architecture, lists future caveats, and breaks the work into phases whose tasks are small, self-explanatory, and dependency-reducing. Per rule (k) the original body below is fixed once approved; later changes are appended as amendments, never edited in place.

---

## 0. Why this doc exists

Five structural debts were located by reading the code, not by grep-ing for TODO markers (there are only 7 TODO/FIXME markers in the whole tree, so the debt is structural and invisible to comment scans). Ranked by blast radius:

| # | Debt | Evidence | Becomes catastrophic when |
|---|------|----------|---------------------------|
| R1 | Editor and renderer share an **untyped, unvalidated document contract** | `src/types/canvas.ts` (TS) defines `CanvasElement`; `backend/renderer/pdfLibRenderer.js` (plain JS, 1222 lines) re-consumes the same shape via `e.type === ...` in ~20 places; `/generate-document` does no structural validation | Any field rename/add on either side ships green and breaks exported documents silently in production |
| R2 | **God component** `TemplateCanvas.tsx` | 1586 lines, 32 `useState`, 10 `useEffect`, 187 arrow consts, 54 imports, most-churned file in last 100 commits (15 touches), zero tests | Every editor change risks unrelated regressions; merges conflict; core is untestable |
| R3 | `types/canvas.ts` is a **coupling magnet carrying logic** | imported by 23 files; also exports `migrateV1(json: any)`, `createPage`, `ensurePageDefaults`, `syncRepeatFlag` | A type edit ripples across 23 modules; versioning has no forward path beyond one `any`-typed function |
| R4 | **In-memory bulk-job store** | `backend/lib/bulkJobs.js` uses module-level `const jobs = new Map()`, artifacts in `os.tmpdir()` | Restart/crash loses all jobs; second backend instance cannot see jobs run by the first |
| R5 | **Scope sprawl** couples unrelated subsystems | 13 route modules (cloud deploy/run/drift, webhooks, whatsapp, teams, admin, agent), 77 env vars, one `index.js` wiring all of it plus a ~150-line inline generate handler; `builder/graph/packs/cloud/compile.ts` is 830 lines | A fault in the cloud-builder path can take down document export because they share one process, config, and deploy |

Secondary signals (folded into the phases above, not given their own phase): 39 `any` in `src` against the zero-`any` rule (12 in `TemplateCanvas.tsx`), and 37 test files for ~298 source files with none on the two heaviest files.

Guiding constraints from project rules that shape every task below:
- Rule (g): existing buggy code is fixed in place with explanation, never wrapped in a new compensating layer.
- Rule (i): do not over-engineer. No shared-types monorepo, no message bus, no microservice split. The smallest change that removes the failure mode wins.
- Rule (e): each task reduces dependency and isolates one responsibility.

---

## 1. R1 — Editor/renderer document contract (highest priority)

### 1a. Current behavior

The element shape exists twice, agreed only by convention:

- Frontend: `src/types/canvas.ts` defines `CanvasElement` as a discriminated union on a `type` string (`'text' | 'image' | 'line' | 'box' | 'paragraph' | 'radio' | 'checkbox' | 'date' | 'barcode' | 'chart'`). Tables live separately in `src/model/layoutTable.ts`.
- Backend: `backend/renderer/pdfLibRenderer.js`, `elementDrawers.js`, `textLayout.js`, `zplRenderer.js` consume that shape in untyped JS, switching on `e.type === 'text'`, `case 'box'`, `case 'chart'`, and even `el.type === 'table' && el.schemaVersion === 2` (a shape the frontend union does not fully own).
- Boundary: `backend/index.js` `/generate-document` accepts a 50mb JSON body and passes it to the renderer. The only validation is `validateBindings`, which checks data mapping, not element structure.

Failure mode: a frontend edit compiles clean while the JS renderer drops or mis-draws the element. There is no compile-time link and no runtime guard across the seam.

### 1b. Target architecture

One authoritative contract, validated at the backend boundary, with a single documented list of consuming sites.

- Introduce `src/types/canvasContract.ts`: the pure element/document interfaces only (moved out of `canvas.ts`, see R3), with **no runtime code**. This is the single source of truth for shape.
- Generate a runtime validator from that contract. Do not hand-write a parallel schema (that would just recreate the drift). Use one lightweight approach: derive a JSON Schema from the TS types at build time, or define the schema once and infer the TS type from it. Pick whichever adds the fewest dependencies (evaluate in Phase 1, Task 1.1). Rule (i): no validation framework beyond what the boundary needs.
- Backend validates every inbound document at the route boundary (`/generate-document`, `/generate-bulk-documents`, `/v1/generate*`) before it reaches the renderer. On failure it returns a structured 422 naming the offending element `id` and field, never a silent draw.
- The renderer keeps its `switch (el.type)`, but an exhaustiveness check (a `default:` that records an unknown-type error) turns an unhandled variant into a visible error instead of a blank region.

### 1c. Future caveats

- The FE build (Vite) and the BE (`require` CommonJS) do not share a module system today. The contract must be consumable by both without forcing a bundler on the backend. A generated JSON Schema file committed to the repo satisfies both and avoids a build coupling. Revisit if the backend later moves to ESM/TS.
- `layoutTable` and the `schemaVersion === 2` table path must be brought into the same contract or explicitly documented as a separate, versioned sub-contract. Do not leave it half-owned.
- Validation adds latency to a 50mb payload path. Validate structure (cheap) but not every cell value; keep the check O(elements), not O(data rows).

### 1d. Phases

Phase R1.1 — Establish the contract (no behavior change)
- Task 1.1: Evaluate the two low-dependency options (TS to JSON Schema generator vs. schema-first with inferred types) and record the choice in an amendment. One decision, written down.
- Task 1.2: Extract pure element/document interfaces into `canvasContract.ts`. Re-export from `canvas.ts` so no importer breaks yet. Small mechanical move.
- Task 1.3: Produce the committed schema artifact from the contract. Add an `npm run check:contract` that fails if the schema is stale relative to the types (mirrors the existing `check:connect-stack` pattern).

Phase R1.2 — Validate at the boundary
- Task 2.1: Write `validateDocumentShape(doc): Result<Document, ShapeError[]>` in `backend/lib/`. Pure function, one responsibility, returns errors, never throws.
- Task 2.2: Call it at the top of `/generate-document`. Return 422 with the error list on failure. Do not touch the renderer.
- Task 2.3: Repeat for `/generate-bulk-documents`, `/generate-bulk-documents/async`, and `routes/apiGenerate*.js`. Same function, three call sites.

Phase R1.3 — Make renderer gaps loud
- Task 3.1: Add an exhaustiveness `default:` branch in each `switch (el.type)` in `pdfLibRenderer.js` that pushes an unknown-type error onto a per-render error list. Fix the existing switch in place (rule g), do not wrap it.
- Task 3.2: Surface that render error list in the response so an unhandled element is observable in tests and logs.

Exit check (rule j): a deliberate mismatch (add a field the renderer ignores) is caught by `check:contract` or the 422 path, verified by a test.

---

## 2. R2 — Decompose `TemplateCanvas.tsx`

### 2a. Current behavior

`src/components/TemplateCanvas/TemplateCanvas.tsx` centralizes editor state (32 `useState`), effects (10 `useEffect`), and 187 inline handlers. It imports 54 modules and is the most-churned file in the repo. It has no test because it cannot be mounted in isolation.

### 2b. Target architecture

Extract cohesive state groups into custom hooks so the component becomes a thin composition layer. This is the Single Responsibility Principle applied to React state, and it makes each group unit-testable.

- Group the 32 states by concern (candidate groups to confirm in Phase 1: selection/interaction, page/layout, export/delivery, draft/persistence, modal visibility, upload/data).
- Each group becomes a hook `useX()` returning a small typed state-plus-actions object. Hooks live beside the component.
- The component composes the hooks and renders. Target: the file no longer holds raw `useState` for extracted groups.

### 2c. Future caveats

- Effects have hidden ordering dependencies (draft save vs. dirty tracking vs. history). Extract one group at a time and keep behavior identical; do not merge or reorder effects while moving them (rule g: fix/move in place, prove no change).
- The 12 `any` usages here are exactly the risky spots; type them as part of the extraction, not as a separate sweep.
- Do not introduce a global store (Redux/Zustand) for this. That is over-engineering (rule i); local hooks are enough.

### 2d. Phases

Phase R2.1 — Map before moving
- Task 1.1: Produce a state inventory (each `useState`/`useEffect` to its concern group) as an amendment. No code change.

Phase R2.2 — Extract one hook end to end as the template
- Task 2.1: Extract the lowest-risk group (candidate: modal visibility) into `useEditorModals()`. Pure move, identical behavior.
- Task 2.2: Add a unit test for that hook. This proves the pattern and gives the first test on this surface.

Phase R2.3 — Extract remaining groups, one per task
- Task 3.x: One hook per group, each its own task and commit (rule: small incremental commits). Type away the `any` in each group as it moves.

Exit check (rule j): `TemplateCanvas.tsx` line count and `useState` count drop materially, every extracted hook has a test, behavior unchanged (verified against the app, not just types).

---

## 3. R3 — Split `types/canvas.ts` into types vs. behavior

### 3a. Current behavior

`canvas.ts` is imported by 23 files and mixes pure types with behavior (`migrateV1`, `createPage`, `createTemplateDocument`, `ensurePageDefaults`, `syncRepeatFlag`, `defaultHeader`, `defaultFooter`). `migrateV1(json: any)` is the only version path and is typed `any`.

### 3b. Target architecture

- `canvasContract.ts` (created in R1.1): pure interfaces/unions only. The 23 importers that need types point here.
- `canvasFactories.ts`: the `create*`/`default*`/`ensure*` builders. Importers that need behavior point here.
- `canvasMigrations.ts`: versioned migration functions. Replace the single `migrateV1(json: any)` with `migrate(json: unknown, from: SchemaVersion): TemplateDocument`, a small ordered chain, `unknown` at the boundary and narrowed with a type guard. Fix the existing function in place (rule g), do not add a second migrator alongside it.

### 3c. Future caveats

- The re-export shim from R1.2 keeps old import paths working during the transition; remove it only after all 23 importers are repointed, in a final task, so no big-bang break.
- Do not invent versions that do not exist. Only `1` and `2.0` are real today; the chain models what is there, nothing speculative (rule i).

### 3d. Phases

Phase R3.1 — Types out (done as R1.1 Task 1.2).
Phase R3.2 — Behavior out
- Task 2.1: Move factories to `canvasFactories.ts`, keep re-exports. Mechanical.
- Task 2.2: Move migration to `canvasMigrations.ts`; retype `any` to `unknown` plus a guard; keep behavior identical, add a test for the 1 to 2.0 path.
Phase R3.3 — Repoint importers
- Task 3.x: Update importers in small batches, then delete the shim. Confirmed with a build.

Exit check: `canvas.ts` no longer exports runtime code; no importer references it for behavior; `any` gone from the migrator.

---

## 4. R4 — Persist the bulk-job store

### 4a. Current behavior

`backend/lib/bulkJobs.js` holds jobs in a module-level `const jobs = new Map()` and writes zips to `os.tmpdir()`. Job state and artifacts are per-process and ephemeral. Comment in the file already notes the singleton assumption.

### 4b. Target architecture

Replace the in-memory `Map` and tmp artifacts with a durable store behind the same interface, so callers do not change.

- Define a `JobStore` interface (get, put, updateStatus, listStale). One responsibility: job persistence. This is the Dependency Inversion boundary (rule e): `index.js` depends on the interface, not the `Map`.
- Provide two implementations: the existing `Map` (kept for tests/local, fixed in place per rule g) and a durable one (the project already uses Supabase and S3 per the deploy notes; reuse those rather than adding infra, rule i). Job rows in Postgres, zip artifacts in S3.
- Swap the implementation by config, default to durable in production.

### 4c. Future caveats

- This is the prerequisite for horizontal scale. Do it before adding a second backend instance, not after (the failure is invisible on one box).
- Artifact lifecycle (TTL/cleanup) moves from tmp-dir eviction to explicit deletion; model it so old zips do not accumulate in S3.
- Long-running async jobs need a status source of truth that survives restart; the durable store is that source.

### 4d. Phases

Phase R4.1 — Interface seam
- Task 1.1: Extract `JobStore` interface; make the current `Map` implement it. No behavior change.
Phase R4.2 — Durable implementation
- Task 2.1: Implement `SupabaseJobStore` (rows) plus S3 artifact read/write. Small functions per operation.
- Task 2.2: Config switch, default durable in prod, `Map` in test.
Phase R4.3 — Lifecycle
- Task 3.1: Artifact TTL/cleanup for the durable store.

Exit check: kill and restart the backend mid-job; job status and download survive. Verified against a running instance.

---

## 5. R5 — Contain scope sprawl (boundary, not rewrite)

### 5a. Current behavior

One Express app (`backend/index.js`) wires 13 route modules spanning document generation, cloud infra deploy (`cloudDeploy/Run/Drift/Deployments`), webhooks, whatsapp, teams, admin, agent, connector. 77 env vars. `builder/graph/packs/cloud/compile.ts` (830 lines) is effectively a second product. Everything shares one process, config surface, and deploy, so a cloud-builder fault can degrade document export.

### 5b. Target architecture

Draw a hard module boundary. This is not a microservice split (that would be over-engineering today per rule i); it is isolation so failures do not cross.

- Group routers into two domains at the app level: `core` (parse, generate, bulk, teams, admin, contact) and `cloud` (cloudConnect/Run/Drift/Deployments/Agent/Deploy/Architect, connector, webhooks). Mount each behind a domain prefix and a top-level error boundary so an unhandled error in one cannot crash the other's requests.
- Extract the ~150-line inline `/generate-document` handler in `index.js` into `routes/generate.js` (Single Responsibility). Fix by moving in place, not wrapping (rule g).
- Document the env-var surface per domain so it is clear which 77 belong to which subsystem; do not delete any, just map them.

### 5c. Future caveats

- If the cloud domain later needs its own scaling/deploy, this boundary is the seam to split on. Do not pre-split now.
- Keep shared middleware (auth, cors, body limit) at the root; only domain routers and their error boundaries move.

### 5d. Phases

Phase R5.1 — Extract the inline handler
- Task 1.1: Move `/generate-document` body into `routes/generate.js`. Behavior identical, verified.
Phase R5.2 — Domain grouping
- Task 2.1: Introduce `core` and `cloud` router groups with per-group error boundaries in `index.js`.
Phase R5.3 — Config map
- Task 3.1: Document env vars by domain in an amendment.

Exit check: a forced throw in a cloud route returns a clean 500 for that route only; core generate requests are unaffected.

---

## 6. Sequencing across the five debts

Priority order is R1, then R4, then R2, then R3, then R5, matching blast radius and the deploy roadmap (single Lightsail box today, so R4 must land before any scale-out; R1 protects the revenue path immediately). R3 Phase R3.1 is shared with R1 Phase R1.1 (the type extraction), so R1 pulls R3 forward naturally. Each phase is independently shippable and leaves the tree green; nothing here is a big-bang migration.

Per rule (f) and (j): when a phase completes, update this doc (as an amendment) to mark it done and confirm the implementation did not drift from the phase as written.

---

## 7. Out of scope (explicit, per rule h)

- No shared-types monorepo or package extraction.
- No state-management library for the editor.
- No microservice split of the cloud domain.
- No renderer rewrite; the `switch (el.type)` stays, it only gains validation and an exhaustiveness guard.
- No new infra beyond the Supabase/S3 already in use.

---

## Amendments
(Append only. Do not edit sections 0 to 7 above. Each amendment: date, phase, what changed, drift check result.)

- (none yet)
