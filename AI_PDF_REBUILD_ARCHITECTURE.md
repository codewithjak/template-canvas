# AI PDF → Editable Template — Implementation Architecture

**Status:** Design / proposal
**Feature:** Upload a PDF; the system rebuilds it as a fully editable `TemplateDocument` (schema-accurate template JSON) that opens in the existing canvas editor.
**Target schema:** `TemplateDocument` v2.0 (`src/types/canvas.ts`), `LayoutTableElement` (`src/model/layoutTable.ts`), data IR `CanonicalDocument` (`src/types/dataSource.ts`).

---

## 1. Goal and non-goals

**Goal.** Turn a born-digital (vector) PDF into a `TemplateDocument` whose geometry matches the source and whose structure is idiomatic to our editor — so the user lands on a near-finished template they refine, not a blank canvas.

**Non-goals (MVP).**
- Pixel-perfect reconstruction of arbitrary/magazine layouts.
- Scanned/raster PDFs (no text layer) — gated or rejected, see §10.
- Reconstructing every visual as an editable primitive — visual fidelity is guaranteed via image fallback; editability degrades gracefully.

**Promise to the user.** *"An AI draft you refine"* — not *"a perfect rebuild."* The fidelity report (§9) is what keeps that promise honest.

---

## 2. Core principles (invariants every phase must uphold)

These three rules are the backbone. If a phase violates one, it's wrong regardless of output quality.

### 2.1 Source-of-truth per axis

| Axis | Source of truth | Corpus (RAG) role |
|---|---|---|
| **Geometry** — every `x`, `y`, `width`, `height`, `length`, `boundaryY` | **PDF extraction — always** | **None. Hard wall.** |
| **Structure** — `type`, `role`, column identity/order, bindings, nesting | **PDF extraction first** | Hint / interpreter; never invents elements the PDF lacks |
| **Style** — `color`, `fontFamily`, `fontWeight`, `textAlign` | **PDF extraction (measured)** | Normalizer only (snap to house tokens) |

**The one rule that generates all three:** *the PDF is the source of truth for what is in THIS document; the corpus only answers "what does a document like this usually mean, and how do we name/organize it." The corpus is a translator — never a measuring tape, never an inventory.*

### 2.2 Three terminal states — never silent loss

Every extracted primitive ends in exactly one state:

1. **Mapped** → native `CanvasElement` (editable, full fidelity).
2. **Approximated** → rasterized `ImageElementType` (visual fidelity, not editable).
3. **Reported-dropped** → explicitly listed in the fidelity report.

A fourth state — *silently vanished or silently fabricated* — is the cardinal sin and must be impossible by construction.

### 2.3 Geometry provenance is guaranteed, not trusted

The LLM never authors coordinates. Geometry is re-injected from extraction by block ID after generation (§7.4). Even if the model emits an `x`, it is discarded and replaced.

---

## 3. Pipeline overview

```
PDF
 │
 ├─[0] Eval harness        (built FIRST — measures every phase below)
 │
 ├─[1] Extract ──────────► primitives: text runs · rules · rects · images   (no model)
 │
 ├─[2] Normalize ────────► pt→px transform + cluster runs into blocks         (no model)
 │
 ├─[3] Retrieve ─────────► nearest template family + doc-type exemplar (geometry-masked)
 │
 ├─[4] Structure (LLM) ──► classify blocks → CanvasElement[] + zones + tables
 │
 ├─[5] Validate / repair ► enforce TS schema, clamp/reject impossible geometry (no model)
 │
 └─[6] Assemble ─────────► TemplateDocument v2.0 + fidelity report → editor
```

Geometry flows only along **1 → 2 → 4 → 5**. The corpus enters only at **3 → 4** (and a style-normalization step), always geometry-masked.

Proposed module layout:

```
src/services/pdfImport/
  extract.ts        # Phase 1
  normalize.ts      # Phase 2
  retrieve.ts       # Phase 3
  structure.ts      # Phase 4 (LLM call + prompt assembly)
  validate.ts       # Phase 5 (schema guard + repair)
  assemble.ts       # Phase 6 (TemplateDocument + ai report)
  fallback.ts       # cross-cutting: rasterize region → ImageElementType
  types.ts          # internal IR: Block, Primitive, ImportReport
src/services/pdfImport/eval/   # Phase 0 harness + fixtures
```

Entry point: a **second intent** on the existing upload wizard (`src/components/TemplateCanvas/upload/`) — alongside the current data-file intent — labelled "Rebuild from PDF."

---

## PHASE 0 — Evaluation harness (build before anything else)

### Functionality
We already emit vector PDFs *from* `TemplateDocument`. Run that in reverse as a test oracle: `template → PDF → pipeline → template'`, then diff `template'` vs `template` at the schema level.

Metrics:
- Element count by `type` (precision/recall per element type).
- Bounding-box IoU per matched element (geometry fidelity).
- Text content match (normalized string distance).
- Table fidelity: column count, row count, header presence.
- Coverage: % mapped / approximated / dropped.

### Inputs / outputs
- **In:** all built-in templates (`src/templates/builtins`) + stored user templates.
- **Out:** a regression score per phase, runnable in CI.

### Trade-offs
- **+** Free, labelled ground-truth pairs at scale — almost no PDF-import project has this.
- **−** Generated PDFs are "clean"; they under-represent the messy real-world PDFs (foreign fonts, odd producers). Supplement with a small hand-labelled real-world corpus.

### Limitation
Round-trip fidelity is an *upper bound*. Real third-party PDFs will always score lower than the synthetic set.

### Recommendation
**Build Phase 0 first and gate every later phase on it.** Without it, prompt changes in Phase 4 are unmeasurable guesswork.

---

## PHASE 1 — Extraction (deterministic, no model)

### Functionality
Use pdfjs (`getTextContent` + `getOperatorList`) to pull exact primitives per page:
- **Text runs:** string, `transform` matrix → x/y/rotation/scale, `width`, font name, font size.
- **Vector ops:** strokes and fills → candidate lines/rects.
- **Images:** `paintImageXObject` → bbox + bytes.
- **Page box:** MediaBox → page dimensions in pt.

### Output (internal IR)
A flat `Primitive[]` with measured geometry — the immutable ground truth for all geometry downstream.

### Trade-offs
- **+** Exact, no hallucination, no API cost.
- **−** pdfjs text runs are fragmented and producer-dependent; font names are often subset/aliased (`ABCDEE+Helvetica`).
- **Alt:** poppler (`pdftohtml -xml`) gives cleaner word boxes but is a native dependency / server-side only. pdfjs keeps it in-browser, consistent with the current stack.

### Limitation
**No text layer ⇒ no extraction.** Scanned PDFs produce zero text runs and must be detected here (§10).

### Recommendation
Start with **pdfjs (already in `_spike`)**. Keep extraction output as a stable internal IR so the extractor can be swapped (poppler/server-side) later without touching Phases 2–6.

---

## PHASE 2 — Normalization (deterministic, no model)

### Functionality
Two jobs:

1. **Coordinate transform** — PDF user space (72 pt/in, origin bottom-left) → canvas px (96 px/in, origin top-left). This is the exact inverse of the existing PDF *export*:
   ```
   canvasX = pdfX * (96/72)
   canvasY = (pageHeightPt - pdfY) * (96/72)   // flip Y
   ```
   Map MediaBox to `PAGE_SIZE_PRESETS`, else build `customPageSize(...)`.

2. **Clustering** — merge fragmented runs sharing a baseline into line-blocks; merge stacked line-blocks with consistent leading into paragraph candidates. Reduces ~400 raw runs/page to ~30 blocks the LLM can reason over cheaply.

### Output
`Block[]` — each block carries measured geometry + style + a stable block ID (geometry handle for Phase 4 re-injection).

### Trade-offs
- **+** Cheap, deterministic, dramatically shrinks the LLM's input and its room to drift.
- **−** Clustering heuristics (baseline tolerance, leading thresholds) need tuning; aggressive merging fuses distinct fields, timid merging fragments paragraphs.

### Limitation
Heuristic grouping mis-handles tight multi-column layouts (columns can merge across the gutter). Detect wide horizontal gaps to split columns.

### Recommendation
Keep thresholds **config-driven and covered by Phase 0** so tuning is measurable. Do *not* push clustering into the LLM — it's cheaper and more reliable as code.

---

## PHASE 3 — Retrieval (corpus enters, geometry-masked)

### Functionality
Two retrieval jobs, both feeding **text-only, geometry-stripped** context into Phase 4:

1. **Doc-type exemplar** — one stored template of the same class (invoice/label/form) as a *shape* example (naming, nesting, which `role` markers we use). Few-shot for the mapping.
2. **Family match** — embed extracted text + block layout; search the corpus. A strong hit switches to **match-and-diff mode** (§8).

### The contamination fence
Retrieved templates pass through a serializer that emits a **skeleton**: keep `type`, `role`, enums, `binding` paths, column identities, ordering/nesting — **delete every geometric field** (`position`, `width`, `height`, `length`, `boundaryY`, `size`, column `width`).

```jsonc
{ "type":"table",
  "columns":[{"role":"qty"},{"role":"desc"},{"role":"price"},{"role":"total"}],
  "headerRow": true,
  "binding": { "collectionKey":"lineItems", "itemAlias":"item" } }
// no x, no y, no width — nothing measurable
```

### Trade-offs
- **+** Makes output idiomatic; enables match-and-diff (the real fidelity unlock).
- **−** **Template contamination risk:** if geometry leaks (or exemplars over-influence), output drifts toward the corpus mean and away from *this* PDF. The mask is the mitigation; it must be enforced as a field whitelist, not a prompt instruction.
- **−** Adds embedding/index infrastructure and a similarity-threshold to tune.

### Limitation
Cold-start: with an empty/small corpus, retrieval contributes little — the pipeline must work *without* it (Phase 4 degrades to schema-only prompting).

### Recommendation
**Ship Phases 1–2–4–5–6 without retrieval first.** Add Phase 3 last, once a corpus exists. Treat retrieval as a *quality/consistency* layer, **not** a correctness layer — correctness comes from extraction (geometry) + validation (schema).

---

## PHASE 4 — Structuring (the single LLM call)

### Functionality
Input: `Block[]` (with measured geometry) + geometry-masked exemplar. The model's job is **classification and grouping, not measurement**:
- Assign each block a `CanvasElement` type (`text` vs `paragraph` vs table cell).
- **Table detection** → `LayoutTableElement`: find repeating row bands sharing column X-positions and row pitch; column X-edges → `TableColumn[]`; band → `rows` + `headerRow`; cells → `CellContent {type:'text'}` (or `{type:'binding'}` in match-and-diff).
- **Zone inference** → set `HeaderConfig.boundaryY` / `FooterConfig` from rules + content position; attach `pageNumber` config to footer text.
- Emit `role` hints when confident (`'watermark'`, `'signature'`).

### Output contract
Elements reference **block IDs** for geometry (or copy measured numbers verbatim). Geometry is overwritten from extraction post-call (§7.4) — the model cannot perturb coordinates.

### Trade-offs
- **+** LLMs are strong at exactly this: categorical classification and relational grouping over structured input.
- **−** Cost/latency of one large-context call per document; table detection is the accuracy ceiling and the main iteration sink.
- **−** Non-determinism — same PDF can yield slightly different groupings. Pin temperature low; cache by content hash.

### Limitation
Complex/nested tables and multi-column flows are approximated (then flagged or rasterized, §7.5). Charts-as-vector-paths are not reverse-engineered (rasterized).

### Recommendation
- Use **structured/constrained output** keyed to the `CanvasElement` union so the response is parseable.
- **Re-inject geometry deterministically** — never trust model coordinates.
- Keep table detection behind a confidence threshold; below it, fall back to image (§7.5) rather than emit a wrong table.

---

## PHASE 5 — Validation / repair (deterministic, no model)

### Functionality
Because the TS types are a closed single source of truth, this is real code, not vibes:
- Parse output against the `CanvasElement` union; **drop/repair** members missing required fields (e.g. `BoxElementType` without `borderStyle`, `BarcodeElementType` without a valid `format` enum).
- **Geometry sanity bounds:** any element outside the page or wider than the page is clamped or rejected — catches any fabricated number that slipped past re-injection.
- Backfill defaults via existing helpers: `ensurePageDefaults`, `defaultHeader` / `defaultFooter`, `syncRepeatFlag`, `migrateV1` patterns.

### Output
A `CanvasElement[]` that is **structurally guaranteed valid** — invalid output cannot reach the canvas.

### Trade-offs
- **+** Turns "schema-accurate" from a marketing word into a guarantee.
- **−** Silent repair can mask upstream bugs; every repair must be logged into the report (§9), not hidden.

### Limitation
Validation guarantees *validity*, not *correctness* — a valid element can still be in a slightly wrong place. That's what the fidelity report and human refinement absorb.

### Recommendation
Derive the validator from the TS types (or a shared schema) so it can never drift from `canvas.ts`. Log every drop/clamp/repair with a reason.

---

## PHASE 6 — Assembly + fidelity report

### Functionality
- Wrap pages with `createTemplateDocument(...)`; attach `pageSize`.
- Write diagnostics into the reserved `ai` field on `TemplateDocument` (`ai: null | Record<string, unknown>` — it exists for exactly this):

```jsonc
"ai": {
  "coverage": { "mapped": 18, "approximated": 2, "dropped": 1 },
  "approximated": [{ "region": "...", "reason": "vector chart", "as": "image" }],
  "dropped":      [{ "region": "...", "reason": "embedded PDF attachment" }],
  "lowConfidence": ["el-123", "el-456"]
}
```

- Editor surfaces *"18 imported · 2 approximated as images · 1 region skipped,"* and badges low-confidence / approximated elements.

### Trade-offs
- **+** Honest UX; user knows exactly which 10% to check.
- **−** Requires editor UI work to render badges/report (ties into the editor UI revamp).

### Limitation
Report quality depends on upstream phases tagging provenance/confidence consistently — it's only as honest as the tags it's fed.

### Recommendation
Make provenance tagging a **contract** across Phases 1–5 (every element carries `{source, confidence}` internally), not an afterthought in Phase 6.

---

## 8. Match-and-diff mode (fidelity unlock)

When Phase 3 returns a strong family hit, flip the problem: **clone the matched stored template** (correct structure, tables, zones, bindings already) and diff only *content* from extracted text. Layout fidelity ≈ 100% because a known-good layout is reused; the LLM only fills values.

This is also where **data binding** activates: a detected line-items table emits `TableBinding {enabled, collectionKey, itemAlias}` + per-cell `CellBinding {path}`, so the rebuilt template is immediately drivable through the existing `CanonicalDocument` mapping flow (`src/types/dataSource.ts`) — not a static snapshot.

- **+** Highest fidelity path; reuses bindings.
- **−** Requires a populated corpus and a reliable similarity threshold; a *wrong* family match is worse than no match (imposes the wrong layout). Gate on a high threshold and show the user which template it matched.

---

## 9. Unsupported-input handling (fallback ladder)

The closed schema *will* meet inputs it can't represent. Response is **predictable degradation**, never failure:

```
native element            ── editable, full fidelity
   ↓ no clean mapping
closest native + flag     ── lossy map, low-confidence badge
   ↓ loss too high
rasterize region → image  ── visual fidelity kept, editability lost   (fallback.ts)
   ↓ can't rasterize
report as dropped         ── listed in ai report, never hidden
```

| Unsupported input | Response |
|---|---|
| Vector logo / gradient / icon | Rasterize → `ImageElementType` (or approximate gradient to dominant color, flagged) |
| Chart as raw vector paths | Rasterize (reconstruct `ChartElementType` only on family match) |
| Multi-column text flow | Split by X-band into `paragraph` elements, flag |
| Nested/complex merged cells | Use `TableCell.span`/`mergedInto` where possible; else flatten + flag or rasterize block |
| AcroForm widgets | checkbox→`CheckboxElementType`, radio→`RadioElementType`, date→`DateElementType`, text/dropdown→`text`+flag, signature→`ImageElementType role:'signature'` |
| Hyperlinks / JS / annotations / OCG layers | No schema home → ignored, listed in report |
| Scanned PDF (no text layer) | Detect at Phase 1 → OCR pipeline or reject with clear message (§10) |

**Isolation rule:** failure is quarantined to the smallest region. One exotic block rasterizes; everything around it imports natively. No single region fails the whole document.

**Strategic payoff:** every approximation/drop is logged with a reason. Aggregated, that's a **frequency-ranked backlog for schema evolution** — the data tells you what element type to add next (e.g., a column container if multi-column dominates).

---

## 10. Scanned PDFs — explicit decision

No text layer breaks the core premise (no extractable geometry). Do **not** limp through producing nonsense.

- Detect at Phase 1 (zero/near-zero text runs).
- Product call: gate behind an OCR pipeline (heavier, separate) **or** reject up front: *"This looks like a scanned document — text-based PDFs only for now."*
- MVP recommendation: **reject with a clear message.** OCR is a separate, later track — see **§14** for how it slots in as an extraction adapter without disturbing Phases 2–6.

---

## 11. MVP sequencing (independently shippable, each measurable)

1. **Phase 0** — eval harness + fixtures.
2. **Phases 1, 2, 5, 6** with a *trivial pass-through structurer* (text/line/box/image only, no LLM). Proves geometry round-trips. **Ship.**
3. **Phase 4** LLM for classification + zone inference. **Ship.**
4. **Table detection** in Phase 4. **Ship.**
5. **Phase 3** retrieval + **match-and-diff** (§8). **Ship.**

Rationale: correctness (geometry + schema) lands first and is provable without any model or corpus; the AI and RAG layers are added on top as quality improvements, each gated on Phase 0 numbers.

---

## 12. Cross-cutting trade-offs & key recommendations

| Decision | Recommendation | Why |
|---|---|---|
| Where geometry comes from | **Extraction only, re-injected post-LLM** | Eliminates the dangerous (geometric) hallucination class entirely |
| What guarantees schema validity | **Deterministic validator from TS types**, not RAG | Validity must be a guarantee, not a probability |
| What RAG is for | **Style normalization + structure naming + match-and-diff** — never correctness | Avoids template contamination |
| In-browser vs server extraction | **pdfjs in-browser for MVP**, stable IR boundary to swap later | Matches current stack; keeps option open |
| Handling the unknown | **Three terminal states + region isolation + honest report** | Never lies; never fails whole-doc |
| Build order | **Eval harness first; AI/RAG last** | Everything else becomes measurable |
| User framing | **"AI draft you refine," with fidelity report** | Sets correct expectations; editor absorbs the last 10% |

---

## 13. Open questions / risks

- **Font mapping** — embedded/subset fonts to our `fontFamily` set; mismatches shift text metrics. Needs a font-alias table + Phase 0 coverage.
- **Table detection ceiling** — the single largest accuracy risk; budget the most iteration here.
- **Corpus quality** — match-and-diff is only as good as the stored templates; a bad family match is worse than none. High similarity threshold + show-the-match UI.
- **Multi-page documents** — clustering and zone inference are described per-page; cross-page table continuation and repeating headers/footers (`ZoneScope`) need explicit handling.
- **Cost/latency** — one large-context LLM call per document; cache by content hash, low temperature.
- **OCR track** — out of MVP; decide owner/timeline separately.

---

# Future prospects

These are **not** MVP and **not** committed. They are recorded here because the architecture was deliberately shaped to admit them at a known seam, and capturing that now keeps near-zero-cost design decisions (e.g. §14.4) from being forgotten.

## 14. Raster sources — scanned PDFs and images (intended Phase 7)

### The thesis
Scanned PDFs and image uploads (PNG/JPG) differ from born-digital PDFs in **exactly one place: how primitives are produced.** Phases 2–6 consume the same `Primitive[]` IR regardless of origin. So this is an **added extraction adapter**, not a redesign.

### The adapter seam
```
                ┌─ pdfjs adapter   (born-digital — exact)
PDF / image ───►├─ OCR adapter     (scanned PDF / photo)
                └─ image adapter   (PNG/JPG — same as scanned, no PDF wrapper)
                          │
                          ▼
                   Primitive[] IR   ← unchanged contract
                          │
                   Phases 2 → 6     ← untouched
```
OCR (Tesseract / a cloud vision API) + CV line-detection (Hough / morphology) emits text-runs-with-bbox, detected rules, and image regions — the same shapes pdfjs produces. Clustering, the LLM classifier, table-band detection, schema validation, and the fidelity report are all reused as-is.

### Amended invariant (the honest cost)
Core principle §2.1 holds geometry/style/content from a born-digital PDF to be **exact**. For raster sources it softens to **estimated with confidence**:
- **Content becomes probabilistic** — OCR text is a recognition with per-word confidence. This is a *new error class*; the existing model assumed content was ground truth.
- **Geometry becomes estimated** — borders/rules come from CV, not vector ops; needs deskew/denoise preprocessing.
- **Style becomes sampled/guessed** — color sampled from pixels, font inferred. Makes style-normalization (snap to house tokens) *more* valuable.

### Why it absorbs cleanly
OCR per-word confidence flows straight into the existing `lowConfidence[]` / fidelity-report machinery (Phase 6). The image-fallback ladder (§9) already handles the worst case — unreadable regions ride further down to rasterized images. Scanned input shifts more regions toward existing fallbacks; it needs no new failure handling. Reuses the planned rasterize capability (image-export engine).

### Cheap thing to do NOW (future-proofing at ~zero cost)
Add two fields to the Phase 1 IR immediately, even though the pdfjs adapter sets them trivially:
```ts
interface Primitive {
  // ...geometry, content, style...
  source: 'vector' | 'ocr' | 'cv';   // provenance
  confidence: number;                 // pdfjs adapter: always 1.0
}
```
Cost today ≈ zero. Payoff: the OCR adapter drops in without reshaping the IR, and Phases 5–6 can already branch on `confidence` (`< threshold → flag or rasterize`). This is the difference between "evolvable in principle" and "evolvable without a refactor."

### Trade-offs / limitation
- **+** Reuses Phases 2–6 wholesale; only the adapter + confidence threading is new.
- **−** New error class (recognition errors); preprocessing burden; per-source accuracy will trail born-digital and must be tracked separately in Phase 0.
- **Limitation:** "exact" is no longer achievable for raster input — it is fundamentally best-effort + confidence-flagged.

### Recommendation
Keep out of MVP (§10 rejects scanned input at launch). Record as Phase 7. Add the `source`/`confidence` IR fields now.

---

## 15. URL → live UI component → standalone sandboxed bundle (sibling product)

A larger, more speculative direction: user supplies a **URL of a UI component**, the system reproduces the UI and **bundles it in a sandbox with its own server.** Recorded here because it reuses this architecture's *pattern* — but it is a **sibling product, not an extension of the template schema.** Conflating the two would damage both.

> **Cross-reference:** this section was reconciled against the real `COMPONENT_EXPORT_ARCHITECTURE.md`. Two halves of this idea are **already designed there**, not speculative — see below.

### What transfers (most of it — the pattern *and* the emitter)
The reusable asset is the *shape*: **adapter → stable IR → normalize → LLM-as-structurer (never fabricator) → validate → emit**, plus the confidence/fallback layer.
- A **URL is just another extraction adapter.** A headless browser (Playwright) yields DOM + computed styles + box-model geometry + screenshots — a *richer, more structured* source than a PDF.
- The **output end already exists** as the `react-bundle` `Emitter` in `COMPONENT_EXPORT_ARCHITECTURE.md` (§3 deliverable + R4 — a self-contained bundle with its own Vite dev server + demo harness). "Bundle in a sandbox with its own server" **is** that deliverable. Not new.
- The **component IR already exists** there too: the `ComponentProfile` + `FieldSpec` overlay (component-export §5.2, §6.1.2). The "second IR" earlier drafts of this section called for is already specified — URL→component should target it, not `TemplateDocument`.

So URL→component is **a new ingest adapter feeding an emitter that is already on the roadmap** — the same hub-and-spoke as PDF-import (new adapter) ↔ component-export (new emitter), meeting at the shared IR. Three composing pieces:
```
PDF-import:        PDF ─(extract)─► primitives ─(structure)─► TemplateDocument ─► editor
Component-export:  TemplateDocument + ComponentProfile ─(react-bundle Emitter)─► bundle
§15 URL→component: URL ─(DOM adapter)─► IR + ComponentProfile ─(react-bundle Emitter)─► bundle
```

### What does NOT transfer (the genuinely new, hard surface)
Still true: **a live component must NOT route through `TemplateDocument`** (static positioned primitives, no behavior). But the new work is narrower than "a whole new IR." It is **one thing: inferring the `ComponentProfile`/`FieldSpec` contract from a rendered DOM.**

In component-export the contract (decoration-vs-field, `editable`, `kind`, `dataType`, `required`, `validation`, binding `direction`) is **authored by a human in the Properties panel** (component-export §6.1.4). A URL has no author — the system must *reconstruct that contract from the DOM*, which is exactly the "behavioral clone" problem stated precisely. That inference is lossy and is where the LLM carries real risk.

**Inversion worth noting:** component-export's *one hard investment* is layout (§6.2 — the canvas threw away responsive structure, so the LLM lane must recover it). A DOM **already carries** real flex/grid in its computed styles, so URL ingestion can read layout intent directly and may **largely bypass that LLM layout lane** — its difficulty moves entirely to contract inference. Mirror-image of canvas-export's hard part.

### The fault line: visual clone vs behavioral clone
"Create the same *exact* UI" silently means two very different problems:

| | Feasibility |
|---|---|
| **Visual reproduction** — DOM + computed styles → JSX + CSS, pixel-close | **Very feasible** — geometry/style is *measured*, same source-of-truth discipline as PDF. |
| **Behavioral reproduction** — state, handlers, data fetching, logic, breakpoints | **Hard, partly unsolved, lossy** — either copy minified/bundled source JS (legal + technical mess) or have the LLM re-implement inferred behavior (unreliable beyond trivial components). |

Treat these as distinct fidelity tiers. Deliverable framing mirrors PDF: *"a faithful visual + structural draft you refine,"* behavior best-effort and flagged. Merging both under "exact" is the trap every "AI clones any site" demo falls into.

### "Its own server / sandbox"
Containerization + process isolation + a dev server per bundle — real ops work (aligns with the AWS deploy direction), but it is the *deployment* side of component-export, **not** an AI capability. Separate track, separate risk.

### Flag
Cloning arbitrary URLs raises IP / terms-of-service questions that a user's own PDF does not. Requires a deliberate product stance.

### Verdict
Credible **as a sibling product**, and more reachable than first assumed: the sandbox runtime (`react-bundle` emitter) and the component IR (`ComponentProfile`/`FieldSpec`) **already exist in `COMPONENT_EXPORT_ARCHITECTURE.md`**. It reuses: the adapter seam, the IR-boundary discipline, LLM-as-structurer, the confidence/fallback machinery, **and** the emitter + component IR from component-export. **The only genuinely new, hard surface is the DOM ingest adapter + inferring the `FieldSpec` contract from a rendered DOM** (the behavioral clone). Do **not** fold it into the template schema; do target the existing `ComponentProfile`.

---

*This document is the canonical reference for the PDF→template feature (§1–13). §14–15 are non-committed future prospects, recorded to preserve the seams and cheap design decisions that keep them reachable. Phases are built and shipped in the order of §11, each gated on the Phase 0 harness.*
