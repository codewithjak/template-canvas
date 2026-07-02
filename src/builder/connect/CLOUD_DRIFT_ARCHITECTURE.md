# Drift Detection: keeping the canvas in sync with reality

> **Status:** Proposal / Design
> **Date:** 2026-07-01
> **Scope owner:** Junaid Khan
> **Part of:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (the cloud pack runtime)
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. Goal

Detect when a deployed architecture's **live reality no longer matches the
blueprint that was applied**, and show that drift on the canvas. This is the first
wedge toward a **living, bidirectional model**: today the builder is one-way (design
to deploy); drift detection adds the return signal (reality back to the design) so
the picture and the running system stop diverging.

> **The pain:** design-to-deploy is a one-time win, but drift is forever. The daily
> question for cloud teams is "what is actually running, and does it still match
> what we think?"
>
> **Be honest about novelty (see §9):** drift detection is *not* new, and neither is
> importing a live account into a diagram. Both are mature, crowded categories. What
> nobody ships is the *fusion*: one **editable** canvas that is simultaneously the
> design surface, the deploy button, and the drift/health overlay, with bidirectional
> reconcile. The claim to defend is "the thing you drew is the same object that tells
> you it drifted," not "first to detect drift." That is the whitespace this starts to
> fill.

---

## 2. What "drift" means here

After a blueprint is applied, three things can fall out of sync:

- **Out-of-band change:** someone edited a resource in the console or CLI, so the
  live resource no longer matches Terraform state.
- **Deletion:** a resource was removed outside Terraform.
- **Un-managed addition:** a resource appeared that the blueprint never declared
  (a "ghost").

Terraform already computes the first two: running `terraform plan` (which refreshes
state from the real resources) against the **last-applied config** yields a diff. If
the config has not changed since apply, **any planned change is drift.**
`terraform plan -refresh-only -json` isolates pure out-of-band drift; a normal plan
also shows what it would take to reconcile.

Un-managed additions (ghosts) require discovering resources Terraform does not
track. That is the harder, later phase (§8).

---

## 3. The model

### 3.1 A deployment

A **deployment** is the last successfully applied run for a connection: it has the
applied **HCL**, and a durable **state** (S3 at `state/{connection.id}.tfstate`,
already created by the runner). One deployment per connection to start, matching the
current per-connection state key.

### 3.2 A drift check

A drift check is a **plan run interpreted as a health signal**:

```
drift-check(deployment) =
  terraform plan (refresh) on deployment.hcl against deployment.state
  -> empty diff  => in sync (healthy)
  -> non-empty   => drift: the parsed diff is the drift
```

It reuses the existing runner and plan parser. The only new idea is the
interpretation: for a run, a diff is a proposed change; for a drift check, a diff is
a problem.

---

## 4. Flow (reuses what exists)

```
scheduler or "Check drift" button
   -> assume Connect role, StartBuild the runner (as today)
      buildspec: terraform init (S3 backend) + plan -refresh-only -json  (deployment.hcl)
   -> upload result, backend fetches + parses (planParser)
   -> store a drift record (cloud_runs, kind='drift')
   -> map drifted resource addresses back to nodes
   -> surface on the canvas
```

Everything except the interpretation and the surfacing is already built: the
in-account runner, the S3 remote state, the SigV4 signing, the plan parser, and the
`address -> node` mapping (`tname`, `appliedNodeIds`).

---

## 5. Surfacing drift on the canvas

- **Drifted nodes** get a distinct state (for example an orange "drifted" outline,
  separate from selection blue, container violet, and the red/amber lint states).
- **A drift panel** lists what changed per resource ("`instance-1` changed outside
  Mapdoc: instance_type t3.micro -> t3.large").
- **A status pill:** "In sync" (green) or "Drift detected (N)" (orange).
- **Deletions** show the node as missing/greyed; **ghosts** (later) show as
  un-declared nodes.

The mapping from a plan's resource address (`aws_instance.instance_1`) back to a node
already exists from the outcome-reflection work, so the same reverse map is reused.

---

## 6. Reconciliation

Two directions, sequenced:

- **Push (now):** "Apply to fix" re-applies the blueprint to bring reality back to
  the declared state. This reuses the existing approve-and-apply path.
- **Pull (later):** update the blueprint to match reality (accept the drift). This
  needs reverse-mapping the drift into the graph, which is the discovery machinery of
  the later phases.

---

## 7. Scheduling

- **Phase 1: on-demand.** A "Check drift" button per deployment. Zero new infra.
- **Phase 2: continuous.** A periodic worker runs drift checks for each verified
  connection with a deployment, stores the latest result, and notifies on new drift
  (reuse the existing webhook/email machinery). Durable, survives restarts, like the
  existing retry worker.

---

## 8. Beyond the wedge (the north star)

The wedge detects drift on **what Mapdoc deployed**. The full living model also
covers what it did not:

- **Discover** the account's real resources into the same graph model.
- **Diff** the live graph against the blueprint and the last-applied state.
- **Reconcile** either way, including pulling reality into the design.

That is the bidirectional model. The wedge proves the loop with machinery already in
place; discovery is the larger follow-on.

---

## 9. Landscape: what everyone is doing, and what nobody is

The pieces of this vision already exist and are mature. The edge is the **convergence**,
not any single piece. Positioning must reflect that or it dies under technical scrutiny.

### 9.1 What already exists (do not claim as novel)

- **Reverse-engineering a live account into a diagram (discovery to picture):**
  AWS *Workload Discovery on AWS* (formerly Perspective), *Cloudcraft* (Datadog),
  *Hava.io*, *Lucidscale*, *Cloudockit*. Mostly **read-only** visualization: you get a
  picture, not an editable model you can redeploy from. Hava also tracks change over time.
- **Editable canvas to IaC (design-first):** *Brainboard* is the closest neighbor (visual
  canvas that generates Terraform, with some import). *Pluralith*, *Rover*, *InfraMap*
  visualize IaC but are not design surfaces.
- **Drift detection (blueprint vs reality):** *Firefly (firefly.ai)* is the sharpest
  comparable: it inventories a live account, detects drift, flags un-managed "ghost"
  resources, and codifies them back into IaC (very close to our §8 north star, already
  shipping). *HCP Terraform* has built-in drift detection; *Spacelift* and *env0* do drift
  on managed stacks. (*driftctl* did too but Snyk archived it.)
- **"What is broken / not working":** a *different* signal from drift, owned by other
  categories. CSPM tools (*Wiz*, *Prisma Cloud*, *Orca*) detect misconfiguration and
  posture. Observability (*Datadog*, *New Relic* service maps, *Kiali*) auto-discovers live
  topology with red/green health.

### 9.2 The distinction that matters: drift is not "broken"

Two different questions, two different data sources. Do not conflate them:

- **Drift** = "did the config move away from what we declared?" Answered by
  `terraform plan`. A resource can drift and still work perfectly.
- **Broken** = "is it actually functioning?" Answered by health checks, metrics,
  reachability, posture rules. A resource can match IaC exactly and be completely broken
  (wrong security group, failing target group, throttled).

This drift wedge answers **only the first**. "Detect what's broken" is a separate
ingestion (metrics/health/posture), not something `terraform plan` will ever surface.

### 9.3 What nobody ships (the actual whitespace)

No product makes the picture you drew the **same object** that (a) designs, (b) deploys,
(c) imports the truth of an existing account, and (d) overlays live drift + health, with
bidirectional reconcile. Today those four live in four disconnected tool categories: you
design in Brainboard, deploy in Terraform, drift-check in Firefly, watch health in
Datadog. The edge is unifying them on one editable graph.

**Consequence for the roadmap:** the hardest, least-commoditized part is the one thing the
wedge defers on purpose: **discovery** (pulling an unmanaged live account into the editable
model, §8 / Phase 3). Firefly proves it is doable and valuable; it also proves it is the
expensive part. The drift wedge is the cheap proof of the loop; discovery is the moat.

---

## 10. Data and API

- **`cloud_runs`** gains a `kind` column (`plan` | `apply` | `drift`); a drift check
  stores its parsed diff in `plan` and its summary in the row.
- **`POST /v1/cloud/drift`** `{ connectionId }` -> starts a drift check for that
  connection's deployment (real when configured, simulated otherwise).
- **`GET /v1/cloud/drift/:connectionId`** -> the latest drift result.
- Frontend: a drift API client, a "Check drift" action, drifted-node styling, and the
  drift panel.

---

## 11. Implementation mapping and phasing

**Phase 1 (the wedge, build now):**
1. `cloud_runs`: add `kind`.
2. `backend/cloud/runner.js`: a `driftBuildspec` (plan -refresh-only -json) and a
   `runDrift` that reuses `runBuild` + `parsePlanJson`.
3. `backend/routes/cloudDrift.js`: `POST /v1/cloud/drift`, `GET /v1/cloud/drift/:id`
   (simulated fallback: no drift).
4. `src/builder/run/driftApi.ts` + a `Check drift` button.
5. `GraphCanvasBase`: drifted-node class + a drift panel + a status pill; reuse the
   `address -> node` map.

**Phase 2:** continuous scheduler + notifications.

**Phase 3:** discover un-managed resources (ghosts).

**Phase 4:** pull reconciliation (blueprint updated from drift).

> The design experience does not change. The canvas the user drew simply starts
> telling them when the running system has moved away from it.
