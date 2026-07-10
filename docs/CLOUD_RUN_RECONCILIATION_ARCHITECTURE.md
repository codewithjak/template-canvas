# Run Reconciliation: durable, restart-surviving run resolution

> **Status:** Proposal / Design
> **Date:** 2026-07-09
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the in-account runner)
> **Companions:** `CLOUD_DRIFT_ARCHITECTURE.md` (the drift worker is the reconciler
> pattern to reuse), `docs/CLOUD_LOCAL_AGENT_ARCHITECTURE.md` (deploy runs)

---

## 1. Goal

Every cloud run (plan / apply / drift / deploy) must reach a **correct terminal
state** — `applied`/`planned`/`error` — even if the server restarts mid-run or the
CodeBuild build outlives the in-process poll. Today a run's terminal state depends
on a single, un-awaited, in-memory async call; if that call dies or times out, the
run is either **stuck forever** or **falsely marked `error`** while the real build
succeeds in the customer's account.

This is not a deploy bug. It is a property of the **shared runner** and affects all
four run kinds. The fix belongs in the shared layer, once.

---

## 2. Current behavior (what exists today)

### 2.1 The fire-and-forget shape (all four kinds)

Each route responds `202` and then calls an async runner **without awaiting it**:

| Route | Line | Un-awaited call |
|---|---|---|
| `routes/cloudRun.js` | 71 | `runPlanAsync(...)` |
| `routes/cloudRun.js` | 114 | `runApplyAsync(...)` |
| `routes/cloudDrift.js` | 80 | `runDriftAsync(...)` |
| `routes/cloudDeploy.js` | 169 | `runDeployAsync(...)` |

The run row is created `running`/`applying`; the async fn is the **only** thing that
will ever move it to a terminal state (via `history.updateRun`).

### 2.2 The two failure modes

- **A — Orphaned on restart.** The async fn holds all progress in memory. A deploy or
  server restart mid-run leaves the row at `running`/`applying` **forever** — nothing
  reconciles it. Applies to every kind.
- **B — False `error` on a slow build.** `runBuild` (`runner.js:125`) and `runDeploy`
  (`deploy.js`) both poll `120 × 5s = 600s`, then unconditionally `GET` the result and
  **throw** if it isn't there (`runner.js:133`, `deploy.js`). A build slower than 600s
  exits the loop while still `IN_PROGRESS`, the result isn't uploaded yet, and the run
  is marked `error` — **even though the in-account CodeBuild build keeps running and
  applies the change.** So Mapdoc records failure for a success (and, for apply/deploy,
  a real infra change lands that the UI denies).

### 2.3 The missing hook

**`buildId` is never persisted.** `runBuild`/`runDeploy` return it, but nothing writes
it to the run row. So even if we wanted to recover, there is currently no durable
handle to the CodeBuild build. This is the single missing primitive.

---

## 3. Design principle: fix the shared runner, not each route

`runBuild` (used by plan/apply/drift) and `runDeploy` (deploy) are the two places that
start a build and poll it. Both have the identical bug. Per `claude.md` rule (g) — *fix
the existing code, do not add another layer* — the reconciler and the `buildId`
persistence live in the **shared runner + run-history layer**, and every route inherits
the fix. We do **not** bolt a reconciler onto one route.

SOLID framing (rule e): a run has two responsibilities that are currently fused —
*starting* a build and *resolving* it. Split them. Starting persists a durable handle;
resolving is a separate, idempotent step that any actor (the inline poll OR the sweep)
can perform against that handle. That separation is what makes restart-recovery possible.

---

## 4. The model

A run becomes a **durable, reconcilable record**, not an in-memory promise:

```
start:    create run (running) + persist { buildId, region, result_key }   ← durable handle
resolve:  given the handle, ask CodeBuild the terminal state and finish the row
          - SUCCEEDED  → fetch result, mark terminal (planned/applied/…)
          - FAILED/STOPPED → mark error
          - IN_PROGRESS   → leave; a later resolve finishes it
```

Two actors call `resolve`, and it is **idempotent** (safe to run twice, no-ops on an
already-terminal row):

1. **The inline poll** (fast path) — resolves the common case in-process, for low latency.
2. **The reconciler sweep** (durable path) — resolves anything the inline poll left
   non-terminal (restart-orphaned, or slower than the poll window).

Terminal state now comes from CodeBuild's actual status via the persisted handle —
never from "the in-process timer gave up."

> **buildStatus must be authoritative for this model to hold.** The plan/drift
> buildspecs previously ended with `> result.out || true`, which swallowed a terraform
> error into a **SUCCEEDED** build carrying an empty diff — so `resolve` would mark it
> `planned`/"in sync", masking the failure. The buildspecs now capture terraform's exit
> code, upload the result, then `exit $ec`, so a plan/apply/refresh error is a **FAILED**
> build → `error`. `resolveBuild` only fetches+interprets a result on `SUCCEEDED`; every
> other terminal status (and SUCCEEDED-with-no-result) is a failure.

**Why no locking is needed (single instance).** The handle sweep only touches a row once
it has been non-terminal for longer than `GRACE` **measured from `build_started_at`** (the
moment the inline poll began), and `GRACE > the inline-poll window (600s)`. So by the time
the sweep looks at a row, the inline poll has **provably already exited** — the two actors
never operate on the same row concurrently. Idempotency then reduces to a trivial **status
guard** (`resolve` no-ops if the row is already terminal); no row locking is required until
we run multiple backend instances (§9). *(This proof requires the grace anchor to be
build-start, not row-create — see §5 on why `created_at` fails it for deploy.)*

---

## 5. Data model

`cloud_runs` gains the durable handle (nullable; only set for real, non-simulated runs):

```sql
alter table public.cloud_runs add column if not exists build_id         text;   -- CodeBuild build id
alter table public.cloud_runs add column if not exists build_region     text;   -- where to query it
alter table public.cloud_runs add column if not exists result_key       text;   -- S3 key of the uploaded result
alter table public.cloud_runs add column if not exists build_started_at timestamptz; -- when StartBuild fired
```

- `result_key` lets `resolve` fetch the uploaded result **without** re-deriving it —
  the runner already computes this key; today it is thrown away.
- **`build_started_at` is stamped at the build-phase TRANSITION — the moment the row
  enters `running` (plan/drift, at `createRun`) or `applying` (apply/deploy, at the
  status update), just BEFORE `StartBuild`.** It is the grace anchor for **both** sweeps.
  Two reasons it is the transition and not `created_at`:
    - `created_at` ≠ build-start for **apply and deploy**: an apply reuses the plan row
      (created much earlier) and a deploy row is created at `staging` before the user
      calls `/run`. Anchoring GRACE on `created_at` would make a run orphan/sweep-eligible
      the instant its build actually started — breaking §4's no-locking invariant and,
      for the orphan sweep (§7.2), falsely erroring a live in-flight build.
    - It is the transition and not `StartBuild` (setBuildHandle) so it is **present even
      for a null-handle orphan** — a crash in the `StartBuild → setBuildHandle` window
      leaves `build_id` null but `build_started_at` set, which is exactly what lets the
      orphan sweep age it out correctly (§7.2). The transition → `StartBuild` gap is
      sub-second, so `build_started_at ≈ build-start` holds for all four kinds.
  A null `build_started_at` on a non-terminal row therefore means "never entered the
  build phase" (e.g. a Path-1 CLI deploy Mapdoc doesn't run) — left untouched by both sweeps.

No new table — this is the same "runs are the durable ledger" principle as the drift
and deployment work.

---

## 6. The runner split (Phase 1 core)

Small, single-purpose functions (rule d), replacing the fused start-and-poll:

- **`startBuild(args) → { buildId, resultKey }`** — assume role, presign the result
  URL, `StartBuild`, return the durable handle. Does **not** poll. (Extracted from the
  top of `runBuild`.)
- **`resolveBuild(sb, teamId, run) → terminal?`** — given a run with a `build_id`:
  `BatchGetBuilds`; if terminal, fetch `result_key` and parse; update the row; return
  whether it finished. Idempotent (returns early if the row is already terminal).
- **`runBuild` keeps its signature** but is now `startBuild` + a bounded inline poll
  that calls `resolveBuild`. On timeout it does **not throw `error`** — it leaves the
  run non-terminal for the sweep. (This is the fix to failure mode B, in place, per rule g.)

The route async fns (`runPlanAsync` etc.) shrink to: `startBuild` → persist the handle
→ inline-poll `resolveBuild`. If the process dies between persist and resolve, the sweep
takes over — because the handle is in the DB.

**Ordering matters — persist the handle (`build_id`, `build_region`, `result_key`,
`build_started_at = now()`) as the immediate next statement after `StartBuild`
returns.** There is an unavoidable window between the run entering its build state (row =
`running` for plan/apply/drift, `applying` for deploy — `staging` is the *pre-build* wait,
never this window) and persisting the handle, during which `build_id` is null. A crash in
that window leaves a
`running` row the handle-based sweep (§7) would skip — and worse, the crash could land
*after* `StartBuild` launched a real CodeBuild build but *before* the handle was saved,
leaving a build in the customer's account that nothing reconciles. Minimizing the window
(persist immediately) shrinks the odds; the **null-handle orphan sweep (§7.2) is the
backstop** that guarantees such a row still reaches a terminal state.

---

## 7. The reconciler (Phase 2) — mirror `driftWorker`

A durable sweeper, the same proven shape as `backend/cloud/driftWorker.js`: idempotent,
overlap-guarded (`workerBusy`), `unref`'d, no in-memory schedule (everything from the DB
so it survives restarts). No cross-instance claim (single-instance caveat, same as the
webhook/drift workers).

The sweep has **two facets**, because a stuck run can have a handle or not:

### 7.1 Handle sweep — resolve runs that have a `build_id`

```
resolveSweep(sb):
  rows = cloud_runs where status in ('running','applying')
         and build_id is not null
         and build_started_at < now() - GRACE     (from BUILD-START, not row-create; don't race a healthy inline poll)
         order by build_started_at asc, limit BATCH
  for each row: resolveBuild(sb, row.team_id, row)   (per-row try/catch; one bad row can't stall the sweep)
```

A `build_id`-bearing row is always post-`StartBuild`, so its status is `running`/`applying`,
never `staging` (which is pre-build by definition, §7.2).

### 7.2 Null-handle orphan sweep — the create→persist-window backstop

A row can be stuck with **`build_id` null**: a crash between `createRun` and persisting
the handle (§6). The handle sweep (§7.1) filters `build_id is not null` and would skip it
forever — so a second, more conservative rule is required (this is what makes §8.A's "any
restart" actually true, not over-claimed):

```
orphanSweep(sb):
  rows = cloud_runs where status in ('running','applying')   -- NOT 'staging' (see below)
         and build_id is null
         and build_started_at is not null                 -- entered the build phase
         and build_started_at < now() - ORPHAN_TTL     (ORPHAN_TTL >> GRACE: e.g. > build TimeoutInMinutes)
  for each row: mark terminal 'error' ("run never recorded a build handle; abandoned")
```

Anchored on `build_started_at` (the build-ATTEMPT time, §5), **not** `created_at`: a
deploy/apply row can be created long before its build attempt, so `created_at` would make
it orphan-eligible the instant its real build started — false-erroring an in-flight build
(the exact `created_at`-vs-build-start pitfall §5 exists to avoid). `build_started_at` is
present even for the null-handle orphan because it is stamped at the transition, before
`StartBuild`. A null `build_started_at` (a run that never entered the build phase — e.g. a
Path-1 CLI deploy) is deliberately left alone.

- **`staging` is deliberately excluded — this is a correctness requirement, not an
  optimization.** A deploy row is created at `status:'staging'` with `build_id` null and
  legitimately **waits, build-less, for the user to call `/run`** — which can be many
  minutes or hours later (user-paced upload + trigger). Including `staging` here would mark
  a prepared-but-not-yet-triggered deploy `error`, and the subsequent `/run` would then
  409 (`status !== 'staging'`). Only `running`/`applying` are post-`StartBuild` states that
  a null `build_id` makes anomalous. Reaping genuinely *abandoned* `staging` rows is a
  **separate lifecycle concern** with its own (longer) TTL and its own terminal state
  (e.g. `expired`), never `error` — out of scope here.
- `ORPHAN_TTL` is deliberately **long** (longer than the CodeBuild `TimeoutInMinutes`, 30):
  a real build that did launch has fully finished by then, so declaring `error` is safe
  and never races a live inline poll. This is distinct from Phase 3's "handle exists but
  the build is gone/expired."
- **Honest limitation:** a build that *did* launch in the window but never persisted its
  handle is marked `error` here even though it may have applied in-account — a rare,
  bounded false-negative that a human can reconcile via drift. Persisting the handle
  immediately (§6) makes this window tiny; the alternative (leaking an untracked build)
  is worse.

### 7.3 Shared worker mechanics

- `GRACE` (e.g. 2× the inline poll window), measured from `build_started_at`, ensures the
  handle sweep only touches runs the inline path has plausibly abandoned.
- Simulated runs have no `build_id`; they finish synchronously (terminal at create), so
  neither sweep touches them.
- Started next to `startDriftWorker()` in `index.js`; no-op when the runner isn't
  configured (no AWS env), exactly like the drift worker.

---

## 8. How this fixes both failure modes

- **A — Orphaned on restart:** two cases, both covered. If the handle was persisted
  (the common case), the **handle sweep (§7.1)** finds it, asks CodeBuild, and resolves
  it. If the crash beat handle-persistence (the create→persist window, §6), the row has a
  null `build_id` and the **orphan sweep (§7.2)** retires it to `error` after
  `ORPHAN_TTL`. So *no* stuck row survives — neither facet leaves a permanent
  `running`/`applying`.
- **B — False `error` on a slow build:** the inline poll no longer throws on timeout;
  it leaves the run non-terminal, and the sweep resolves it from CodeBuild's *real*
  terminal state once the build finishes. A success is recorded as success. (And for
  apply/deploy, the UI no longer contradicts a real in-account change.)

---

## 9. Caveats (rule b)

- **Single-instance safe by construction; multi-instance needs a claim.** `GRACE >` the
  inline-poll window means the inline poll has already exited before the handle sweep
  touches a row, so inline-vs-sweep never overlap and idempotency is just a status guard
  — **no locking needed on one instance.** Running multiple backend instances (two sweeps
  at once) does need `SELECT … FOR UPDATE SKIP LOCKED`. Documented, deferred (§10 Phase 3).
- **Recovery latency (name it so it isn't a surprise).** A build that finishes just after
  the 600s inline poll gives up sits `running` for up to ~`GRACE` before the handle sweep
  resolves it — i.e. the run pill can appear stuck for up to a sweep interval, then flip
  to its true terminal state. Acceptable for a rare slow build; state it in the UI copy so
  "stuck ~N min then resolves" reads as expected, not a bug.
- **Build TTL vs credentials.** `resolveBuild` re-assumes the Connect role (fresh 900s
  creds) each time, so it is not bound by the original run's credential lifetime — this
  is *why* the sweep can resolve a build that outlived the inline poll. The CodeBuild
  project's `TimeoutInMinutes` (30) remains the real upper bound on a build.
- **Result availability.** A terminal SUCCEEDED build whose result object is genuinely
  missing (upload failed) is a real error — `resolveBuild` distinguishes "build still
  running" (leave) from "build done but no result" (error). This is the precise check
  the current code lacks.
- **Idempotency is mandatory.** Both actors may call `resolve` on the same row; it must
  no-op on an already-terminal row (guard on `status`). Without this, a late inline poll
  could clobber a sweep's result or vice-versa.
- **Not a distributed queue.** This is recovery, not scheduling — it reconciles runs that
  already started; it does not retry a `StartBuild` that never launched (that failure is
  synchronous and already surfaced to the caller).

---

## 10. Phasing

**Phase 1 — durable handle + honest inline poll (fixes B, enables A).** ✅ *Implemented:
`supabase/cloud_builder.sql` (handle columns + reconcile index), `runHistory.setBuildHandle`,
the `startBuild`/`resolveBuild` split in `cloud/runner.js`, honest poll across
plan/apply/drift/deploy, and the sensitive-output filter (`cloud/apply.js`).*
1. Schema: `build_id`, `build_region`, `result_key`, `build_started_at` on `cloud_runs`;
   `runHistory` reads/writes them.
2. Split `runBuild`/`runDeploy` into `startBuild` + `resolveBuild`; **persist the handle
   (incl. `build_started_at = now()`) as the immediate next step after `StartBuild`** (§6)
   to minimize the create→persist window.
3. Inline poll calls `resolveBuild` and, on timeout, leaves the run non-terminal
   instead of throwing `error`. **No route behavior change on the happy path.**
   *Update this doc per rule (f) when Phase 1 lands.*

**Phase 2 — the reconciler sweep (fixes A fully, both facets).** ✅ *Implemented:
`cloud/runReconciler.js` (`resolveSweep` §7.1 + `orphanSweep` §7.2, idempotent
status-guarded `terminate`, kind/phase-aware `computeFinalize`), wired in `index.js`
next to the drift worker.*
4. `backend/cloud/runReconciler.js`: `resolveSweep` (§7.1, handle) **and** `orphanSweep`
   (§7.2, null-handle backstop) + `startRunReconciler` (mirrors `driftWorker`), wired in
   `index.js`.
5. Surface a stuck→resolved transition in the run history / canvas (the run pill just
   updates when the sweep finishes it).

**Phase 3 — hardening (optional).**
6. Cross-instance claim (`FOR UPDATE SKIP LOCKED`) if/when multi-instance.
7. Dead-run detection: a run whose CodeBuild build is gone/expired → terminal `error`
   with a clear reason, so nothing sweeps forever. *(Partial down-payment already in
   `resolveRun`: a handle-bearing run whose connection was deleted can never resolve, so
   it is retired to `error` rather than re-selected every sweep — which would let an
   unresolvable oldest-row starve the batch.)*

---

## 11. Relationship to the rest of the system

- **Reuses the drift worker's shape** (`driftWorker.js`) — idempotent, `unref`'d,
  DB-backed sweep. This is deliberately the *same* pattern, not a new one.
- **Fixes all run kinds at once** because they share `runBuild` (plan/apply/drift) and
  the parallel `runDeploy`; both get `startBuild`/`resolveBuild`.
- **No trust change.** Everything still runs in the customer's in-account runner; the
  reconciler only *reads* build status via the assumed Connect role and fetches the
  result the build already uploaded. We hold nothing new.

> The core insight: a run's terminal state must be derived from a **durable handle to
> the real build**, not from an in-memory timer. Persist the `buildId`, make
> `resolveBuild` idempotent, and let both a fast inline poll and a durable sweep call
> it — the same "diff/plan interpreted by a durable worker" pattern the drift wedge
> already proved.
