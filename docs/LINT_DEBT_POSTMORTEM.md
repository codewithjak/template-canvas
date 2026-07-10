# Lint Debt: postmortem + remediation plan

> **Status:** Postmortem / Remediation plan (pre-fix)
> **Date:** 2026-07-09
> **Scope owner:** Junaid Khan
> **Trigger:** adding CI surfaced that `npm run lint` (`eslint .`) is red across the repo.
> **Rule reference:** `claude.md` — coding standard "Never use `any`", and rule (g)
> "fix the existing code, do not apply another layer of code to fix the issue."

---

## 1. Summary

`npm run lint` reports **55 problems: 47 errors, 8 warnings, across 12 files.**

**None are in the cloud-builder work** (`backend/**`, `src/builder/**` lint clean). All
of it is pre-existing debt in the **doc/image editor** and shared UI/services. It went
unnoticed because **lint was never in CI** — so nothing failed when it accumulated.

| Rule | Count | Severity | Nature |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` | 41 | error | mechanical (mostly) — violates the "never `any`" standard |
| `react-hooks/exhaustive-deps` | 7 | warn | behavioral — stale-closure risk |
| `react-hooks/refs` | 3 | error | **behavioral** — ref read during render |
| `react-hooks/preserve-manual-memoization` | 2 | error | behavioral — React Compiler couldn't keep memoization |
| `react-hooks/set-state-in-effect` | 1 | error | **behavioral** — cascading renders |
| unused `eslint-disable` (in `_spike/`) | 1 | warn | trivial |

---

## 2. Root cause (why this exists)

Two independent causes, both worth naming so it doesn't recur:

1. **No lint gate in CI.** `eslint .` was only ever run manually, so every `any` and every
   hook smell merged unnoticed. Debt compounds silently without a gate. (This whole
   document exists *because* we finally added CI and it lit up.)
2. **Rule set moved under the code.** The `react-hooks` errors
   (`refs`, `set-state-in-effect`, `preserve-manual-memoization`) are **newer
   React-Compiler-era rules**. Much of this code predates them, so it wasn't wrong when
   written — the linter got stricter and surfaced latent correctness smells. These are
   *not* style nits; they flag real render-safety issues.

The `no-explicit-any` count (41) is the "never `any`" coding standard never having been
enforced mechanically.

---

## 3. The two classes of fix (this is the key postmortem distinction)

Per `claude.md` rule (g) — *fix the code, don't layer over it, explain behavioral fixes*:

### 3.1 Mechanical (safe — proper typing, no behavior change)

**`@typescript-eslint/no-explicit-any` — 41 errors.** Each `any` is replaced with the
real type, or `unknown` + a narrowing guard where the shape is genuinely dynamic. No
runtime behavior changes; the risk is only "did we pick the right type." Distribution:

| File | Lines | Count |
|---|---|---|
| `src/components/TemplateCanvas/TemplateCanvas.tsx` | 370–372, 426, 432, 844, 1021, 1213–1232 | 11 |
| `src/components/TemplateCanvas/CanvasElementView.tsx` | 41, 94, 104, 166, 176 | 5 |
| `src/components/TemplateCanvas/BoundaryLine.tsx` | 84, 91, 245, 261, 278 | 5 |
| `src/services/useBulkExport.ts` | 36–38, 51, 249 | 5 |
| `src/components/TemplateCanvas/BulkExportPanel.tsx` | 42–43, 82, 173–174, 246 | 6 |
| `src/components/TemplateCanvas/UploadData.tsx` | 155–156 | 3 |
| `src/types/canvas.ts` | 348, 358 | 2 |
| `src/components/TemplateCanvas/LayoutTableElement.tsx` | 285 | 1 |
| `src/services/templateApi.ts` | 9 | 1 |

> `src/types/canvas.ts` (2) is highest-leverage: it's a shared type file, so fixing the
> `any` there likely tightens call sites and removes downstream casts. Do it first.

### 3.2 Behavioral (real bug fixes — require care + explanation)

These are **not** cosmetic; "fixing" them changes render behavior, so each needs
understanding + a note, and a manual re-test of that feature (workflow rule: run tests
after changes).

- **`react-hooks/refs` — `src/utils/useUndoRedo.ts` (L19, 59, 60).** `canUndo`/`canRedo`
  are derived from `ref.current` **during render**, so they can be stale and not trigger
  a re-render when undo/redo availability changes. Correct fix: track undo/redo depth in
  **state**, not a ref read at render time. This is a genuine correctness fix to the
  undo/redo hook — test undo/redo button enablement after.
- **`react-hooks/set-state-in-effect` — `src/auth/UserMenu.tsx` (L28).** `setState` called
  synchronously in an effect → cascading renders. Fix by deriving the value during render
  or gating the effect, not by suppressing.
- **`react-hooks/preserve-manual-memoization` — `BulkExportPanel.tsx` (L159, ×2).** The
  React Compiler can't preserve a hand-written `useMemo`/`useCallback` there; the manual
  memoization is shaped in a way the compiler rejects. Fix by restructuring the memo so it
  is compiler-legible.
- **`react-hooks/exhaustive-deps` — 7 warnings** (`BulkExportPanel` 141/189,
  `TemplateCanvas` 317/391/458/554, `UploadData` 144). Missing hook deps → stale closures.
  Each needs judgement: add the dep, or restructure so it isn't needed. **Never** silence
  with a disable comment (that's the layer rule (g) forbids). The `TemplateCanvas`
  `setPages` cases (317/391/458) are likely a stable setter that just needs including.

### 3.3 Trivial

- **`_spike/rasterize.js` (L1)** — an *unused* `eslint-disable` directive (the thing it
  suppressed no longer fires). Remove the stale directive. `_spike/` is throwaway; consider
  excluding it from lint entirely instead.

---

## 4. Remediation plan (phased, smallest-risk first)

Each phase ends green-for-its-scope and independently reviewable.

- **Phase 1 — shared types.** `src/types/canvas.ts` (2 `any`) + `templateApi.ts` (1).
  Tightening shared types first shrinks later phases and may auto-resolve some call-site
  `any`s. Verify: `tsc` + `eslint` on touched files.
- **Phase 2 — mechanical `any`, per file.** One file per commit
  (CanvasElementView → BoundaryLine → UploadData → useBulkExport → BulkExportPanel →
  LayoutTableElement → TemplateCanvas). Pure typing; `tsc` must stay green each step.
- **Phase 3 — behavioral hook fixes, one at a time, each manually tested.**
  `useUndoRedo` (refs) → `UserMenu` (set-state-in-effect) → `BulkExportPanel`
  (preserve-memoization) → the 7 `exhaustive-deps`. These carry real risk; small commits,
  explanation per fix, re-test the affected feature.
- **Phase 4 — cleanup + the gate.** Remove the stale `_spike` disable (or exclude
  `_spike/`). Then **add `npm run lint` to CI** so a red lint can never merge again — the
  permanent fix for root cause #2 of §2.

---

## 5. Constraints (from `claude.md`)

- **Fix in place, no layers.** No `eslint-disable`, no scoped `lint:ci` that routes around
  the errors — rule (g). (An earlier attempt to add a scoped `lint:ci` was rejected for
  exactly this reason; hence this document.)
- **No `any`.** Replace with the real type or `unknown` + narrowing.
- **TypeScript + functional style**, small self-explanatory functions, run tests after
  changes.

---

## 6. For the postmortem session — open questions

- **`_spike/`:** fix it, or exclude it from `eslint`? It's throwaway; excluding is
  defensible and honest (it's not shipped code).
- **`any` policy going forward:** once clean, is `no-explicit-any` staying `error`
  (blocks CI)? Recommended yes — that's what makes the standard real.
- **Ordering:** ship the CI gate *after* the whole repo is green (Phase 4), or gate
  per-directory sooner? A per-dir gate could protect `backend`/`src/builder` immediately
  while the editor debt is worked down — but note rule (g) tension: that's arguably a
  "layer." Decide together.
- **Ownership:** the behavioral hook fixes (§3.2) touch undo/redo, auth, and bulk export —
  areas outside recent work. Confirm who validates each feature after its fix.

> Bottom line: 41 of 55 are mechanical `any` removals (safe, high-volume); 11 are real
> React render-safety bugs the stricter linter exposed (careful, tested); 1 is trivial.
> The lasting fix is the CI lint gate so this never silently accumulates again.
