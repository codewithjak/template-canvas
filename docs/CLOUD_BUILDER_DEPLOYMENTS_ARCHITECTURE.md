# Deployments: many infras per account

> **Status:** Proposal / Design
> **Date:** 2026-07-07
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the cloud pack runtime)
> **Companion:** `CLOUD_DRIFT_ARCHITECTURE.md` (drift targets a deployment, see §8)
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. The problem

A single connected AWS account can hold **more than one independent
infrastructure** (a web stack, a data pipeline, a staging copy). The builder
cannot currently express that: it tracks infrastructure by **connection**, so
every infra in an account collapses onto one identity and one state file. The
second infra does not coexist with the first, it overwrites it, and drift/plan
can only ever see whichever was applied last. The system loses track.

State itself is fine and **does not change**: it stays in the customer's own S3
bucket, in their account, locked by their DynamoDB table. We still hold nothing.
The bug is not *where* state lives, it is that there is only *one* state key per
account.

---

## 2. Where this is enforced today (the two lines)

1. **One state key per connection** — `backend/cloud/runner.js`:
   ```js
   { name: 'TF_STATE_KEY', value: `state/${connection.id}.tfstate` }
   ```
   Every plan/apply/drift for the connection reads and writes this one object.
   Applying a second blueprint loads the first's state, sees different config,
   and plans to destroy it.

2. **One deployment per connection** — the drift route and worker both resolve
   the deployment as `history.latestApplied(sb, teamId, connectionId)`: a single
   row, the most recent apply. Earlier infras are invisible.

`CLOUD_DRIFT_ARCHITECTURE.md` §3.1 already flags this as a starting simplification
("one deployment per connection to start, matching the current per-connection
state key"). This doc removes that limit.

---

## 3. The model: three distinct objects

Today two ideas are conflated. Separate them:

- **Connection** — a link to an account (role ARN, external id, region, state
  bucket, lock table). **One per account** is correct. Unchanged.
- **Template** — a *design* (a saved `Blueprint`: nodes, edges, props). No live
  state. This is the same `templates` table that holds doc/image designs.
- **Deployment** — a *template applied to a connection*. It owns one Terraform
  state (one S3 key) and is the thing we plan, apply, drift, and track.

```
account ── connection (1 per account)
                │
                └── deployment (N per connection)   ← the live instance, owns state
                        │
                        └── template (the design it was created from)
```

A deployment's identity is what keeps the system from losing track: it is the
per-account ledger of "what infras exist here."

---

## 4. State isolation (the whole fix, in one change)

State stays in the customer's S3 bucket. Only the **key** gains the deployment:

```
  before:  state/{connection.id}.tfstate                 (one per account)
  after:   state/{connection.id}/{deployment.id}.tfstate (one per infra)
```

Ten infras in one account become ten keys in the same bucket, fully isolated.
The DynamoDB lock is keyed off the state path, so **locking becomes per-deployment
automatically** with no extra work. No trust change: state never leaves the
customer's account.

Surgical code change: `runBuild` stops deriving the key from `connection.id` and
instead receives a `stateKey` from the deployment. Everything else (SigV4, the
S3 backend-config, the runner, the plan parser) is untouched.

---

## 5. Data model

### 5.1 `templates` gains an `environment` column

The design library is shared with doc/image templates, discriminated by
environment so each surface lists only its own:

```sql
alter table public.templates
  add column if not exists environment text not null default 'document';
create index if not exists idx_templates_team_env
  on public.templates(team_id, environment, updated_at desc);
```

- Values: `'document'` (doc/image, the default and the backfill for existing
  rows), `'cloud'` (cloud builder). Room for `'ui'` / `'agent'` later, since
  those graph packs will want the same save/load.
- `body_json` holds the `Blueprint` for cloud, exactly as it holds the doc design
  today. The environment tells the app how to read `body_json`.
- `templatesRepo.list(environment)` filters on it; cloud builder loads
  `environment = 'cloud'`. RLS is unchanged (still team-scoped).

### 5.2 New `cloud_deployments` — the per-account registry

```sql
create table if not exists public.cloud_deployments (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  connection_id uuid not null references public.cloud_connections(id) on delete cascade,
  template_id   uuid references public.templates(id) on delete set null,
  name          text not null default 'Untitled',
  status        text not null default 'active',   -- active|destroyed
  last_run_id   uuid references public.cloud_runs(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_cloud_deployments_conn
  on public.cloud_deployments(team_id, connection_id);
```

`cloud_deployments` rows are the answer to "which infras exist in this account."
Its `id` is what keys the state file (§4).

### 5.3 `cloud_runs` gains `deployment_id`

```sql
alter table public.cloud_runs
  add column if not exists deployment_id uuid
    references public.cloud_deployments(id) on delete cascade;
```

Runs (plan/apply/drift) now belong to a deployment. `latestApplied` and
`latestDrift` key by `deployment_id` instead of `connection_id`.

> **Design note — template as identity vs a deployment row.** A lighter option is
> to skip `cloud_deployments` and let the deployment be the pair
> `(connection_id, template_id)` carried on `cloud_runs`. It is less code, but it
> cannot express two live copies of the same template in one account, and it
> conflates the design with the instance. Because the stated worry is *losing
> track*, this doc recommends the explicit registry table: it is the ledger, and
> it decouples design from instance. **Default: `cloud_deployments`.**

---

## 6. Flow changes

- **Apply** creates a deployment the first time a template is applied to a
  connection (or reuses the existing one), then runs with
  `TF_STATE_KEY = state/{connection.id}/{deployment.id}.tfstate`. The run row
  carries `deployment_id`; the deployment's `last_run_id` is updated.
- **Plan** targets `(connection, deployment)` and plans against that deployment's
  state, so a plan for infra A never sees infra B.
- **Drift** (Phase 1/2) resolves the deployment by `deployment_id` and re-plans
  its state. The Phase 2 worker sweeps **all deployments**, not one-per-connection
  (§8).
- **Destroy** (future) sets the deployment `status='destroyed'` after a
  `terraform destroy`, leaving the row as an audit record.

---

## 7. Frontend

- `CloudCanvas` gains a **template picker** beside the connection bar: on open it
  calls `listTemplates('cloud')` and you pick one (or "New"). Selecting a template
  loads its `body_json` into `GraphCanvasBase`; edits save back via
  `updateTemplate`. This is the "load my 10 templates on open, select one" ask,
  and it reuses the exact doc/image mechanism.
- Plan / Apply / Drift then operate on the selected `(connection, template →
  deployment)`. A connection can show its list of live deployments, each with its
  own drift state.

---

## 8. Impact on drift (companion doc)

Drift Phase 1/2 are correct *given* one-deployment-per-connection; this doc
generalizes their target from a connection to a deployment:

- `POST /v1/cloud/drift` takes `{ deploymentId }` (or `{ connectionId,
  templateId }` resolved to one).
- `latestApplied` / `latestDrift` filter by `deployment_id`.
- The drift worker iterates deployments, keeping its least-recently-checked
  fairness and per-sweep cap, now per deployment.

No new drift concepts, just a finer key.

---

## 9. Migration (do not orphan existing infra)

- **Templates:** existing rows backfill to `environment='document'` (the column
  default), so doc/image is unaffected.
- **Cloud runs:** for each connection that has an applied run today, synthesize
  one `cloud_deployments` row (its single existing infra) and stamp the historical
  runs with that `deployment_id`. Its state key stays `state/{connection.id}/
  {deployment.id}.tfstate` going forward; the legacy `state/{connection.id}.tfstate`
  object is migrated (copy) or the deployment is pinned to the legacy key via a
  stored `state_key` override for a transition period. **Nothing loses its state.**

---

## 10. Phasing

**Phase 1 (model + isolation):**
1. `templates.environment` column + `templatesRepo` environment scoping.
2. `cloud_deployments` table + `cloud_runs.deployment_id`.
3. `runBuild` takes `stateKey`; apply creates/reuses a deployment and passes its
   key.
4. `latestApplied` / `latestDrift` re-keyed to `deployment_id`.

**Phase 2 (frontend):** template picker in `CloudCanvas`, load/save `body_json`,
per-deployment drift surfacing.

**Phase 3 (lifecycle):** destroy, rename, and a per-connection deployments list
(the visible account registry).

> The trust model is untouched: state stays in the customer's account. This change
> is purely about giving each infra an identity so one account can hold many, and
> the system always knows which is which.

---

## 11. Beyond drift: the operational layer

This model is not a drift feature, it is the substrate for an **operational
layer**. Drift is only its first tenant. Every operational signal (health, cost,
security posture, logs) has to answer the same questions drift does: *which
resource, in which infra, in which account*, then map it back to a node. The
deployment is exactly that anchor, so the same plumbing carries all of them.

### 11.1 One abstraction: a signal on a deployment

```
signal = (deployment_id, kind, result, checked_at)
```

Drift generalizes to this with no new concepts. `cloud_runs.kind` (today
`plan|apply|drift`) grows to include `health`, `cost`, `posture`; if overloading
runs is undesirable, signals move to a parallel `cloud_signals` table with the
same shape. Either way, a deployment accumulates a timeline of typed checks.

### 11.2 What is shared vs what is per-signal

Everything the drift wedge built is generic and reused unchanged:

- **Identity + grouping:** `(connection, deployment_id)`.
- **Node mapping:** the `address -> node` map (`type.tname`).
- **Pipeline:** store latest result, diff against previous, notify on change.
- **Scheduler:** the least-recently-checked sweeper, now keyed by
  `(deployment, kind)` with a per-sweep cost cap.
- **Surfacing:** node states, a panel, and a status pill.
- **Notification:** `cloud.*` webhook events.

The **only** per-signal part is the collector (the data source) and its
interpretation:

| Signal | Question | Collector (the only per-signal part) |
|---|---|---|
| Drift | Did config move from what we declared? | `terraform plan -refresh-only` (the runner) |
| Health | Is it actually working? | CloudWatch alarms, target-group health, AWS Health API, synthetic checks |
| Cost | What is it costing / is it anomalous? | Cost Explorer, tags |
| Posture | Is it misconfigured / insecure? | AWS Config rules, Security Hub |

The sweeper dispatches to a collector by `kind`; adding a signal is writing a
collector, not a new subsystem.

### 11.3 Multi-signal canvas

Node state becomes **multi-signal**: a node can be drifted (orange) and unhealthy
(red) at once, each an independent overlay that stacks, exactly as lint
severities and the applied/container/selection states already stack today. The
canvas stops being "the thing you drew" and becomes "the thing you drew, showing
you every way reality has moved away from it."

### 11.4 Trust still holds

Health, cost, and posture do not need the in-account Terraform runner. They are
read-only calls against the customer's assumed role, and we store only the
**derived signal** (healthy / 3 alarms firing), never their raw data or secrets,
the same posture as drift storing a parsed diff rather than raw state. The
operational layer extends the model without weakening "we hold nothing."

### 11.5 Build order

Keep the substrate generic on purpose: name the stored unit a **signal** (not a
"drift run"), make the worker a **signal sweeper** with a collector registry, and
make node state multi-signal. Then ship collectors incrementally: drift is done,
**health is the natural second** because "is it broken" is the question users ask
daily. This is the path to the full living model, one editable graph that
designs, deploys, and shows every operational truth.
