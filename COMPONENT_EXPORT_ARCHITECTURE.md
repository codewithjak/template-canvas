# Component Export — Architecture

> **Status:** Proposal / Design
> **Date:** 2026-06-13
> **Author:** Architecture notes (TC-0041)
> **Scope owner:** Junaid Khan

---

## 1. Goal

Let a user **design a single React component on the canvas** (e.g. a *medical billing
form*), and have the system **generate code** and package it into a **reusable bundle**.

The bundle:

- is a self-contained, importable React component (drop into any React app), and
- **runs independently** via its own bundled dev server, so the user can test it in
  isolation before integrating it.

> **One designed component in → one reusable, runnable bundle out.**
> Nothing more, nothing less.

---

## 2. Scope

### In scope

| # | Requirement |
|---|-------------|
| R1 | Design one component visually on the existing canvas |
| R2 | Generate clean React + TypeScript source from the design |
| R3 | Package it as a reusable, importable bundle (`import { X } from '...'`) |
| R4 | Bundle ships with its own dev server (Vite) + demo page → run/test independently |
| R5 | A typed **props contract** so the component is configurable, not a frozen snapshot |

### Explicitly out of scope (for this product)

- Multi-tenant runtime / hosted execution of components
- Backend services, databases, submission persistence, webhooks
- Embedding infrastructure (web-component wrappers, iframe brokers)
- Code round-tripping back **into** the canvas (one-way generation only — see §7)

> **Note on "its own server":** this means a **local dev/preview harness** (Vite dev
> server + demo page) bundled so the component is runnable standalone for testing.
> It is **not** a backend the form POSTs to. If a true backend is ever required, it is
> a separate initiative and out of this document.

### The component is interactive (decided)

The generated component is **interactive**: it captures input, holds state, validates,
and fires `onChange`/`onSubmit`.

**Why presentational export is explicitly rejected:** the canvas already *is* the
presentational view — it renders the design filled with data. Emitting a read-only
component would just reproduce, in worse form, what the user already sees on screen. The
*only* reason to generate a bundle is to add what the canvas cannot: **behavior, state,
a props/event API, and the ability to run inside another app.** That value is, by
definition, interactivity. See §6.

---

## 3. The Deliverable — bundle anatomy

```
medical-billing-form/
  src/
    MedicalBillingForm.tsx   ← the reusable component (generated)
    types.ts                 ← props interface / contract (generated)
    schema.ts                ← validation rules, pure TS (generated)
    styles.css               ← scoped styles (generated)
    index.ts                 ← library export → consumer entry point
  demo/
    App.tsx                  ← sample usage = the test harness (generated once)
    main.tsx                 ← dev-server entry (generated once)
  index.html
  vite.config.ts
  package.json
  README.md
```

Three commands deliver every requirement:

| Command | Delivers | Requirement |
|---|---|---|
| `npm run dev`   | Vite serves the demo page — component runs in isolation | R4 |
| `npm run build` | Produces the importable bundle | R3 |
| `import { MedicalBillingForm }` | Use in the consumer's own app | R3 |

The codegen emitter writes **two artifacts from one IR**: the component (`src/`) and a
demo harness (`demo/`) that exercises it.

---

## 4. How flexible is the current system? (Withstand assessment)

The decisive question: *is the existing architecture able to absorb a code emitter, or
does it fight it?* **It absorbs it.** The system was built as an interpreter over a
render-agnostic model — a code generator is one more interpreter.

### 4.1 What the system already gives us (high reuse)

| Asset | Evidence in codebase | Why it matters here |
|---|---|---|
| **Render-agnostic IR** | `src/types/canvas.ts` — *"No React, no JSX — pure TypeScript interfaces."* | The model already has zero coupling to any output. Codegen reads it as-is. |
| **N-emitters-from-one-IR pattern** | Canvas (`TemplateCanvas.tsx`), PDF (`backend/renderer/pdfLibRenderer.js`), ZPL (`backend/renderer/zplRenderer.js`) | The system **already** drives 3 outputs from one model. Code is emitter #4 — consistent, not novel. |
| **Element → JSX dispatch already exists** | `TemplateCanvas.tsx:883–998` (`if (element.type === 'text') …` per type) | The editor already maps every element type to React. Codegen mirrors this dispatch, emitting source instead of live nodes. |
| **Binding primitive** | `CellBinding { path, scope, fallback }`, `TableBinding`, `{{tokens}}` in `src/model/layoutTable.ts` | Half of a props contract already exists: a field can already declare a data `path`. We add a *direction* and a *prop name*. |
| **Single resolver, mirrored client/server** | `src/services/mappingEngine.ts` — *"Mirrors backend resolver exactly."* | Proves the team already maintains one logic source across targets — exactly the discipline codegen needs. |
| **Typed, versioned document** | `TemplateDocument { version: '2.0', … }` | Stable, serializable input to the emitter; migration helpers (`migrateV1`) already exist. |

### 4.2 Flexibility scorecard

| Concern | Flexibility | Notes |
|---|---|---|
| Add a code emitter | 🟢 High | Same pattern as PDF/ZPL emitters. No core changes. |
| Read design as data | 🟢 High | IR is already clean and React-free. |
| Map elements → JSX | 🟢 High | Dispatch exists in `TemplateCanvas.tsx`; refactor into a shared visitor. |
| Props contract | 🟡 Medium | `path` primitive exists; needs a `propName` + direction overlay (additive). |
| **Layout model** | 🔴 **Low** | **The one hard gap.** Absolute `x/y` at fixed page sizes (A4 794px) is the opposite of a reusable, responsive component. See §6.2. |
| Interactivity / state | 🟡 Medium | `radio`/`checkbox`/`date`/`text` are today *print representations*, not stateful inputs. New behavior layer, but contained to the emitter. |

### 4.3 Verdict

> The system is **structurally flexible enough** to support component export. The IR,
> the emitter pattern, the element→JSX dispatch, and the binding primitive are all
> reusable. **One genuine architectural investment is required — a layout model** —
> because absolute positioning cannot produce a component that lives naturally inside
> someone else's app. Everything else is additive and follows existing patterns.

---

## 5. Architecture

### 5.1 Pipeline

```
  Canvas (design)          Component IR            Codegen emitter        Bundle
 ┌───────────────┐       ┌──────────────┐        ┌────────────────┐    ┌──────────┐
 │ visual layout │       │ layout       │        │ IR → AST → src │    │ src/     │
 │ + props       │ ───►  │ + contract   │  ───►  │ (ts-morph +    │──► │ demo/    │
 │ + bindings    │       │ + bindings   │        │  prettier)     │    │ vite app │
 └───────────────┘       └──────────────┘        └────────────────┘    └──────────┘
        (existing, extended)   (existing IR +        (NEW)               (generated)
                                small overlay)
```

### 5.2 Layered IR (do **not** overload the document template)

Keep the existing visual/layout model in `canvas.ts` shared. Add a **component
overlay** that only the export path reads — the PDF/ZPL paths ignore it, so nothing in
today's product changes.

```
TemplateDocument (existing)
  └── pages[].elements[]              ← visual + layout (shared, unchanged)

ComponentProfile (NEW, additive overlay)
  ├── props:    PropSpec[]            ← the typed contract (name, type, required)
  ├── bindings: { elementId, path, direction }
  │                                     direction: 'in'  (prop → display)
  │                                                'out' (input → onChange(prop))
  ├── validation: Rule[]             ← compiled into schema.ts
  └── layout:   LayoutHints          ← grouping/flow intent (see §6.2)
```

### 5.3 Emitter abstraction

Formalize what already exists informally. Every output is an `Emitter`:

```ts
interface Emitter<TOptions, TArtifact> {
  emit(doc: TemplateDocument, profile: ComponentProfile, opts: TOptions): TArtifact;
}
```

| Emitter | Status |
|---|---|
| `pdf`            | exists (`pdfLibRenderer.js`) |
| `zpl`            | exists (`zplRenderer.js`) |
| `react-bundle`  | **NEW** — this project |

The `react-bundle` emitter is composed of sub-emitters, one per file in §3
(`component`, `types`, `schema`, `styles`, `demo`, `scaffold`).

### 5.4 Codegen engine

- **AST-based** via `ts-morph` (or babel), **never string concatenation** — nested
  layouts rot template strings immediately.
- **Prettier** as the final pass → valid, formatted, review-able output.
- A **single element visitor** shared with (or refactored out of) the existing
  `TemplateCanvas.tsx` dispatch, so the canvas preview and the generated component can
  never drift in how an element renders.

### 5.5 Codegen engine — deterministic core + LLM-assisted layout

> **The product thesis.** A structured canvas design is a *far better LLM input than a
> natural-language prompt.* It is a high-fidelity spec, not an ambiguous wish. So the LLM
> is asked to **translate** an exact design — not **invent** an app from text (the
> Lovable model). Translation is far more constrained and reliable than invention, which
> is what makes this safe.

The engine is **two lanes with a hard seam.** The LLM is fenced out of everything that
must be guaranteed and used only where determinism is hardest (idiomatic responsive
layout — the §6.2 problem).

```
                 ┌─────────────────────────────────────────────┐
   Component IR  │  DETERMINISTIC LANE (AST, §5.4) — correctness │
        │        │   • types.ts  (props/values, exact)           │
        ├───────►│   • schema.ts (validation, exact)             │
        │        │   • per-field stateful input components       │
        │        │   • state / onChange / onSubmit wiring        │
        │        └───────────────────┬─────────────────────────┘
        │                            │ exposes typed, black-box
        │                            │ field components + design tokens
        │        ┌───────────────────▼─────────────────────────┐
        └───────►│  LLM LANE — presentation only                │
                 │   • arrange the field components responsively │
                 │   • idiomatic flex/grid + styling             │
                 │   • CANNOT rename/invent fields or logic      │
                 └───────────────────┬─────────────────────────┘
                                     │
                            ┌────────▼────────┐
                            │  VERIFY GATE     │  tsc + lint + render
                            └────────┬────────┘
                       pass │                 │ fail
                            ▼                 ▼
                       ship bundle    repair loop → else fall back to
                                      deterministic fixed-size (§6.2 A)
```

**Why the seam is the whole game:**

- The LLM only **arranges black-box field components it cannot break.** Ugly layout? The
  form still works — wrong prop names won't compile, validation is untouchable.
  **Failures become cosmetic, never functional.** That is the correct place to put risk.
- **Strategy A (deterministic fixed-size, §6.2) is the safety floor**, not throwaway v1.
  LLM lane disabled or failing → fall back to deterministic layout. The bundle always ships.
- The **verify gate** (typecheck + lint + render the demo) catches an LLM referencing a
  field that doesn't exist; on failure, feed the error back for one repair pass, else drop
  to the floor.

**Operational guarantees:**

| Concern | Mitigation |
|---|---|
| Non-determinism (same design → different code) | Temp 0 + structured output; **cache layout by hash of the layout-relevant IR** → regenerate only on design change → effectively deterministic *to the user* |
| Fidelity drift ("LLM improved my design") | LLM constrained to layout-only; structural/screenshot diff vs the canvas render |
| Cost & latency | Deterministic lane is free; LLM runs only on layout, only on change, cached otherwise |
| Trust in generated code | The verify gate runs before handoff — nothing ships uncompiled |

> Use the latest, most capable Claude model for the layout lane (e.g. Claude Opus), with
> temperature 0 and schema-constrained output. The lane is a pure function of
> (layout IR subtree → JSX/CSS); pin model + prompt version into the cache key.

---

## 6. The two intrinsic problems

Even at minimum scope, "**reusable**" forces these two. Skipping either yields a frozen
picture, not a component.

### 6.1 Props / Field contract — architecture

This is the layer that turns a static design into a working component. It answers, for
**every element on the canvas**, three questions:

1. Is this **decoration** (a line, a logo, a heading) or a **field** (something with a value)?
2. If a field — is it **editable** (user types) or **display-only** (filled from a prop)?
3. What is its **name, type, and validation**?

#### 6.1.1 The core split — Decoration vs Field

Every `CanvasElement` is classified into exactly one of two roles:

```
CanvasElement
  ├── Decoration   → emitted as static JSX, never a prop, never state
  │                  (line, box, image, barcode, non-bound text/paragraph)
  └── Field        → has a value → contributes to props, state, validation
                     (checkbox, radio, date, bound text, table cell binding)
```

Decoration is the default for visual-only types. Field is the default for input-like
types. The user can flip a text/paragraph from decoration → field (e.g. "Patient Name:"
label stays decoration; the value next to it becomes a field).

#### 6.1.2 The `FieldSpec` model (the new data structure)

The component overlay (`ComponentProfile.fields[]` from §5.2) is a list of `FieldSpec`,
one per field element. **This single structure drives everything downstream.**

```ts
interface FieldSpec {
  elementId  : string;        // links back to the CanvasElement
  name       : string;        // prop/state key — valid TS identifier, unique
  label      : string;        // human label (errors, demo, a11y)
  kind       : FieldKind;     // what input it becomes
  dataType   : 'string' | 'number' | 'boolean' | 'date' | 'enum';
  editable   : boolean;       // true → input + state; false → display-only
  required   : boolean;
  default   ?: string | number | boolean;   // initial state / fallback
  options   ?: { value: string; label: string }[];  // enum/radio/select
  validation : Rule[];        // see §6.1.6
}

type FieldKind =
  | 'text' | 'number' | 'date'
  | 'checkbox' | 'radio' | 'select'
  | 'display';                // editable:false — renders value, no input
```

> **Reuse of the existing model:** `FieldSpec.name` is the new home of the existing
> `CellBinding.path`, and `FieldSpec.default` is the existing `CellBinding.fallback`.
> The binding primitive you already have **is** the seed of this contract — we add
> `name`, `kind`, `editable`, and `validation` around it.

#### 6.1.3 Element type → default field mapping

The emitter assigns a sensible default per element type; the user can override in the
properties panel.

| Canvas element | Default role | Default `kind` | `dataType` |
|---|---|---|---|
| `text` / `paragraph` | Decoration (toggle → Field) | `text` / `display` | string |
| `checkbox` | Field | `checkbox` | boolean |
| `radio` | Field | `radio` | enum |
| `date` | Field | `date` | date |
| `table` cell w/ `binding` | Field (per row) | `text` | string |
| `image` `line` `box` `barcode` | Decoration (locked) | — | — |

#### 6.1.4 Authoring — where the contract is created

The contract is authored in the existing **Properties panel**
(`PropertiesPanel.tsx`), not a new surface. Selecting an element gains a **"Field"**
section:

```
┌─ Field ────────────────────────┐
│ [✓] This element is a field    │
│ Name      : patientName        │   ← prop/state key
│ Label     : Patient Name       │
│ Type      : Text ▾             │
│ [✓] Editable   [✓] Required    │
│ Validation: + Add rule         │
└────────────────────────────────┘
```

`Name` auto-fills from the label as a slugged identifier, validated for uniqueness and
JS-identifier safety; the user can edit it.

#### 6.1.5 One `FieldSpec` → five generated outputs

Each `FieldSpec` fans out deterministically. This is the whole emitter contract:

```
FieldSpec { name:'amount', kind:'number', editable:true, required:true }
   │
   ├─► types.ts   :  amount: number
   ├─► schema.ts  :  { name:'amount', required:true, rules:[...] }
   ├─► state      :  const [amount, setAmount] = useState(initial.amount ?? 0)
   ├─► render     :  <input type="number" value={amount}
   │                        onChange={e => setAmount(+e.target.value)} />
   └─► demo       :  <MedicalBillingForm initialValues={{ amount: 250 }} ... />
```

A `display` field (editable:false) collapses the same row to `<span>{props.amount}</span>`
with no state — that's the only difference.

#### 6.1.6 Validation model

Validation rules live on the `FieldSpec`, are authored in the canvas, and compile into a
**pure, framework-free `schema.ts`** so the same rules can run anywhere:

```ts
type Rule =
  | { type: 'required' }
  | { type: 'minLength'; value: number }
  | { type: 'maxLength'; value: number }
  | { type: 'min'; value: number }
  | { type: 'max'; value: number }
  | { type: 'pattern'; value: string; message?: string }
  | { type: 'email' };
```

The emitter generates a `validate(values)` function from these rules. The component calls
it on submit and surfaces per-field errors.

#### 6.1.7 The generated props API (recommended shape)

The component is **self-controlled** (holds its own state) — the most ergonomic shape for
"drop into my app." The consumer supplies seeds and receives results:

```ts
// generated types.ts
export interface MedicalBillingValues {
  patientName : string;
  amount      : number;
  insured     : boolean;
  serviceDate : string;   // ISO date
}

export interface MedicalBillingFormProps {
  initialValues ?: Partial<MedicalBillingValues>;
  onChange      ?: (values: MedicalBillingValues) => void;
  onSubmit      ?: (values: MedicalBillingValues) => void;
  readOnly      ?: boolean;   // renders all fields as display
}
```

```tsx
// consumer's app
<MedicalBillingForm
  initialValues={{ patientName: 'John Doe' }}
  onSubmit={(values) => saveToMyDatabase(values)}
/>
```

#### 6.1.8 Component skeleton the emitter produces

```tsx
export function MedicalBillingForm({ initialValues, onSubmit, readOnly }: MedicalBillingFormProps) {
  const [values, setValues] = useState<MedicalBillingValues>({ ...defaults, ...initialValues });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof MedicalBillingValues, v: unknown) =>
    setValues(prev => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    const errs = validate(values);          // from schema.ts
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit?.(values);
  };

  return (
    <div className="medical-billing-form">
      {/* Decoration → static; Field → input bound to values[name] */}
      <label>Patient Name</label>
      <input value={values.patientName}
             onChange={e => set('patientName', e.target.value)}
             disabled={readOnly} />
      {errors.patientName && <span className="error">{errors.patientName}</span>}
      {/* …one block per FieldSpec… */}
      {!readOnly && <button onClick={handleSubmit}>Submit</button>}
    </div>
  );
}
```

> **`readOnly` is how the rejected "presentational" mode survives** — not as a separate
> artifact, but as one prop on the interactive component. No second codegen path.

### 6.2 Layout (**High effort — the one real investment**)

#### 6.2.1 The fundamental mismatch — there is no "page" in a browser

PDF export is easy because the **page is a known, fixed, physical boundary**:
A4 = 794px, Letter = 816px, 4×6 label = 384px (see `PAGE_SIZE_PRESETS` in `canvas.ts`).
Absolute `x/y` coordinates always have a guaranteed frame to live in. What you design is
exactly what prints.

A React component dropped into a host app has **no page**. The boundary is the host
**container**, whose width is *unknown at design time* — it may be a full page (1440px),
a sidebar (320px), a modal (600px), or a phone (375px).

> The canvas is a **fixed 794px coordinate system**. The browser is **variable-width
> flow**. These two models do not reconcile automatically. **The canvas design does not
> fit a browser page on its own.**

#### 6.2.2 Limitation — emitting absolute coordinates literally fails

If the emitter keeps absolute `x/y` at 794px, the component breaks in real hosts:

| Host container | Result |
|---|---|
| Narrow (< 794px) | horizontal scrollbar, content clipped |
| Wide | an 794px island floating in whitespace |
| Mobile | unusable |
| Inside a flowing form layout | alien block, ignores host spacing |

It becomes a rigid 794px frame, not a component that *belongs* in the page.

#### 6.2.3 The strategy spectrum

| Strategy | What it emits | Fits browser? | Effort |
|---|---|---|---|
| **A. Fixed-size** | Absolute `x/y` in a 794px wrapper | ❌ rigid island | 🟢 trivial (1:1 with today) |
| **B. Scale-to-fit** | Fixed coords + CSS `transform: scale()` to container width | ⚠️ fits *width* only — text shrinks to unreadable on mobile; a zoomed picture, not a layout | 🟢 easy |
| **C. Responsive flow** | Elements grouped into flex/grid, real reflow | ✅ genuinely fits any container | 🔴 hard |

A and B preserve the design pixel-for-pixel but are not "web". C is real web but needs
**structure** that raw coordinates do not contain.

#### 6.2.4 The deeper fork — Fidelity vs Idiomatic

Underneath the strategy choice is a question about *what the export honors*:

- **Fidelity mode** — reproduce the canvas pixels exactly (A / B). Correct when the
  output is **document-like**: a certificate, styled invoice, badge.
- **Idiomatic mode** — extract *what fields exist and how they group*, emit a normal
  responsive/accessible web form, and **discard exact coordinates** (C). Correct when the
  output is an **interactive form**.

**Decision for this product: Idiomatic.** The deliverable is an interactive form
(§2). A real medical billing form in a real app is a vertical stack of labeled fields with
a max-width — *not* a paper layout. The canvas looks like paper only because that is the
design tool; the runtime form people want is idiomatic web. **For interactive forms,
idiomatic beats fidelity.**

#### 6.2.5 Why NOT to infer layout from coordinates

Do **not** heuristically infer rows/columns from raw `x/y` (e.g. "these three elements
share a Y, so they're a row"). It is brittle, surprises users, and breaks on near-misses.

Instead, **capture layout intent at design time**: add **layout containers** to the
canvas (stack / row / grid) so the user groups elements while designing. The emitter then
maps containers → flexbox/grid **deterministically** — reading structure the user gave it,
not guessing.

```
Canvas layout containers            Emitted layout
  Stack   ─────────────────►  display:flex; flex-direction:column
  Row     ─────────────────►  display:flex; flex-direction:row; flex-wrap
  Grid    ─────────────────►  display:grid; grid-template-columns
  (within a container, fields flow — no absolute x/y)
```

#### 6.2.6 Recommendation — tiered, with the LLM lane as the responsive engine

The responsive destination (C) is **not** hand-built as a heuristic layout compiler. It is
produced by the **LLM-assisted layout lane (§5.5)**, which translates the design into
idiomatic flex/grid — with deterministic fixed-size (A) as the floor underneath.

1. **v1 — Fixed-size (A), deterministic.** Emit faithfully as a fixed-width block to prove
   the full pipeline (contract → state → validation → bundle) end-to-end. This becomes the
   permanent **fallback floor**, not throwaway work.
2. **v2 — Design-time layout containers** (stack/row/grid) so the user declares grouping
   intent. This both improves deterministic output *and* gives the LLM lane clean,
   unambiguous structure to translate.
3. **v3 — LLM layout lane → Responsive (C).** The lane consumes the container-annotated IR
   and emits idiomatic responsive layout, gated by §5.5's verify-and-fallback.

> Idiomatic/responsive (C) is the **destination**, reached via the **LLM lane (§5.5)**;
> fixed-size (A) is the **deterministic floor / fallback**. Heuristic coordinate inference
> is rejected (§6.2.5); scale-to-fit (B) is only a stopgap for document-like outputs and is
> not on the critical path for a form.

---

## 7. Generation model — one-way

Generation is **one-way**: canvas → code. Once the user owns the bundle, the code is
theirs; we do **not** read edited code back into the canvas.

This deliberately sidesteps the round-trip problem entirely for v1. The folder layout in
§3 still separates `src/` (could be regenerated) from `demo/` (scaffolded once), so a
future *safe regeneration* feature can be added without re-architecting — but it is not
built now.

---

## 8. Build plan (phased)

> **Detailed, actionable phase breakdown** (tasks, files, exit criteria, dependency graph,
> milestones) lives in **`COMPONENT_EXPORT_PHASES.md`**. The tables below are the summary.

Two tracks. **Track 1 (P0–P5)** is the deterministic core — a complete, shippable
product on its own. **Track 2 (P6–P8)** is the LLM-assisted layer that turns it into a
Lovable-class generator. Track 2 sits *on top of* Track 1 and never replaces it — the
deterministic core is always the fallback floor (§5.5).

### Track 1 — Deterministic core (ships standalone)

| Phase | Deliverable | Proves |
|---|---|---|
| **P0** | `react-bundle` emitter skeleton + `Emitter` interface | The pattern slots in beside PDF/ZPL |
| **P1** | Element visitor → emit a **fixed-size** `.tsx` (strategy A, no props) | IR → compiling, runnable React |
| **P2** | Props contract overlay + `types.ts` + per-field components | Configurable, not a snapshot (R5) |
| **P3** | Demo harness + Vite scaffold (`npm run dev`) | Runs independently (R4) |
| **P4** | Interactivity — `useState` per field + validation + `onChange`/`onSubmit` | The component's reason to exist (§2) |
| **P5** | **Design-time layout containers** (stack/row/grid) in canvas → deterministic flex/grid | Declared structure, clean input for Track 2 (§6.2.5) |

### Track 2 — LLM-assisted layout (the Lovable-competitive layer)

| Phase | Deliverable | Proves |
|---|---|---|
| **P6** | **LLM layout lane** — container-annotated IR → idiomatic responsive flex/grid (§5.5) | Genuinely fits any host; dissolves §6.2 |
| **P7** | **Verify gate + fallback** — tsc/lint/render, one repair pass, else drop to P1 floor | Stochastic engine, deterministic guarantees |
| **P8** | **Layout cache + fidelity diff** — hash-keyed cache; structural/screenshot check vs canvas | Same design → same code; no silent drift |

> Recommended first milestone: take **exactly one** template (the medical billing form),
> walk it through **P1–P3**, and ship a runnable bundle. That spike de-risks the pipeline
> before generalizing. Do **not** start Track 2 until the deterministic floor exists — it
> is the safety net the LLM lane falls back to.

---

## 9. Risks & open decisions

| Item | Type | Resolution |
|---|---|---|
| Interactive vs presentational | **Decided** | Interactive — presentational rejected (the canvas already is the presentational view) (§2) |
| Fidelity vs idiomatic layout | **Decided** | Idiomatic — a form is a responsive field stack, not a paper layout (§6.2.4) |
| Canvas design does not fit the browser page | **Limitation** | No fixed "page" at runtime; pick a strategy on the fidelity↔responsive spectrum (§6.2.1–6.2.3) |
| Layout from coordinates is brittle | Risk | Do NOT infer from `x/y`; capture intent via design-time layout containers (§6.2.5) |
| Responsive layout is hard deterministically | Risk | Hand off to the **LLM lane (§5.5)**; deterministic fixed-size (A) is the floor |
| LLM non-determinism / cost / drift | Risk | Two-lane seam + verify gate + hash cache + fallback (§5.5) |
| Generated code quality | Risk | AST + Prettier + shared visitor (§5.4); verify gate for the LLM lane |
| Element types with no clean web equivalent (barcode) | Risk | Emit a small runtime dep or `<svg>`; decide per type |
| Scope creep back toward a hosted runtime | Risk | §2 boundary is explicit — "server" = local dev harness only |

---

## 10. Competitive positioning — vs Lovable

Lovable (prompt-to-app, LLM writes the whole project) and this product look adjacent but
attack the problem from opposite ends. The strategy is **design-first, LLM-assisted** —
not prompt-first, LLM-everything.

| Dimension | Lovable (prompt-first) | This product (design-first, LLM-assisted) |
|---|---|---|
| Input | Natural-language prompt (lossy, ambiguous) | **Structured canvas design (exact spec)** |
| LLM role | **Invents** the app | **Translates** an exact design |
| Visual control | None — you can't place to the pixel | **Pixel-precise design surface** |
| Correctness | Whatever the LLM writes | **Deterministic contract/state/validation** (LLM can't touch) |
| Output | Whole apps | One reusable, embeddable **component** |
| Failure mode | Can break logic, rename things, hallucinate | **Cosmetic only** — logic is fenced off (§5.5) |

**The competitive thesis (three moats):**

1. **A structured design is a better prompt.** Feeding the LLM an exact element tree +
   field contract + grouping shrinks its freedom — and its capacity to go wrong — versus a
   text prompt. We get more reliable output *because* we constrain the LLM more.
2. **Precise visual design is the moat Lovable structurally can't copy.** Their prompt-first
   model gives up pixel control by design. Buyers who need brand-grade, document-grade, or
   regulated forms (medical, finance, logistics — your PDF/ZPL heritage) cannot get that
   from prompting.
3. **Guaranteed correctness.** The deterministic lane means the contract, state, and
   validation are never at the mercy of a model. Lovable cannot make that promise; the LLM
   writes everything.

**Where Lovable wins (be honest):** open-ended whole-app generation, breadth, and
zero-learning-curve "describe it and go." This product is **not** a general app builder
and should not try to be — it wins on *precise, reliable, reusable component generation*,
a narrower and defensible niche.

**How the phases ladder into competing:** Track 1 (P0–P5) is a solid deterministic
generator but not yet Lovable-class on output polish. **Track 2 (P6–P8) is what closes the
gap** — the LLM layout lane produces idiomatic responsive code as good as a prompt-built
app, but driven by an exact design and backed by deterministic correctness. That
combination — Lovable-quality output **with** pixel-precise input **and** guaranteed
contracts — is the position neither a pure design tool nor a pure prompt tool can occupy.

---

## 11. Competitive landscape (market scan — June 2026)

Verified against current sources. **Design-first component generation is a real, crowded,
and well-funded category** (IBM invested in Anima, Feb 2026). The mechanism is maturing
fast — treat "design-first + AI" as table stakes, not a moat.

| Product | Current state (2026) | Input | Output | Gap vs this product |
|---|---|---|---|---|
| **Plasmic** | Visual builder → production React codegen, import into your codebase; slots/variants; ~10K weekly `loader-react` downloads | Own visual canvas + Figma import | Owned React components | Presentational/UI focus — **no form data-contract or validation** |
| **Builder.io (Visual Copilot + Fusion)** | AI Figma→code; pipeline = **structure model → Mitosis compiler → fine-tuned LLM pass** per framework | Figma | Multi-framework (React/Vue/Angular/Svelte) | **Same deterministic+LLM idea we proposed (§5.5)** — but Figma-import, general UI, no contract |
| **Locofy.ai** | Lightning (1-click AI) vs Classic (manual tagging); imports MUI/Chakra/etc | Figma/XD | React/Next/RN, flexbox | Design-import; presentational markup |
| **Anima** | React/Vue/Tailwind/shadcn; Storybook↔Figma sync; VS Code mapping | Figma/Sketch | Components — **"literal translation, absolute/semi-absolute positioning, flat HTML"** | Confirms the §6.2 fidelity trap; no contract |
| **Figma Make** | Turn designs/prompts → HTML/CSS/JS; Dev Mode, Code Connect, MCP | Design + prompt | Web code/apps | General; design-tool-native, no domain logic |

### Two honest conclusions

1. **The mechanism is commoditized — including our §5.5 two-lane idea.** Builder.io
   already ships a *deterministic-structure-pass → compiler → LLM-framework-pass* pipeline.
   Our "deterministic core + LLM layout" is the **right** architecture but **not novel**.
   Do not position on the mechanism.

2. **None of them produce a stateful, contract-typed form.** Every tool above emits
   **presentational markup** from a Figma/visual import. Anima explicitly outputs literal,
   absolute-positioned, flat HTML — the exact §6.2 trap. *No mainstream tool turns a design
   into an interactive component with a typed props/values contract + validation that runs
   client and (optionally) server.* **That is the open lane.**

### The moat — domain, not mechanism

> Restated after the scan: do **not** compete on "design-first" (Plasmic/Builder own it)
> or out-general them on breadth (you'll lose). Win the wedge none of them point at —
> **precise, regulated/structured forms turned into reusable components with a guaranteed
> data contract and deterministic correctness of behavior** (your PDF/ZPL/data-to-docs
> heritage). The differentiator is the **logic + contract**, not the layout codegen.

### Validation from the scan

- Builder.io independently arriving at the same deterministic+LLM split **validates the
  §5.5 architecture** — it's the proven pattern, not a gamble.
- Anima's literal absolute-positioning output **validates the §6.2 decision** to reject
  fidelity mode for forms and go idiomatic.

**Sources:** [Plasmic](https://www.plasmic.app/react) ·
[Builder.io Visual Copilot](https://www.builder.io/blog/figma-to-code-visual-copilot) ·
[Builder.io VC CLI](https://www.builder.io/blog/visual-copilot-cli) ·
[Locofy vs Builder vs Anima (2026)](https://sitegrade.io/en/blog/locofy-vs-builder-io-vs-anima-design-to-code-2026/) ·
[Anima review (2026)](https://uxpilot.ai/blogs/anima-ai) ·
[Figma design-to-code](https://www.figma.com/solutions/design-to-code/) ·
[Builder vs Plasmic vs Makeswift (2026)](https://www.pkgpulse.com/blog/builder-io-vs-plasmic-vs-makeswift-visual-page-builders-2026)

---

## 12. Summary

- **Feasible and architecturally consistent.** A code emitter is the 4th interpreter over
  an IR that already drives 3.
- **High reuse** of the IR, the emitter pattern, the element→JSX dispatch, and the
  binding primitive.
- **The hard problem (layout) is solved by the LLM-assisted lane**, not hand-built — with
  a deterministic fixed-size floor as the guaranteed fallback.
- **Two tracks:** a deterministic core that ships on its own (P0–P5), then an LLM layer
  (P6–P8) that makes it Lovable-class on output while keeping correctness guaranteed.
- **The moat is the domain, not the mechanism.** Market scan (§11) shows design-first +
  deterministic-core + LLM-layout is already shipping (Builder.io) — so don't position on
  it. Win the lane no mainstream tool occupies: precise/regulated forms → reusable
  components with a **guaranteed data contract + deterministic behavior**.
- **Tight scope holds:** one component in, one runnable + importable bundle out — the
  "server" is a local Vite harness, not a backend.
