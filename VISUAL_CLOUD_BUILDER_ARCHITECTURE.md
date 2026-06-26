# Visual Cloud Builder — Architecture & Implementation Phases

> **Status:** Proposal / Design
> **Date:** 2026-06-26 · **Branch context:** TC-0099
> **Scope owner:** Junaid Khan
> **Part of:** `BUILDER_PLATFORM_ARCHITECTURE.md` (the spine) — this is the **cloud pack**, sibling to `AGENT_BUILDER_ARCHITECTURE.md` (agent pack) and `COMPONENT_EXPORT_ARCHITECTURE.md` (UI pack)
> **Companion memory:** `canvas-run-anything-vision`
> **Related:** `WEBHOOK_CONNECTOR_ARCHITECTURE.md` (event/runtime plumbing), `brand-positioning` (design-once / generate-anything)
>
> **Note:** per the platform decision, all packs share **one graph canvas**; the cloud pack runs it in **wire mode**. The "out of scope: UI/agent" lines below mean *covered in sibling docs*, not excluded from the product.

---

## 1. Goal

Let a user **draw a cloud architecture on a graph canvas** and have the system
**provision it for real** — in the user's *own* cloud account — without the user
needing to know which services an app requires or how to write infrastructure code.

> **One drawing in → one running, correctly-wired cloud environment out.**
> The user supplies *intent and code*; the system supplies *infrastructure*.

This is the **infra vertical** of the broader "draw-anything → run-it" evolution of the
canvas (see §3.1). It is the first vertical because it is the one fully designed
end-to-end, and it is built on a reusable **domain-pack spine** so UI-component and
agent-workflow verticals can plug into the same canvas later.

---

## 2. Scope

### In scope

| # | Requirement |
|---|-------------|
| R1 | A **graph canvas** — nodes, edges, containers (VPC → subnet → resource nesting) |
| R2 | A **per-provider node catalog** (AWS, Azure, GCP, …) — config schema + valid-connection rules per node type; **AWS ships first** |
| R3 | A **deterministic compiler**: graph → Terraform (same graph ⇒ byte-identical HCL) |
| R4 | A **graph linter** that blocks dangerous designs before any provider call |
| R5 | **In-account ephemeral execution**: provision in the *user's* account via a disposable runner |
| R6 | **Human-approved `plan` → `apply`** flow; outputs captured; runner self-terminates |
| R7 | **LLM co-pilot** that validates/explains/repairs the graph — never touches `apply` |
| R8 | **LLM architect**: natural-language intent ("I have a voice agent app") → starter blueprint |

### Explicitly out of scope (this document)

- Writing the user's **application code** or in-service config (call-flow logic, app settings). *The code is the user's responsibility; we provision the environment it runs in.*
- The **UI-component** and **agent-workflow** verticals (separate packs on the same spine — §3.1).
- A **canonical / cloud-agnostic catalog** (generic "Server/Database/Bucket" that maps to every provider) — rejected as the *primary* model (lossy, lowest-common-denominator; Terraform itself doesn't abstract providers). Multi-cloud is delivered via **provider-specific catalogs + the LLM architect** (§3.2). A thin canonical layer for the common 80% is a possible *later* addition, not v1.
- **Live/persistent hosted sandboxes** — execution is ephemeral jobs, not long-lived servers.
- Keeping the user's **long-lived cloud credentials** — we never hold them (§7).

### The product is provisioning, not authoring (decided)

The system stands up and wires services; it does **not** generate the application that runs
inside them. The value is collapsing "I don't know what cloud setup my app needs" into a
drawing the system designs, shows, and builds — safely, in the user's account.

---

## 3. System overview

Three layers, one new verb (**run**) on top of the existing design→IR→emit pipeline:

```
   ┌──────────┐      ┌────────────┐      ┌──────────────────────────┐
   │  CANVAS  │ ───► │  COMPILER  │ ───► │   RUNTIME (per-domain)    │
   │  graph   │      │ graph→IaC  │      │ in-account ephemeral job  │
   └──────────┘      └────────────┘      └──────────────────────────┘
     model              pure fn             assume-role → plan →
   (nodes/edges)     (deterministic)        approve → apply → teardown
        ▲                  ▲                          │
        │              LINT + LLM                     ▼
        └──────────  (co-pilot / architect)   results back onto canvas
```

### 3.1 The domain-pack spine (why this generalizes)

Everything domain-specific lives behind one interface, so the canvas + run-loop are shared
and each vertical is a **pack**:

```ts
interface DomainPack<Graph, Artifact> {
  catalog:  NodeCatalog                          // what you can draw
  compile:  (g: Graph) => Artifact               // pure, deterministic
  lint:     (g: Graph) => Diagnostic[]           // pure rules
  run:      (a: Artifact, ctx: RunContext) => Promise<RunResult>  // the runtime adapter
}
```

| Pack | catalog | compile → | run → |
|---|---|---|---|
| **infra** (this doc) | AWS services | Terraform | in-account ephemeral runner |
| UI component (future) | layout/fields | React bundle (`COMPONENT_EXPORT`) | WebContainers (browser) |
| agent workflow (future) | LLM/tool nodes | workflow spec | server-side streaming runner |

> **Rule that holds across all packs:** *LLM proposes, the deterministic engine disposes.*
> The LLM shapes the **graph**; a pure compiler makes the **artifact**; a human gate guards
> anything irreversible.

### 3.2 Multi-provider — the `CloudProvider` sub-spine

The cloud pack is itself multi-provider: AWS, Azure, GCP (and more) plug into it the same way
packs plug into the platform. The graph canvas and run-loop are provider-agnostic; only the
catalog, the emitter, the connect-bootstrap, and the runtime adapter are per-provider.

```ts
interface CloudProvider {
  id:      "aws" | "azure" | "gcp"
  catalog: NodeCatalog                       // this provider's services
  emit:    (g: Blueprint) => string          // → Terraform for this provider
  lint:    (g: Blueprint) => Diagnostic[]    // provider-specific rules (+ shared rules)
  connect: ConnectBootstrap                  // how the user links their account (§7.2)
  runner:  RunnerAdapter                     // ephemeral compute + state, in THEIR account (§7)
}
```

**Provider strategy (decided):** **provider-specific catalogs**, not a canonical/abstract one.
The user picks a provider and draws its real nodes (`aws_instance` vs
`azurerm_linux_virtual_machine` vs `google_compute_instance`) — accurate and full-featured,
with no lossy abstraction. The "I don't want to learn provider X" experience is delivered by
the **LLM architect** (§6): *"I have a voice agent app **on GCP**"* → a GCP-specific blueprint.
Ease-of-use without a lowest-common-denominator catalog.

> **Why Terraform makes this tractable:** Terraform is the **universal compile target** — it
> already speaks `aws`, `azurerm`, and `google`. So a new provider is "another emitter + another
> runner," not a redesign. The blueprint stays the same shape; only `provider.emit`/`runner` change.

**Sequencing:** AWS is the first provider (fully designed end-to-end). Azure and GCP follow as
additional `CloudProvider` implementations (§ Provider expansion). The *runtime* is what makes
each provider real work — see §7's per-provider table.

---

## 4. Core data model — the graph

```ts
type NodeId = string

interface GraphNode {
  id:     NodeId
  type:   string                 // catalog key, e.g. "aws_instance"
  parent?: NodeId                // containment (subnet in vpc, ec2 in subnet)
  props:  Record<string, unknown> // node arguments (cidr, size, az…)
}

interface GraphEdge {
  from: NodeId
  to:   NodeId
  type: string                   // "attached_to" | "connects_to" | …
  props?: Record<string, unknown> // e.g. { port: 5432 }
}

interface Blueprint {
  nodes: GraphNode[]
  edges: GraphEdge[]
  meta:  { name: string; provider: "aws"; region: string }
}
```

Three structural facts drive compilation:
- **`parent`** = containment → parent-id references.
- **`edge`** = relationship → a reference **or a rule**.
- **`props`** = the node's own arguments.

---

## 5. The compiler (graph → Terraform)

A **pure function**, same registry-of-emitters pattern as the PDF/ZPL emitters — Terraform
is just the 4th IR target.

```ts
const emitters: Record<string, (n: GraphNode, ctx: Ctx) => string> = {
  aws_vpc, aws_subnet, aws_security_group, aws_instance, aws_db_instance, /* … */
}

export function compile(bp: Blueprint): string {
  const ctx = buildContext(bp)               // index nodes, pre-resolve edges
  return bp.nodes.map(n => emitters[n.type](n, ctx)).join("\n\n")
}
```

> **Per-provider dispatch:** there is one emitter registry **per provider**
> (`CloudProvider.emit`, §3.2). `compile` selects the registry from `Blueprint.meta.provider`.
> The examples below are the **AWS** registry; the Azure/GCP registries follow the identical
> pattern against `azurerm_*` / `google_*` resources. Containment, edge-as-rule, and synthesis
> (§5.2) all carry over — only the resource names and a few argument shapes differ.

### 5.1 Mapping rules

| Graph concept | Terraform | Example |
|---|---|---|
| node | `resource` block | `aws_instance "ec2a"` |
| node.type | resource type | `aws_instance` |
| node.id | local name (`tname()` sanitized) | `ec2a` |
| node.props | arguments | `instance_type = "t3.micro"` |
| `parent` (containment) | parent-id reference | `subnet_id = aws_subnet.x.id` |
| `edge` (reference) | cross-resource ref | `vpc_security_group_ids = [...]` |
| `edge` (rule) | a generated rule | `connects_to` → SG ingress (SG-to-SG, no CIDR) |

### 5.2 Two things beyond 1:1 mapping (where the compiler earns its keep)

- **Edges can compile to *rules*.** `ec2 --connects_to(5432)--> rds` becomes a DB
  security-group ingress rule **sourced from the web SG** — the drawn arrow *is* the
  firewall policy.
- **Synthesis of implicit resources.** A user draws an RDS; the compiler emits the
  `aws_db_subnet_group` (required, spanning ≥2 AZs) the user never drew. One node → multiple
  resources.

### 5.3 Invariants

- **Determinism:** same `Blueprint` in ⇒ byte-identical HCL out ⇒ snapshot-testable.
- **No ordering logic:** emitters produce references; Terraform builds the dependency DAG.
- **Secrets are never in the graph:** `password = var.db_password`, injected at apply.

---

## 6. Lint + LLM (the intelligence layer)

Both read the **same graph**; neither can provision.

- **Deterministic linter (R4):** pure rules — *public DB*, *SSH open to `0.0.0.0/0`*,
  *instance with no SG*, *RDS `publicly_accessible = true` or in a public subnet*. Blocks
  before any provider call.
- **LLM co-pilot (R7):** explains lint findings, **proposes graph edits**, repairs invalid
  graphs. Output is always a *graph* the user reviews — never a command.
- **LLM architect (R8):** natural-language intent → starter blueprint by **selecting and
  adapting a vetted reference pattern** (recognition + adaptation, not free generation).
  Reuses the existing intent→structure muscle (AI PDF→template, `IntentCapturePanel`).

> Reliability principle: the architect **picks from a library of known-good blueprints**
> ("realtime-voice-app", "static-site + API", "data-pipeline") and adapts them. Every result
> is a reviewable, editable shape going through the same gated pipeline.

---

## 7. Runtime — in-account ephemeral execution

The defining decision: **run the provisioning inside the user's own account**, on disposable
compute, holding **none** of their long-lived credentials.

### 7.1 Why in-account

- Eliminates **credential custody** (we never hold their keys).
- Eliminates **multi-tenant isolation** (tenants = separate cloud accounts).
- The user pays the (tiny) **runner compute**; gives **private-network reach**.

**Per-provider runtime — the part that makes each cloud real work.** The in-account model is
the same idea everywhere, but every primitive is provider-specific. This is why the runtime
(not the catalog or compiler) sequences the rollout:

| Concern | AWS | Azure | GCP |
|---|---|---|---|
| Connect / auth (§7.2) | cross-account IAM role + **ExternalId** | **Service Principal / Managed Identity** (AAD app) | **Service Account + Workload Identity Federation** |
| Ephemeral runner (§7.3) | **CodeBuild** | **Container Instances** / DevOps pipeline | **Cloud Build** / Cloud Run job |
| Durable state | **S3 + DynamoDB** lock | **Blob Storage** | **GCS** |

Each provider implements `ConnectBootstrap` + `RunnerAdapter` (§3.2). The §7.2–7.3 details
below are the **AWS** implementation; Azure/GCP mirror the shape with their primitives above.

### 7.2 One-time "Connect account" bootstrap

User runs a CloudFormation/Terraform stack in *their* account that creates:

| Resource | Purpose |
|---|---|
| **Connect-Role** | trusts your account principal + **ExternalId**; narrow ("launch runner, pass runner role") |
| **Runner-Role** | the role the ephemeral runner assumes to build infra |
| **State backend** | S3 bucket + DynamoDB lock — durable Terraform state |
| **Results channel** | S3/SNS — how plan/outputs/logs come back across the boundary |

You store **only the Connect-Role ARN + ExternalId**. No keys.

### 7.3 Per-run flow

```
draw → compile → lint/LLM check
   → assume Connect-Role (STS + ExternalId)
   → launch ephemeral runner  ── prefer AWS CodeBuild (auto spin + teardown) ──
        • pulls compiled HCL, backend = their S3 + DynamoDB
        • terraform plan  ──► plan diff → results channel
   → ███ HUMAN APPROVAL GATE ███  (user sees +add / ~change / -destroy on canvas)
   → terraform apply
   → capture outputs (endpoints, ARNs), logs, exit code  ← BEFORE teardown
   → runner self-terminates (TTL watchdog as backstop)
   → canvas reflects outcome (nodes green/red, endpoints on nodes)
```

> **CodeBuild over raw EC2:** CodeBuild gives spin + role assumption + auto-teardown out of
> the box, so orphaned-instance liability (burning *their* money) is AWS's problem, not ours.

### 7.4 Two ideas held separate

- **Ephemeral compute, durable state.** Runner is disposable; the statefile/results are not —
  both live in *their* account, so neither creds nor state ever cross to us.
- **Idempotent re-runs.** Durable remote state ⇒ a second run *diffs* instead of duplicating.

---

## 8. Security model

| Control | Mechanism |
|---|---|
| No credential custody | in-account runner uses **Runner-Role**; we hold only an assumable ARN |
| Scoped cross-account trust | **ExternalId** + narrow Connect-Role |
| Blast-radius brake | **`plan` + human approval** before any `apply` (the real near-term safety) |
| LLM containment | LLM emits **graphs only**; deterministic compiler + human gate sit between it and `apply` (prompt-injection cannot reach provisioning) |
| Secrets | never in the graph; injected at apply from the user's secret store |
| Teardown / orphans | managed ephemeral compute (CodeBuild) + TTL watchdog |
| Least privilege (Runner-Role) | *known gap:* "build anything" pushes toward admin; v1 = broad-but-bounded role + the approval gate; per-blueprint scoping is a later refinement |

---

# Implementation Phases

## How to read this

- **Three tracks.** Track 1 (P0–P4) is the **deterministic core** — draw → download valid
  Terraform; shippable alone (user runs the HCL themselves). Track 2 (P5–P8) adds the
  **in-account runtime** (the "make it live" promise). Track 3 (P9–P10) adds the **LLM
  layer** (co-pilot + architect). Each track sits on the one below and never replaces it.
- **Effort** is S / M / L (relative), not dated.
- **Exit criteria** are the objective "done when" gate. Don't start a phase until its
  dependencies' exit criteria hold.
- **Milestones (M1–M4)** are demoable checkpoints.

```
TRACK 1 — deterministic core         TRACK 2 — in-account runtime      TRACK 3 — LLM layer
P0 ─ P1 ─ P2 ─ P3 ─ P4               P5 ─ P6 ─ P7 ─ P8                 P9 ─ P10
              └─M1─┘                      └M2┘   └──M3──┘                    └─M4─┘
```

| Milestone | Phases | What you can show |
|---|---|---|
| **M1 — Draw → Terraform** | P0–P3 | Draw VPC+EC2+SG+RDS → download HCL that `terraform validate`s |
| **M2 — Plan preview** | P5–P6 | Connect account → run → see a real `plan` diff in the app |
| **M3 — Live in their account** | P7–P8 | Approve → resources created in user's account → outputs on canvas |
| **M4 — Describe it, get it** | P9–P10 | "I have a voice agent app" → blueprint → reviewed → live |

---

# TRACK 1 — Deterministic core

## P0 — Spine + graph model
**Effort:** S · **Depends on:** none

Establish the domain-pack interface and the graph types as first-class, beside the existing
page-layout model.

**Tasks**
- Define `DomainPack`, `NodeCatalog`, `RunContext`, `RunResult` (architecture §3.1).
- Define `Blueprint` / `GraphNode` / `GraphEdge` (§4) — additive, separate from `canvas.ts`.
- Register an empty `infra` pack skeleton.

**Files (new):** `src/builder/spine/DomainPack.ts`, `src/builder/types/blueprint.ts`,
`src/builder/packs/infra/index.ts`

**Exit criteria:** an empty `infra` pack type-checks and is discoverable by a pack registry.

---

## P1 — Graph canvas UI
**Effort:** L · **Depends on:** P0

Drag nodes, draw edges, nest containers, edit props. Use **React Flow / @xyflow** — do not
grow the dnd-kit page canvas into a graph.

**Tasks**
- Mount a graph canvas with nodes, typed edges, and **container nesting** (drag node into a
  VPC/subnet → sets `parent`).
- A properties panel bound to `node.props` (reuse the editor's compact property-row tokens).
- Serialize/deserialize `Blueprint`.

**Files:** `src/builder/canvas/GraphCanvas.tsx`, `src/builder/canvas/nodes/*`,
`src/builder/canvas/PropertiesPanel.tsx`

**Exit criteria:** a user can build the VPC → subnet → EC2 + SG + RDS blueprint by hand and
round-trip it to JSON and back losslessly.

---

## P2 — AWS node catalog v1
**Effort:** M · **Depends on:** P1

The drawable surface — **~10 core nodes only** (resist the 200-service trap).

**Tasks**
- Catalog entries for: `aws_vpc`, `aws_subnet`, `aws_security_group`, `aws_instance`,
  `aws_db_instance`, `aws_lb` (ALB), `aws_s3_bucket`, `aws_cloudfront_distribution`,
  `aws_ecs_service` (Fargate), `aws_iam_role`.
- Each entry: prop schema, defaults, valid `parent` types, valid edge types.

**Files:** `src/builder/packs/infra/catalog/*.ts`

**Exit criteria:** every catalog node is placeable with validated props and connection rules
enforced in the UI.

---

## P3 — Compiler: graph → Terraform
**Effort:** L · **Depends on:** P2

The pure-function core (architecture §5).

**Tasks**
- Per-type emitters; `buildContext` with `ref()` (containment) and edge resolution.
- Implement **edge-as-rule** (`connects_to` → SG ingress) and **resource synthesis**
  (`aws_db_subnet_group` for RDS).
- Prettier/`terraform fmt` pass; emit a complete module (`main.tf`, `variables.tf`).
- Snapshot tests on the reference blueprint.

**Files:** `src/builder/packs/infra/compile/{index,emitters,context}.ts`

**Exit criteria:** **M1** — the reference blueprint compiles to HCL that passes
`terraform validate` and `terraform plan` (against a throwaway account) with zero hand-edits;
re-compiling an unchanged graph is byte-identical.

---

## P4 — Deterministic linter
**Effort:** M · **Depends on:** P3

Catch dangerous designs before any provider call (architecture §6).

**Tasks**
- Pure rules: public DB / `publicly_accessible`, SSH `0.0.0.0/0`, instance with no SG,
  unencrypted storage, world-open egress where avoidable.
- Surface diagnostics on the offending node (severity: block vs warn).

**Files:** `src/builder/packs/infra/lint/rules.ts`

**Exit criteria:** a deliberately exposed RDS is flagged **blocking** and cannot proceed to
compile/run until resolved.

> **Track 1 is a shippable product on its own** (download-the-Terraform). Do not begin Track 2
> until M1 + P4 hold.

---

# TRACK 2 — In-account runtime

## P5 — Connect-account bootstrap
**Effort:** M · **Depends on:** P4

The one-time trust handshake (architecture §7.2).

**Tasks**
- Author the CloudFormation/Terraform "Connect AWS" stack: Connect-Role (+ ExternalId),
  Runner-Role, state bucket + lock table, results channel.
- App-side "Connect account" flow: present the stack, capture the returned Connect-Role ARN +
  ExternalId, store the ARN (never keys).

**Files:** `infra/connect-account/stack.yaml`, `backend/routes/cloudConnect.js`,
`src/builder/connect/ConnectAccount.tsx`

**Exit criteria:** a user connects a real test account; the backend can `sts:AssumeRole` the
Connect-Role with the ExternalId and list nothing more than its scope allows.

---

## P6 — Ephemeral runner + `plan`
**Effort:** L · **Depends on:** P5

Launch a disposable runner in the user's account, run `plan`, return the diff (architecture
§7.3).

**Tasks**
- Orchestrator: assume Connect-Role → launch **CodeBuild** job (Runner-Role) with the
  compiled module + remote-state backend config.
- Stream/collect `terraform plan` to the results channel; parse into a structured diff.
- Render the diff in the app (+add / ~change / -destroy) on the relevant nodes.

**Files:** `backend/routes/cloudRun.js`, `backend/cloud/runner.js`,
`backend/cloud/planParser.js`, `src/builder/run/PlanReview.tsx`

**Exit criteria:** **M2** — the reference blueprint produces a real `plan` diff shown in the
app, executed entirely inside the user's account; the runner is gone afterward.

---

## P7 — Approval gate + apply + capture + teardown
**Effort:** L · **Depends on:** P6

The "make it live" step, gated (architecture §7.3–7.4, §8).

**Tasks**
- Human **approval gate** UI; on approve, re-launch/resume runner for `terraform apply`.
- **Capture outputs/logs/exit before teardown**; persist results; confirm runner termination
  (TTL watchdog backstop).
- Durable remote state verified across runs.

**Files:** `backend/cloud/apply.js`, `backend/cloud/teardown.js`,
`src/builder/run/ApprovalGate.tsx`

**Exit criteria:** **M3** — approving the plan creates real resources in the user's account;
outputs (endpoints/ARNs) are captured and shown; no runner or orphaned compute remains.

---

## P8 — Outcome reflection + idempotent re-runs
**Effort:** M · **Depends on:** P7

Close the loop back onto the canvas.

**Tasks**
- Map run results to node state: green/red, endpoint URLs, log links on each node.
- Re-run an unchanged blueprint ⇒ `plan` shows **no changes** (idempotency via remote state).
- Run history per blueprint.

**Files:** `src/builder/run/OutcomeOverlay.tsx`, `backend/cloud/runHistory.js`

**Exit criteria:** re-running an unchanged, already-applied blueprint reports "no changes";
a small edit shows exactly that delta in the next plan.

> **Cost/metering hook:** wire run-counts into the existing metered model
> (`ai-feature-gating` pattern) before P7 ships publicly — a *run* is the billable event.

---

# TRACK 3 — LLM layer

## P9 — LLM co-pilot
**Effort:** M · **Depends on:** P4 (graph + lint); usable from M1

Intelligence over the graph, with zero execution authority (architecture §6).

**Tasks**
- Co-pilot reads `Blueprint` + lint diagnostics → **proposes graph edits** (structured) and
  explains findings in plain language.
- Apply-edit UX: proposals land as a previewed diff on the canvas the user accepts/rejects.
- Latest capable Claude model via Bedrock, temperature 0, structured output.

**Files:** `backend/cloud/llm/coPilot.js`, `src/builder/llm/Suggestions.tsx`

**Exit criteria:** for a graph with a blocking lint error, the co-pilot proposes a graph edit
that, when accepted, clears the error — and it never emits a command.

---

## P10 — LLM architect (intent → blueprint)
**Effort:** L · **Depends on:** P9

The headline capability: describe the app, get the infrastructure (architecture §6, R8).

**Tasks**
- A library of **vetted reference blueprints** ("realtime-voice-app", "static-site + API",
  "crud-web-app", "data-pipeline").
- Architect lane: NL intent → **select + adapt** the closest reference → emit a `Blueprint`
  onto the canvas for review.
- Constrain to catalog nodes only; every output flows through P3 compile → P4 lint → P6/P7.

**Files:** `backend/cloud/llm/architect.js`, `src/builder/packs/infra/patterns/*`

**Exit criteria:** **M4** — "I have a voice agent app, set up cloud for it" yields a reviewable
blueprint (VPC, Fargate, RDS, Transcribe, Bedrock, Polly, WebSocket, security rules) that the
user can adjust and drive to live through the existing gated pipeline.

---

## Cross-cutting (runs alongside, not blocking phases)

| Concern | When | Note |
|---|---|---|
| Least-privilege Runner-Role | P5 + revisit post-M3 | v1 broad-but-bounded; per-blueprint scoping later (§8 gap) |
| Cost / metering | before P7 public | a *run* is the billable event; reuse `ai-feature-gating` |
| Abuse / teardown safety | P6–P7 | TTL watchdog, run timeouts, concurrency caps |
| Observability / cost attribution | P6 onward | per-run logs + which account/blueprint |
| Reference-pattern library growth | P10 onward | curated, not generated — the architect's reliability floor |
| Additional providers (Azure, GCP) | after M3 (AWS) | new `CloudProvider` = catalog + emitter + connect + runner; canvas/spine/run-loop unchanged (§ Provider expansion) |
| Other verticals (UI, agents) | after M4 | new `DomainPack`s on the same spine (§3.1) |

---

## Dependency graph (at a glance)

```
P0 → P1 → P2 → P3 ─(M1)→ P4 → P5 → P6 ─(M2)→ P7 ─(M3)→ P8
                          │                                 
                          └→ P9 → P10 ─(M4)   (Track 3 needs P4; M4 needs M3)
```

## Provider expansion (after M3 — repeatable per cloud)

AWS goes first through M1–M4. Each additional provider is a **`CloudProvider` implementation**
(§3.2) on the unchanged canvas/spine/run-loop — the same four pieces, re-done per cloud:

| Phase | Per new provider (e.g. Azure, then GCP) | Mirrors |
|---|---|---|
| **PX-1 — Catalog** | provider node catalog (~10 core services) | P2 |
| **PX-2 — Emitter** | `Blueprint` → provider Terraform (`azurerm_*` / `google_*`) + provider lint rules | P3 + P4 |
| **PX-3 — Connect** | provider connect-bootstrap (SP/Managed Identity · WIF) + state backend | P5 |
| **PX-4 — Runner** | provider ephemeral runner (Container Instances · Cloud Build) → plan/apply/capture/teardown | P6–P7 |
| **PX-5 — Patterns** | provider variants of reference blueprints for the architect | P10 |

> The graph canvas, run-loop, approval gate, and LLM architect/co-pilot are **written once** and
> reused for every provider. Expansion cost = catalog + emitter + connect + runner per cloud —
> bounded and repeatable, with the runtime (PX-3/PX-4) being the bulk of it.

## First-spike recommendation

Drive **one** blueprint — the **VPC + public subnet + EC2 + SG + private subnets + RDS** we
designed — through **P0 → P3** (draw → Terraform), then **P5 → P7** against **one throwaway
AWS account**, before generalizing the catalog or adding the LLM. That single spike proves the
entire pipeline end-to-end (graph → HCL → in-account plan → approve → live → teardown) and
de-risks everything after it. Generalize the catalog (P2 breadth) and add Track 3 only once
M3 holds.
```
