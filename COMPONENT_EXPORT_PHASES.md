# Component Export — Development Phases

> **Companion to** `COMPONENT_EXPORT_ARCHITECTURE.md`. That doc is the *what & why*;
> this doc is the *build order*.
> **Date:** 2026-06-13 · **Branch context:** TC-0041

---

## How to read this

- **Two tracks.** Track 1 (P0–P5) is the **deterministic core** — a complete, shippable
  product on its own. Track 2 (P6–P8) is the **LLM-assisted layer** that makes output
  Lovable-class. Track 2 sits on top of Track 1 and never replaces it (the deterministic
  core is always the fallback floor — see architecture §5.5).
- **Effort** is sized S / M / L (relative), not dated — pick dates against your team.
- **Exit criteria** are the objective "done when" gate for each phase. Do not start a
  phase until its dependencies' exit criteria are met.
- **Milestones (M1–M4)** are the demoable/releasable checkpoints.

```
TRACK 1 — deterministic core (ships alone)      TRACK 2 — LLM layer (on top)
P0 ─ P1 ─ P2 ─ P3 ─ P4 ─ P5                       P6 ─ P7 ─ P8
        └─M1─┘   └M2┘   └─M3─┘                          └────M4────┘
```

| Milestone | Phases | What you can show |
|---|---|---|
| **M1 — First runnable bundle** | P0–P3 | Design a template → export → `npm run dev` shows it |
| **M2 — Interactive** | P4 | The exported form captures input, validates, emits `onSubmit` |
| **M3 — Responsive (deterministic)** | P5 | Layout containers → flex/grid; fits narrow & wide hosts |
| **M4 — LLM-class output** | P6–P8 | Idiomatic responsive code, verified, cached, with fallback |

---

# TRACK 1 — Deterministic core

## P0 — Emitter foundation
**Effort:** S · **Depends on:** none

Establish the export path as a first-class emitter beside PDF/ZPL.

**Tasks**
- Define `Emitter<TOptions, TArtifact>` interface (architecture §5.3).
- Create `react-bundle` emitter skeleton + a CLI/internal entry that takes a
  `TemplateDocument` and writes an (empty) bundle folder.
- Define the `ComponentProfile` overlay type (§5.2) alongside `canvas.ts` — additive,
  read by the export path only.

**Files (new/touched):** `src/export/emitters/Emitter.ts`,
`src/export/emitters/reactBundle/index.ts`, `src/types/componentProfile.ts`

**Exit criteria:** calling the emitter on any existing template produces a folder skeleton
matching architecture §3 (empty files, valid `package.json`).

---

## P1 — Element visitor → fixed-size component (no props)
**Effort:** M · **Depends on:** P0

Emit a compiling, runnable React component that reproduces the canvas as a **fixed-size**
block (strategy A). No interactivity yet — this is the deterministic floor.

**Tasks**
- Extract a **shared element visitor** from the existing dispatch in
  `TemplateCanvas.tsx:883–998` so canvas preview and codegen can't drift (§5.4).
- For each `CanvasElement` type, emit static JSX at its absolute `x/y` inside a wrapper
  sized to the page (e.g. 794px).
- Wire AST generation (`ts-morph`) + Prettier pass.
- Emit `MedicalBillingForm.tsx`, `styles.css`, `index.ts`.

**Files:** `src/export/visitor/elementVisitor.ts`,
`src/export/emitters/reactBundle/component.ts`, refactor of `TemplateCanvas.tsx` dispatch

**Exit criteria:** exported component **type-checks, lints, and renders** identically to
the canvas for one real template (medical billing form).

---

## P2 — Props / field contract
**Effort:** M · **Depends on:** P1

Turn static elements into a typed, configurable contract (architecture §6.1).

**Tasks**
- Implement the `FieldSpec` model and Decoration-vs-Field classification (§6.1.1–6.1.2).
- Element-type → default field mapping (§6.1.3); reuse `CellBinding.path`/`fallback`.
- Add the **"Field"** section to `PropertiesPanel.tsx` (name, label, type, editable,
  required) with identifier-safety + uniqueness validation (§6.1.4).
- Emit `types.ts` (`...Values` + `...Props`) and per-field component stubs.

**Files:** `src/types/componentProfile.ts` (FieldSpec),
`src/components/TemplateCanvas/PropertiesPanel.tsx`,
`src/export/emitters/reactBundle/{types,fields}.ts`

**Exit criteria:** a user can mark elements as fields in the canvas; export produces a
typed props interface a consumer gets full IntelliSense on.

---

## P3 — Dev harness & bundle packaging
**Effort:** S · **Depends on:** P2

Make the bundle **run independently** (requirement R4).

**Tasks**
- Emit `demo/App.tsx` (sample usage from field defaults) + `demo/main.tsx` + `index.html`.
- Emit `vite.config.ts`, `package.json` (scripts: `dev`, `build`), `README.md`.
- Verify `npm install && npm run dev` boots the demo; `npm run build` produces the bundle.

**Files:** `src/export/emitters/reactBundle/{demo,scaffold}.ts`

**Exit criteria:** **M1** — a downloaded bundle runs with `npm run dev` and is importable
after `npm run build`, with zero manual edits.

---

## P4 — Interactivity (state · validation · events)
**Effort:** L · **Depends on:** P3

The component's reason to exist (architecture §2, §6.1.6–6.1.8).

**Tasks**
- Emit `useState` per editable field; controlled inputs bound to `values[name]`.
- Validation model (`Rule[]`) → pure `schema.ts` `validate(values)`; author rules in
  `PropertiesPanel.tsx`.
- Wire `onChange` / `onSubmit` / `readOnly`; per-field error rendering.
- `display` fields collapse to read-only spans.

**Files:** `src/export/emitters/reactBundle/{component,schema}.ts`,
`src/components/TemplateCanvas/PropertiesPanel.tsx` (validation authoring)

**Exit criteria:** **M2** — in the demo, a user fills fields, fails validation on a missing
required field, then submits successfully and `onSubmit` fires with typed values.

---

## P5 — Design-time layout containers → deterministic responsive
**Effort:** L · **Depends on:** P4

Capture grouping **intent** so output can reflow — and so Track 2 has clean structure to
translate (architecture §6.2.5).

**Tasks**
- Add stack / row / grid **layout containers** to the canvas model + editor (drag elements
  into a container; containers nest).
- Emitter maps containers → `flex` / `grid` deterministically; fields flow inside (no
  absolute `x/y` within a container).
- Keep fixed-size (P1) as a selectable/fallback mode.

**Files:** `src/types/canvas.ts` (container element), canvas editor components,
`src/export/visitor/elementVisitor.ts` (container emit)

**Exit criteria:** **M3** — a containerized design exports a component that reflows
correctly in a 360px and a 1200px host without horizontal scroll.

> **Track 1 is now a complete, shippable product.** Track 2 is optional polish that
> upgrades output quality — do not begin it until M3 holds.

---

# TRACK 2 — LLM-assisted layout (Lovable-competitive)

## P6 — LLM layout lane
**Effort:** L · **Depends on:** P5

Translate the container-annotated IR into **idiomatic responsive** layout via an LLM,
fenced out of all logic (architecture §5.5).

**Tasks**
- Define the LLM lane as a pure function: `(layout IR subtree + design tokens +
  named field slots) → JSX/CSS`. The lane **only arranges black-box field components**
  from P2/P4; it cannot rename/invent fields or touch state/validation.
- Build the prompt/contract: input schema, slot anchors (`FIELD:patientName`), output
  schema (structured).
- Use the latest capable Claude model, temperature 0, structured output.

**Files:** `src/export/llm/layoutLane.ts`, `src/export/llm/prompt.ts`

**Exit criteria:** for the medical billing form, the LLM lane returns layout JSX that wires
every field slot correctly and renders responsively — manually inspected.

---

## P7 — Verify gate + fallback
**Effort:** M · **Depends on:** P6

Make the stochastic lane safe to ship (architecture §5.5).

**Tasks**
- Gate generated output through **`tsc` + ESLint + headless render** of the demo.
- On failure: one **repair pass** (feed the error back to the LLM); if still failing, **fall
  back to the deterministic P1/P5 output**. The bundle always ships.
- Surface to the user which lane produced the result (LLM vs deterministic floor).

**Files:** `src/export/verify/gate.ts`, `src/export/emitters/reactBundle/index.ts`
(orchestration)

**Exit criteria:** an intentionally broken LLM response is caught by the gate and the
bundle still exports (via fallback) — no uncompiled code ever reaches the user.

---

## P8 — Layout cache + fidelity diff
**Effort:** M · **Depends on:** P7

Restore effective determinism and guard against silent drift.

**Tasks**
- **Cache** LLM layout keyed by hash of (layout-relevant IR subtree + model id + prompt
  version) → same design yields same code; regenerate only on change.
- **Fidelity diff:** structural/screenshot comparison of LLM output vs the canvas render;
  flag large deviations for review.

**Files:** `src/export/llm/cache.ts`, `src/export/verify/fidelityDiff.ts`

**Exit criteria:** **M4** — re-exporting an unchanged design is a cache hit (no LLM call,
identical output); a deliberate design change invalidates the cache and regenerates.

---

## Cross-cutting (runs alongside, not a blocking phase)

| Concern | When | Note |
|---|---|---|
| Per-element web equivalents (barcode, date) | P1 + P4 | Decide `<svg>` vs small runtime dep per type (architecture §9) |
| Accessibility (labels, `aria-*`, focus) | P4 onward | Bake into per-field components and the LLM prompt |
| Generated bundle tests | P3 onward | Emit a smoke test + keep one golden bundle in CI |
| LLM cost/key model (service vs BYO key) | before P6 ships | Open decision — affects the §2 "no backend" line |

---

## Dependency graph (at a glance)

```
P0 → P1 → P2 → P3 ─(M1)→ P4 ─(M2)→ P5 ─(M3)→ P6 → P7 → P8 ─(M4)
                                         └ Track 2 requires M3 ┘
```

## First-milestone recommendation

Drive **one** template (the medical billing form) through **P1 → P3** before generalizing.
That single spike proves the whole pipeline (IR → AST → runnable bundle) and de-risks
everything after it. Generalize across element types only once M1 holds.
