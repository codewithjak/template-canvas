# Builder Platform — Architecture (the spine)

> **Status:** Proposal / Design
> **Date:** 2026-06-26 · **Branch context:** TC-0099
> **Scope owner:** Junaid Khan
> **This doc ties together:** `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` (cloud pack) ·
> `AGENT_BUILDER_ARCHITECTURE.md` (agent pack) · `COMPONENT_EXPORT_ARCHITECTURE.md` (UI pack)
> **Companion memory:** `canvas-run-anything-vision`

---

## 1. Goal

One platform: the user **draws on a graph canvas** and the system **runs** what they drew —
whether it's a **cloud architecture**, a **UI component**, or an **agentic workflow**. The
canvas, the compile step, and the run-loop are **shared**; everything domain-specific is a
**pack**.

> **Draw anything → run it.** One canvas, one run-loop, three packs.

This is the *what & why* of the platform. Each pack's depth lives in its own doc (§5).

---

## 2. Decision: one graph canvas for all (recorded)

**Decision (2026-06-26):** all three domains share a **single graph canvas** — including UI.
We explicitly do *not* split into a separate layout canvas.

A graph canvas is really three primitives — **nodes**, **containment** (a node holding
children), and **edges** (arrows between nodes). Each domain uses a different *mix*, which is
why one canvas covers all three:

| Domain | Containment | Edges | Shape |
|---|---|---|---|
| **Agent workflow** | light | **heavy** | a DAG — wire step → step |
| **Cloud infra** | medium (VPC→subnet→resource) | medium (connections) | a contained graph |
| **UI component** | **heavy** (layout tree) | light (data-binding / events) | a containment tree |

> **Why this is sound:** containment is *already required* for cloud (VPC→subnet→EC2). UI is
> just the containment-heavy end of the same spectrum — a layout tree is nested container
> nodes (`stack`/`row`/`grid`) holding leaf nodes (`button`/`input`/`text`). React Flow
> supports parent/child (sub-flow) nodes natively, so trees are first-class on the graph
> canvas.

**Mitigating the known UX risk.** Editing UI by "wiring boxes with arrows" would be awkward.
So the UI pack runs the shared graph canvas in a **layout interaction mode**: containment is
expressed by drag-to-nest (not drawn edges), edges are reserved for data binding/events, and
the property panel drives styling. Same substrate, domain-appropriate affordances. (See §7
reconciliation — this supersedes the layout-canvas assumption in `COMPONENT_EXPORT`.)

---

## 3. The spine

Everything domain-specific sits behind one interface:

```ts
interface DomainPack<Graph, Artifact, Result> {
  id:      "cloud" | "agent" | "ui"
  catalog: NodeCatalog                            // what you can draw (nodes, valid nesting/edges)
  mode:    "wire" | "layout"                      // graph-canvas interaction mode (§2)
  compile: (g: Graph) => Artifact                 // pure, deterministic IR emit
  lint:    (g: Graph) => Diagnostic[]             // pure rules
  run:     (a: Artifact, ctx: RunContext) => Promise<Result>   // the runtime adapter
}
```

The platform owns: the **graph canvas**, the **pack registry**, the **run-loop UI**
(compile → lint → review → run → reflect results), and the **LLM architect** entry
("describe it → starter graph"). A pack owns: its catalog, its emitter, its rules, its runtime
adapter.

> **Invariant across all packs — *LLM proposes, the deterministic engine disposes.*** The LLM
> shapes the **graph**; a pure compiler makes the **artifact**; a human gate guards anything
> irreversible. Holds for cloud `apply`, agent runs, and UI builds alike.

---

## 4. The single graph model

```ts
interface GraphNode { id: string; type: string; parent?: string; props: Record<string, unknown> }
interface GraphEdge { from: string; to: string; type: string; props?: Record<string, unknown> }
interface Graph     { nodes: GraphNode[]; edges: GraphEdge[]; meta: { pack: string; name: string } }
```

- **`parent`** → containment (nesting). Cloud: subnet in VPC. UI: button in a row.
- **`edge`** → a relationship that compiles to a *reference* or a *rule* or *control/data flow*,
  per pack.
- **`props`** → node arguments (cloud: cidr/size; UI: label/style; agent: prompt/tool name).

Same three structural facts; each pack's `compile` interprets them into its own IR.

---

## 5. The three packs

| Pack | Canvas mode | catalog | compile → | run → | Doc |
|---|---|---|---|---|---|
| **Cloud** | wire | AWS services | Terraform | in-account ephemeral runner (CodeBuild) | `VISUAL_CLOUD_BUILDER_ARCHITECTURE.md` |
| **Agent** | wire | LLM / tool / branch / loop | workflow spec (state machine) | server-side streaming runner (durable) | `AGENT_BUILDER_ARCHITECTURE.md` |
| **UI** | layout | containers + leaf elements | React bundle | WebContainers (browser) | `COMPONENT_EXPORT_ARCHITECTURE.md` |

All three: deterministic compile, a human-reviewed gate, results reflected onto the graph.

---

## 6. The shared run-loop (per-domain adapters)

The run *verb* is shared; the runtime *adapter* differs (and that's expected — runtimes don't
generalize):

```
draw → compile (pure) → lint → ── REVIEW GATE ── → run(adapter) → reflect results on graph
```

| Pack | Runtime adapter | "Live" means |
|---|---|---|
| Cloud | ephemeral job **in the user's account**; `plan`→approve→`apply`→capture→teardown | real resources provisioned |
| Agent | server-side DAG runner on existing durable-retry infra; streams node state | the workflow executes, node-by-node |
| UI | WebContainers in the browser tab | the component runs interactively |

> **Ephemeral compute, durable state** holds for cloud (Terraform state) and agent (run
> checkpoints); UI state lives in the tab.

---

## 7. Reconciliation & build sequencing

### Canvas code distribution — base + thin children (decided 2026-06-26)

Each canvas family is a **base that holds all shared behavior + thin per-type children**
(composition, not inheritance — children pass the base a `pack`/`profile`):

```
GraphCanvasBase  (parent — all graph logic, once)
  ├─ CloudCanvas   = <GraphCanvasBase pack={cloudPack} />        ← one thin file each
  ├─ AgentCanvas   = <GraphCanvasBase pack={agentPack} />
  └─ UICanvas      = <GraphCanvasBase pack={uiPack} mode="layout" />
```

Each builder is a **self-contained folder** (`packs/<id>/` = `catalog · compile · lint · run ·
<Id>Canvas.tsx`) so one pack's work never touches another's. The shared shell (top bar,
properties pattern, persistence) sits above *both* canvas families; the two canvas **cores**
(page-layout vs graph) are not forced under a common base.

**Scaffolded (platform P0, branch TC-0099):** `src/builder/` — `types/blueprint.ts`,
`graph/spine/{domainPack,registry}.ts`, `graph/GraphCanvasBase.tsx`, and
`graph/packs/{cloud,agent,ui}/`. Typechecks + lints clean. React Flow wiring replaces the
placeholder canvas in P1.

**TemplateCanvas split deferred (decided 2026-06-26):** the same base+children refactor for the
existing doc/image canvas (→ `TemplateCanvasBase` + `DocTypeCanvas` + `ImageTypeCanvas`) is the
intended end-state but is **not done now** — TemplateCanvas stays untouched to keep the shipping
editor stable. Revisit as an isolated, separately-verified refactor later.

### Reconciling the UI pack with the graph-canvas decision

`COMPONENT_EXPORT_ARCHITECTURE.md` was written against the *layout* canvas. Under §2 the UI
pack moves onto the shared **graph canvas in layout mode**: its layout containers become
container nodes; its field/element model becomes leaf nodes; its React-bundle emitter and
WebContainers runtime are unchanged. **Action:** add a "graph-canvas migration" note to the
component-export phases (its emitter and props contract carry over verbatim; only the editing
surface changes).

### Cross-pack build order

```
SHARED FOUNDATION         then PACKS (each on the foundation)
P0 spine + graph model     CLOUD  → VISUAL_CLOUD_BUILDER phases (first vertical to ship)
P1 graph canvas (React     AGENT  → AGENT_BUILDER phases
   Flow: nodes/nest/edges)  UI     → COMPONENT_EXPORT phases (re-homed to layout mode)
P2 pack registry +
   run-loop shell + LLM
   architect entry
```

Build the **shared foundation (P0–P2) once**, then deliver packs against it. **Cloud is the
first pack to ship** (fully designed, end-to-end). Agent is the natural second (same wire mode,
reuses durable-retry infra). UI re-homes its existing design last.

> **First spike for the whole platform:** build P0–P2, then drive the **cloud** pack's
> reference blueprint (VPC+EC2+SG+RDS) through to "live in a throwaway account." That proves
> the spine + canvas + run-loop end-to-end with one real pack before the others land.
