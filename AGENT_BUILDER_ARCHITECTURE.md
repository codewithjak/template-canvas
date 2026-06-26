# Agent Workflow Builder — Architecture & Implementation Phases

> **Status:** Proposal / Design
> **Date:** 2026-06-26 · **Branch context:** TC-0099
> **Scope owner:** Junaid Khan
> **Part of:** `BUILDER_PLATFORM_ARCHITECTURE.md` (the spine) · sibling to
> `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md`
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. Goal

Let a user **draw an agentic workflow on the graph canvas** — LLM steps, tool calls,
branches, loops — and **run it live**, watching execution flow node-by-node across the canvas.

> **One drawn workflow in → one running, observable agent out.**

This is the **agent pack** of the builder platform. It uses the *same* graph canvas as the
cloud pack (both are "wire mode" — nodes connected by edges); a workflow is naturally a
**DAG**, which is the edge-heavy end of the graph spectrum (platform §2).

---

## 2. Scope

### In scope

| # | Requirement |
|---|-------------|
| R1 | A **node catalog** for agent steps (LLM, tool/function, HTTP, branch, loop, input/trigger, output, human-in-loop) |
| R2 | A **deterministic compiler**: graph → a workflow spec (a serializable state machine / DAG IR) |
| R3 | A **linter**: unreachable nodes, cycles without a loop node, dangling required inputs, tool with no credentials |
| R4 | A **server-side runner** that executes the spec and **streams node state** to the canvas live |
| R5 | **Durable execution**: checkpoint so a worker crash resumes mid-run (not restart) |
| R6 | **Human-in-the-loop** pause/resume nodes |
| R7 | **LLM architect**: NL intent ("an agent that triages support emails") → starter workflow |

### Explicitly out of scope (this document)

- The **canvas/spine/run-loop shell** — owned by the platform (`BUILDER_PLATFORM`).
- Hosting the agent as a **persistent always-on service** — runs are jobs (ephemeral
  execution, durable state), not a standing server.
- A general **tool marketplace** — v1 ships a small fixed tool set (§5.2).
- **Fine-tuning / model training** — nodes call existing models.

### The agent *is* the product here (note)

Unlike the cloud pack (where the LLM only *designs* infra), in this pack **LLM calls are nodes
the user runs** — the agent's intelligence is the deliverable. The platform invariant still
holds at the *build* level: the LLM architect (R7) only *proposes the graph*; a human reviews
before any run.

---

## 3. Graph model usage

Same `Graph` type as the platform (§4 there). Agent semantics:

- **node** = a step. `node.type` ∈ catalog (§5.1). `node.props` = step config (prompt, tool
  name, condition expression…).
- **edge** = **control + data flow**: "when this step finishes, go to that one, passing its
  output." `edge.props` may carry a branch label (`true`/`false`) or a data mapping.
- **`parent`** (containment) = optional grouping (a sub-workflow / collapsible group).

> Compared to cloud, agents are **edge-heavy, containment-light** — the value is in the wiring.

---

## 4. The compiler (graph → workflow spec)

A **pure function** (same registry-of-emitters pattern as the cloud/PDF/ZPL emitters). The
artifact is a **serializable state machine**, not code to apply:

```ts
interface WorkflowSpec {
  start: NodeId
  steps: Record<NodeId, {
    type: string
    config: Record<string, unknown>      // from node.props
    next: Array<{ to: NodeId; when?: string }>   // from outgoing edges (+ branch labels)
    inputsFrom: Array<{ from: NodeId; as: string }>  // data wiring from incoming edges
  }>
}

export function compile(g: Graph): WorkflowSpec { /* walk nodes; resolve edges → next/inputsFrom */ }
```

Invariants (mirroring cloud §5.3):
- **Determinism:** same graph ⇒ identical spec ⇒ snapshot-testable.
- **Edges become flow**, not free text: control edges → `next`, data edges → `inputsFrom`.
- **Secrets/credentials are not in the graph:** a `tool` node references a credential *handle*,
  resolved at run time from the user's secret store.

---

## 5. Catalog & runtime

### 5.1 Node catalog (v1)

| Node | Role |
|---|---|
| `input` / `trigger` | entry point; defines run inputs (or an inbound webhook — reuse `WEBHOOK_CONNECTOR`) |
| `llm` | a model call (Bedrock → Claude); prompt + bound inputs → output |
| `tool` | a typed function/API call (credential handle in props) |
| `http` | a raw HTTP request |
| `branch` | conditional fan-out (edges labelled `true`/`false` or by case) |
| `loop` | iterate over a collection / until a condition |
| `human` | pause for human input/approval, then resume (R6) |
| `output` | terminal; shapes the run result |

> Resist breadth (the cloud pack's catalog-trap lesson): ~8 nodes first.

### 5.2 Runtime adapter (server-side, durable)

The "run" verb is shared (platform §6); the agent adapter is a **server-side DAG executor**:

```
spec → executor walks steps → each step runs (llm/tool/http/…) →
   stream {nodeId, status, output} over WebSocket → canvas lights node-by-node →
   checkpoint after each step (durable) → on crash, resume from last checkpoint →
   human node ⇒ pause, await input, resume → output node ⇒ persist run result
```

- **Reuse the existing durable-retry infrastructure** (the `TC-0095` durable-retry work) for
  checkpointing/resume — this is exactly its shape.
- **Live reflection** uses the same WebSocket channel pattern the platform run-loop defines.
- **Ephemeral compute, durable state:** the worker is disposable; run state (checkpoints,
  intermediate outputs) persists so a run survives a worker crash.
- A `tool`/`http` node that runs **untrusted generated code** is the only case needing a code
  sandbox — defer to a managed sandbox (E2B) *only if/when* such a node exists; the v1 catalog
  (typed tools + LLM + HTTP) runs in your normal backend.

---

## 6. Lint + LLM

- **Linter (R3):** unreachable nodes, a cycle not wrapped by a `loop`, a required input with no
  incoming data edge, a `tool` node missing a credential handle, an `llm` node with an empty
  prompt. Pure rules over the graph; block vs warn.
- **LLM co-pilot:** explains lint findings, proposes graph edits (structured) — graph only.
- **LLM architect (R7):** NL intent → **select + adapt** a vetted reference workflow
  ("support-triage", "research-summarize", "data-enrichment") onto the canvas for review.
  Same intent→structure muscle as cloud's architect and the existing AI PDF→template feature.

---

# Implementation Phases

## How to read this

Assumes the **shared foundation (platform P0–P2)** exists: spine, graph canvas, pack registry,
run-loop shell, LLM-architect entry. These phases build the **agent pack** on it.

- **Two tracks.** Track 1 (A0–A3) is the **deterministic core** — draw → compile → lint → a
  runnable spec, executed by a simple synchronous runner. Track 2 (A4–A6) adds **durable,
  live, human-in-loop** execution and the LLM architect.
- **Effort** S/M/L. **Exit criteria** gate each phase. **Milestones** are demoable.

```
TRACK 1 — deterministic core        TRACK 2 — live durable runtime + LLM
A0 ─ A1 ─ A2 ─ A3                    A4 ─ A5 ─ A6
          └──MA1──┘                       └──MA2──┘ └MA3┘
```

| Milestone | Phases | What you can show |
|---|---|---|
| **MA1 — Runs once** | A0–A3 | Draw a 3-node flow (input→llm→output) → run → result, synchronous |
| **MA2 — Live & durable** | A4–A5 | Multi-step flow streams node-by-node; survives a worker restart mid-run |
| **MA3 — Describe it** | A6 | "An agent that triages support emails" → reviewable workflow → run |

---

# TRACK 1 — Deterministic core

## A0 — Agent pack skeleton
**Effort:** S · **Depends on:** platform P0–P2

Register the `agent` pack (wire mode) with an empty catalog and a no-op compiler.

**Files (new):** `src/builder/packs/agent/index.ts`

**Exit criteria:** the agent pack appears in the registry; an empty agent graph round-trips.

---

## A1 — Node catalog v1
**Effort:** M · **Depends on:** A0

Catalog entries (§5.1): `input`, `llm`, `tool`, `http`, `branch`, `loop`, `human`, `output` —
each with prop schema, valid edge types, and labelled-edge support for `branch`/`loop`.

**Files:** `src/builder/packs/agent/catalog/*.ts`

**Exit criteria:** all v1 nodes are placeable and wireable; `branch` exposes labelled outputs.

---

## A2 — Compiler: graph → WorkflowSpec
**Effort:** M · **Depends on:** A1

The pure function (§4): resolve control edges → `next`, data edges → `inputsFrom`.

**Files:** `src/builder/packs/agent/compile/index.ts`

**Exit criteria:** **MA1 (compile half)** — a 3-node graph compiles to a valid `WorkflowSpec`;
snapshot-stable; deterministic.

---

## A3 — Synchronous runner + linter
**Effort:** M · **Depends on:** A2

A minimal in-process executor (no streaming/durability yet) + the linter (§6).

**Tasks**
- Walk the spec start→output; run `llm` (Bedrock/Claude), `tool`, `http`, `branch` nodes.
- Linter rules; block invalid graphs before run.

**Files:** `backend/agent/runnerSync.js`, `src/builder/packs/agent/lint/rules.ts`

**Exit criteria:** **MA1** — drawing input→llm→output and pressing Run returns the model
result in the UI; a dangling required input is caught by lint and blocks the run.

> Track 1 is a usable product (synchronous agents). Begin Track 2 once MA1 holds.

---

# TRACK 2 — Live durable runtime + LLM

## A4 — Live streaming runner
**Effort:** L · **Depends on:** A3 + platform run-loop WebSocket

Replace the sync runner with a streaming executor: emit `{nodeId, status, output}` per step so
the canvas lights up node-by-node.

**Files:** `backend/agent/runner.js`, `src/builder/packs/agent/run/LiveOverlay.tsx`

**Exit criteria:** a 5-node flow executes with each node visibly transitioning
pending→running→done/error on the canvas in real time.

---

## A5 — Durability + human-in-the-loop
**Effort:** L · **Depends on:** A4

Make runs survive crashes and support pauses (R5, R6).

**Tasks**
- Checkpoint run state after each step on the **existing durable-retry infra** (`TC-0095`);
  resume from last checkpoint on worker restart.
- `human` node: pause, persist, await input via the API, resume.

**Files:** `backend/agent/checkpoint.js`, `backend/agent/resume.js`,
`src/builder/packs/agent/run/HumanStep.tsx`

**Exit criteria:** **MA2** — kill the worker mid-run; on restart the run resumes from the last
completed step (no re-execution of completed steps); a `human` node pauses and resumes on input.

---

## A6 — LLM architect (intent → workflow)
**Effort:** L · **Depends on:** A5 + platform LLM-architect entry

NL intent → starter workflow via a vetted reference-workflow library (§6).

**Files:** `backend/agent/llm/architect.js`, `src/builder/packs/agent/patterns/*`

**Exit criteria:** **MA3** — "an agent that triages support emails" yields a reviewable
workflow (input→classify(llm)→branch→tool/human→output) the user can edit and run.

---

## Cross-cutting

| Concern | When | Note |
|---|---|---|
| Credential handles for `tool`/`http` | A1 + A3 | resolved at run time from secret store; never in graph |
| Cost / metering | before A4 public | a *run* (and token usage) is the billable event; reuse `ai-feature-gating` |
| Untrusted-code tool nodes | only if introduced | gate behind a managed sandbox (E2B); not in v1 catalog |
| Trigger/webhook entry | A1 onward | reuse `WEBHOOK_CONNECTOR` inbound primitive for `trigger` nodes |
| Reference-workflow library growth | A6 onward | curated, not generated — the architect's reliability floor |

## Dependency graph

```
A0 → A1 → A2 → A3 ─(MA1)→ A4 → A5 ─(MA2)→ A6 ─(MA3)
```

## First spike

After the platform foundation, drive **input → llm → output** through **A0–A3** (synchronous),
then add streaming (A4) on that same flow. That proves graph → spec → live execution before
catalog breadth (branch/loop/human) or durability land.
