# Implementation Roadmap — Data, Workspace & AI Ingest

> **Status:** Sequencing plan / canonical implementation reference
> **Scope owner:** Junaid Khan
> **Purpose:** A single ordered plan for the next phase of work — *automated intent*, the *three-tile workspace*, and the *AI PDF/image → template rebuild* — written so an implementer (human or AI) can pick it up cold. It records **what already exists**, **what is new**, **the order**, **definition of done per initiative**, and **the scope-creep lines that must not be crossed.**

---

## 0. How to use this document

1. Read §2 (system-as-built inventory) first — most of the data/intent layer **already exists**; do not rebuild it.
2. Follow the order in §4. It is dependency-correct and risk-ordered.
3. Each initiative in §5 has: **Goal · What exists · What's new · Files to touch · Definition of Done · Scope-creep guard.** Treat the DoD as the acceptance test and the guard as a hard stop.
4. Cross-cutting invariants (§6) apply to every initiative — they are the through-line of all prior design docs.
5. Companion design docs (deeper detail per area):
   - `AI_PDF_REBUILD_ARCHITECTURE.md` — the PDF/image → template pipeline (§5, Initiative C).
   - `COMPONENT_EXPORT_ARCHITECTURE.md` + `COMPONENT_EXPORT_PHASES.md` — canvas → React bundle (parallel track, §7).
   - `BULK_EXPORT_ARCHITECTURE.md` — bulk run model.

---

## 1. The product in one sentence

A user brings a **layout** (built on the canvas, or rebuilt by AI from a PDF/image) and **data** (Excel/CSV/API, flat or nested), and the system **binds them and produces output** — one document, one-per-row, or relational — with the system inferring structure and intent rather than interrogating the user.

Three workspaces make the three pillars visible:

| Tile | Pillar | Backing model |
|---|---|---|
| **Canvas** | the layout/template | `TemplateDocument` (`src/types/canvas.ts`) |
| **Datasource** | the data + its structure | `RuntimeDataStructure` / `CanonicalDocument` (`src/types/runtimeDataStructure.ts`, `dataSource.ts`) |
| **Bridge** | the join: bindings + intent + preview | `mappingEngine.ts` + `buildRenderContext()` |

---

## 2. The system as-built (ground-truth inventory — do NOT rebuild)

This is what already exists and works. New work *restructures and connects* these; it does not replace them.

### 2.1 Data + intent layer (more complete than expected)

| Capability | Where | State |
|---|---|---|
| Parse Excel/CSV/JSON/API → IR | `src/services/dataSourceService.ts`, `apiIntegration.ts`, `CanonicalDocument` (`src/types/dataSource.ts`) | ✅ Built |
| Runtime data schema | `RuntimeDataStructure` (`src/types/runtimeDataStructure.ts`) | ✅ Built |
| **Confidence tiers** (auto ≥0.95 / suggest ≥0.70 / uncertain ≥0.40 / none) | `CONFIDENCE`, `getConfidenceTier`, `getConfidenceLabel` | ✅ Built |
| **FK / relationship detection** with documented signal composition (explicit-key, value-intersection) | `ScopingRule`, `ScopingDetectedBy` | ✅ Built |
| Execution plan (single / per-row / relational / grouped / merged) | `ExecutionMode`, `ExecutionPlan` | ✅ Built |
| **Single scoping resolver** (client = server) | `buildRenderContext(rds, rowIndex)` | ✅ Built |
| Relationship approval tracking | `RelationshipApprovalState` (pending/approved/rejected/edited) | ✅ Built |
| Invariant assertions (tests) | `assertRdsInvariants()` | ✅ Built |
| Migration adapter | `toRuntimeDataStructure()` | ✅ Built |

### 2.2 Data/intent UI (exists, needs restructuring not rebuilding)

| Component | Path | Role |
|---|---|---|
| `IntentCapturePanel` | `src/components/TemplateCanvas/IntentCapturePanel.tsx` | Currently **captures** intent upfront → becomes **confirm-inference** (Initiative A) |
| `DataStructureViewer` | `.../DataStructureViewer.tsx` | Seed of the **Datasource tile** (Initiative B) |
| `RelationshipBuilder` / `RelationshipReview` | `.../RelationshipBuilder.tsx`, `RelationshipReview.tsx` | FK review UI — already confidence-driven |
| Upload wizard | `.../upload/UploadPhase.tsx`, `MappingPhase.tsx`, `PhaseIndicator.tsx`, `UploadFooter.tsx`, `UploadData.tsx` | Data upload + field→binding mapping |
| `StructuresDropdown` | `.../StructuresDropdown.tsx` | Structure switching |

### 2.3 Template + binding layer

| Capability | Where | State |
|---|---|---|
| Template document schema (versioned) | `TemplateDocument` v2.0 (`src/types/canvas.ts`) | ✅ Built |
| `executionMode` home on template meta | `TemplateMeta.executionMode` | ✅ Built (declared by built-ins; **to be inferred** for others) |
| Element → view dispatch | `CanvasElementView.tsx` + per-element components | ✅ Built |
| Binding primitives | `CellBinding {path, scope}`, `TableBinding {collectionKey, itemAlias}`, `ChartElementType.binding` (`layoutTable.ts`, `canvas.ts`) | ✅ Built |
| Mapping engine (resolver, mirrored client/server) | `src/services/mappingEngine.ts` | ✅ Built |
| Properties panel (binding authoring) | `PropertiesPanel.tsx` + `properties/*` | ✅ Built |
| Emitters: PDF, ZPL | `backend/renderer/pdfLibRenderer.js`, `zplRenderer.js` (per `COMPONENT_EXPORT_ARCHITECTURE.md`) | ✅ Built |

### 2.4 What does NOT exist yet (the actual new work)

- **Template-aware intent inference** — intent today is captured pre-upload and detection runs on **data alone**; it does not yet read the **template's bindings** to derive intent (Initiative A).
- **Unified three-tile workspace** with one shared store + linked selection (Initiative B).
- **AI PDF/image → template** pipeline (Initiative C — see `AI_PDF_REBUILD_ARCHITECTURE.md`).
- **URL → component** ingest (deferred — §7).

---

## 3. Initiatives at a glance

| ID | Initiative | Nature | Risk | Relative cost |
|---|---|---|---|---|
| **A** | Template-aware **auto-intent** (capture → infer → confirm) | Mostly wiring existing infra + template-awareness | 🟢 Low | Small |
| **B** | **Three-tile workspace** (Canvas / Datasource / Bridge) | Restructure + shared store + linked selection | 🟡 Medium | Medium |
| **C** | **AI PDF/image → template rebuild** | New pipeline (extraction → structure → schema) | 🟡 Medium | Large |
| **D** | **URL → component → sandboxed bundle** | New ingest adapter feeding existing emitter | 🔴 High / speculative | **Deferred** |

---

## 4. The sequence (dependency-correct, risk-ordered)

```
A. Auto-intent  ──►  B. Three-tile workspace  ──►  C. AI PDF rebuild
(solidify the         (present A's inference          (new ingest;
 inference in the      + bindings + preview            Bridge already
 existing UI)          as the Bridge tile)             ready to receive)

                         D. URL → component  ── DEFERRED (do not start)

Parallel, independently phased: Component export (canvas → bundle)
  — see COMPONENT_EXPORT_PHASES.md (P0–P8). Not gated by A/B/C.
```

**Why this order:**
1. **A first** — highest ROI, lowest cost; the confidence/scoping/execution-plan infra already exists, so this is largely making inference template-aware and flipping the panel from *ask* to *confirm*. It produces the logic that B will present.
2. **B second** — the workspace is where A's inference and the bindings/preview live (the Bridge tile). Building B before A solidifies the inference would mean presenting an unfinished decision.
3. **C third** — the largest new build; phased and gated on its own eval harness. The Bridge/Datasource tiles from B are exactly where a rebuilt-from-PDF template gets bound and previewed, so C lands into a ready home.
4. **D deferred** — credible sibling, but starting it splits focus four ways. Park it.

---

## 5. Initiatives in detail

### Initiative A — Template-aware auto-intent (capture → infer → confirm)

**Goal.** Stop asking the user to declare flat/relational/per-row upfront. Instead **infer** the `ExecutionPlan` from *(data shape × template bindings)*, **show it with reasoning**, and **prompt only on genuine ambiguity** — using the confidence machinery that already exists.

**What exists.** `CONFIDENCE` tiers, `getConfidenceTier`, `ScopingRule` + FK detection, `ExecutionPlan`/`ExecutionMode`, `buildRenderContext`, `RelationshipApprovalState`, `IntentCapturePanel`, `RelationshipReview`. Relationship detection is *already* confidence-scored and never silently committed.

**What's new.**
1. **Template-binding signal** — read the loaded template's bindings to constrain intent:
   - only root-scoped (`CellBinding.scope: 'root'`) field bindings, no collection-bound repeating region → `single` *or* `per-row` (**the one genuinely ambiguous fork**).
   - a `TableBinding` pointing a repeating region at a collection → `single` (rows fill the table).
   - bindings referencing ≥2 collections, or a child table bound under a driver → `relational`.
2. **An intent inference function** combining data signals (collection count, row counts, FK detection) **and** the template-binding signal → a proposed `ExecutionPlan` with a confidence score and a human explanation.
3. **`IntentCapturePanel` → `IntentConfirmPanel`** — shows the proposed plan + reasoning (*"3 sheets · Orders links to Customers via `customer_id` · line-items table bound to Orders → Relational"*), preselects when tier is `auto`, asks the **one** plain-language question only on the ambiguous fork (*"Generate 50 documents (one per row) or one?"*), always overridable.
4. **Write inferred result into `TemplateMeta.executionMode`** (built-ins declare it; AI/user templates get it inferred at link time).

**Files to touch.** `src/types/runtimeDataStructure.ts` (inference helper or new `src/services/intentInference.ts`), `IntentCapturePanel.tsx`, `RelationshipReview.tsx` (reuse), `mappingEngine.ts` (read binding scopes), `TemplateMeta` write path.

**Definition of Done.**
- Inference function returns `{ plan: ExecutionPlan, confidence, explanation }` from RDS + template bindings, covered by unit tests over the §5-table cases.
- `auto`-tier results preselect and require no interaction; only the single-collection/root-only fork prompts.
- FK detection always shows *which* link it found (reuses `ScopingRule.explanation`).
- `assertRdsInvariants` still passes; `executionMode` persisted on the template.

**Scope-creep guard.** Do **not** rebuild the confidence/scoping system — it exists. Do **not** add new execution modes. Inference must be **deterministic where signals are exact** (binding scope, collection count); only FK/name-matching is fuzzy. Never auto-execute an expensive run (N documents) without a visible, reversible confirmation.

---

### Initiative B — Three-tile workspace (Canvas / Datasource / Bridge)

**Goal.** Surface the three pillars as three workspaces over **one shared model**, with **tri-directional linked selection**, so users can see and steer the join instead of holding it in their head.

**What exists.** Canvas (`TemplateCanvas.tsx` + element views), `DataStructureViewer.tsx` (Datasource seed), mapping/preview pieces (`mappingEngine.ts`, `buildRenderContext`), the upload/mapping wizard.

**What's new.**
1. **Tile shell / launcher** — three entry points (Canvas, Datasource, Bridge).
2. **Single source of truth store** — `TemplateDocument` + `RuntimeDataStructure` + (later) `ComponentProfile` held once; each tile is a **pure projection**, edits propagate reactively. *This is the make-or-break engineering.*
3. **Datasource tile** — lead with a **structure/schema view** (collapsible tree of bindable paths + type + one sample value, e.g. `orders[].lineItems[].amount : number`, nested to any depth), raw JSON as a secondary mode. Built on/extending `DataStructureViewer`.
4. **Bridge tile = the join** — hosts (a) the field→binding mapping (auto-proposed by name match, user confirms), (b) the **intent confirm panel from Initiative A**, (c) the **editable merged preview** (template × data via `buildRenderContext`).
5. **Tri-directional linked selection** — select an element in Canvas → its bound path highlights in Datasource → its filled value highlights in Bridge preview.
6. **Binding authoring location decision:** **author in context (Canvas Properties panel), manage/review centrally (Bridge).** One writer, one dashboard — never two independent editors.

**Files to touch.** New workspace shell + shared store (`src/components/TemplateCanvas/` or a new `src/workspace/`), extend `DataStructureViewer.tsx`, refactor mapping/preview into the Bridge tile, wire selection state into the shared store.

**Definition of Done.**
- Three tiles render from one store; an edit in any tile reflects live in the others (no copy/drift).
- Datasource tile shows nested structure with bindable paths + types; raw-JSON toggle works.
- Bridge previews the merged output and reflects the inferred intent from Initiative A.
- Linked selection works across all three directions.
- An **automated happy path** exists: load template + link data → intent inferred → preview renders, *without forcing the user to visit each tile manually.*

**Scope-creep guard.** **Restructuring, not rewrite** — tiles are projections of the *existing* model and resolver. If you find yourself rewriting `mappingEngine.ts` or `buildRenderContext`, stop. Don't put template-editing controls in Bridge or data-editing controls in Canvas — each tile keeps its single responsibility. Linked selection is **required**, not optional — without it this is three fragmented screens.

---

### Initiative C — AI PDF/image → template rebuild

**Goal.** Upload a PDF (later image) → produce a schema-accurate `TemplateDocument` that opens in Canvas and is immediately bindable in Bridge.

**What exists.** Nothing of the pipeline yet; the **target schema** (`TemplateDocument`, `LayoutTableElement`), the **PDF emitter** (for the eval harness round-trip), and the **Bridge/Datasource home** (Initiative B) all exist.

**What's new.** The full pipeline — see `AI_PDF_REBUILD_ARCHITECTURE.md` for the authoritative design. Summary of its phased sequence (build in this order, each shippable, each gated on Phase 0):

| Phase | Deliverable |
|---|---|
| **0** | Eval harness — `template → PDF → pipeline → template'`, schema-level diff (free ground-truth pairs from built-ins) |
| **1+2+5+6** | Extraction (pdfjs) + normalization (pt→px, clustering) + schema validate/repair + assembly, with a *trivial pass-through structurer* (text/line/box/image, no LLM) — proves geometry round-trips |
| **4** | LLM structurer — classification + zone inference |
| **4b** | Table detection → `LayoutTableElement` |
| **3** | Retrieval (geometry-masked) + match-and-diff |
| **7** (future) | Raster sources (scanned PDF / image) via extraction adapter — see `AI_PDF_REBUILD_ARCHITECTURE.md` §14 |

**Files to touch.** New `src/services/pdfImport/` (`extract · normalize · retrieve · structure · validate · assemble · fallback · types`) + `eval/`; new upload-wizard intent ("Rebuild from PDF") alongside the data intent.

**Definition of Done (MVP).** Phase 0 harness in CI; born-digital single-page PDF → valid `TemplateDocument` that opens in Canvas; geometry round-trips within IoU threshold; every primitive ends **mapped / approximated / reported-dropped** (never silently lost); fidelity report written to the reserved `TemplateDocument.ai` field and surfaced in the editor.

**Scope-creep guard.** Build Phase 0 **first**; AI/RAG layers **last**. Geometry comes only from extraction (re-injected post-LLM), validity only from the schema validator — **RAG is a quality layer, never correctness.** Reject scanned PDFs with a clear message at MVP (raster support is the deferred Phase 7). Add the cheap `source`/`confidence` fields to the extraction IR now (see arch doc §14.4).

---

## 6. Cross-cutting invariants (apply to every initiative)

These are the through-line of all design docs. A change that violates one is wrong regardless of output quality.

1. **Source of truth per axis.** Geometry from extraction (never RAG); structure from the artifact, RAG only as interpreter; style measured, RAG only as normalizer. (Data side: collection counts/binding scopes are exact; FK/name-matching is fuzzy.)
2. **Propose → explain → confirm; never silent.** Inference (intent, FK, field mapping, PDF structure) is shown with reasoning and is overridable. High confidence preselects; low confidence prompts. Nothing expensive or irreversible runs without a visible confirm.
3. **One shared model; views are projections.** No tile/pane holds its own copy. The resolver (`buildRenderContext`, `mappingEngine`) is the single join, mirrored client/server.
4. **Three terminal states for anything ingested** — mapped / approximated / reported. A fourth (silently vanished or fabricated) is impossible by construction.
5. **Determinism guarantees correctness; the model only assists.** Schema validity, contracts, and exact signals are deterministic code. The LLM is fenced to where determinism is hardest (PDF structure classification, responsive layout) and is always behind a validate/confirm gate.
6. **Confidence tiers are shared vocabulary.** Reuse `CONFIDENCE` / `getConfidenceTier` everywhere a proposal is surfaced — intent, FK, field mapping, PDF-element confidence — so the UX of "auto / suggest / uncertain" is uniform.

---

## 7. Parallel & deferred tracks

- **Component export (canvas → React bundle)** — independently phased in `COMPONENT_EXPORT_PHASES.md` (P0–P8). Not gated by A/B/C; it is a separate emitter over the same IR. The Bridge/preview work in B should stay compatible with its `ComponentProfile` overlay (reserve a slot in the shared store).
- **Initiative D — URL → component → sandboxed bundle** — **deferred.** Per `AI_PDF_REBUILD_ARCHITECTURE.md` §15: it reuses the adapter seam, the component IR (`ComponentProfile`/`FieldSpec`), and the `react-bundle` emitter — the only genuinely new surface is a DOM ingest adapter + inferring the `FieldSpec` contract from a rendered DOM. **Do not start until A/B/C are shipped.**

---

## 8. The two ways this goes wrong (read before starting)

1. **"Restructuring" becomes "rewrite."** The engine works (§2). The temptation is to rebuild working pieces while re-presenting them. Guard: tiles and panels are *projections of the existing model and resolver*. Rewriting `mappingEngine.ts`, `buildRenderContext`, or the confidence/scoping system is the signal to stop.
2. **Doing all four initiatives at once.** None of these is infeasible; the failure mode is finishing all of them to 70%. Ship A, then B, then C. Park D. Let component-export proceed on its own track.

---

## 9. One-line bottom line

The data/intent engine already exists and is strong; the work is **(A) make intent inference template-aware and confirm-not-ask, (B) present the three pillars as one linked workspace, (C) add AI PDF ingest into that ready home** — in that order, protecting the working core and resisting the pull of the fourth idea.
