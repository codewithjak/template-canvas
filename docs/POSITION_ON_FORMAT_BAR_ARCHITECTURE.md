# Numeric X/Y on the Format Bar — Architecture

Restore numeric X/Y position editing for **every** selectable element by adding
X and Y fields to the floating format bars, and remove the leftover copy that
only three element types could reach in the right panel.

---

## 1. Current behaviour

Position lives on every element as a top-level field:

```ts
position: { x: number; y: number }        // radio/checkbox also carry relativeOffset?
```

It is written through `onUpdate(id, { position: { ...position, x } })`.

The only UI that edits it numerically is `properties/PositionProperties.tsx`
(an X box and a Y box in the panel `property-*` idiom). That component is rendered
in exactly one place: `panel/ElementOptions.tsx:109`.

`ElementOptions` returns `null` unless the selected element is a **table**, a
**chart**, or **page-number text** (`optionsTitle` at `ElementOptions.tsx:42`). So:

| Element                                            | Can set X/Y today? |
| -------------------------------------------------- | ------------------ |
| table, chart, page-number text                     | Yes (right panel)  |
| image, box, line, barcode, radio, checkbox, date   | **No**             |
| text, paragraph                                    | **No**             |

Dragging still moves an element, but there is no numeric X/Y for most elements.
This is the regression the format-bar migration introduced: everyday controls
(W/H, colour, font) moved onto the floating bars, but X/Y did not come with them,
and it only survives for the three types that happen to open the panel.

### 1.1 The two format bars

Both share the `.tfb` styling and the same `handleUpdateElement` handler
(`TemplateCanvas.tsx:1545`, `:1549`):

- `TextFormatBar` — text and paragraph. Already shows numeric W / Opacity / Rotate.
- `ElementFormatBar` — image, box, line, table, barcode, radio, checkbox, date,
  chart. Already shows numeric W / H via its `NumField`.

Neither shows X/Y.

---

## 2. Target architecture

### 2.1 One shared position control, in the bar idiom

A new `PositionFields.tsx` renders an **X** and a **Y** field in the `.tfb`
idiom (`tfb-field` + `tfb-label` + `tfb-num`, the same markup the W/H fields
already use). It is the single position editor for both bars, so the two bars do
not each grow their own copy (DRY; SRP — the component's one job is X/Y).

It writes through the shared `UpdateElement` handler and only ever touches
`position`, so it introduces nothing to the model or the export pipeline — exactly
the discipline the existing bars follow.

`position` is a top-level field (not `style`), so it patches
`onUpdate(id, { position: { ...element.position, ...patch } })`. Spreading the
existing position preserves radio/checkbox `relativeOffset`, which is edited by a
separate field on the element bar.

### 2.2 Both bars host it

- `TextFormatBar` renders `<PositionFields>` alongside its W / Opacity / Rotate.
- `ElementFormatBar` renders `<PositionFields>` once, at the end, for every
  element type it serves (it is type-independent — every element has `position`).

### 2.3 Remove the panel duplicate

`PositionProperties` is removed from `ElementOptions` (its import and its one
render at line 109). Once X/Y is on the bar, table / chart / page-number would
otherwise show it in two places — a drift risk and a confusing UI. The bar becomes
the single source of truth for position, matching the rule that everyday controls
live on the bar and only true overflow lives in the panel.

The `properties/PositionProperties.tsx` **file is left in place** (safety rule: no
file deletion without explicit confirmation). It becomes unused; it can be deleted
in a follow-up once confirmed. It is not modified.

---

## 3. Caveats

1. **`Partial<CanvasElement>` is a distributed union.** Passing
   `{ position: {...} }` type-checks because every union member has a compatible
   `position`. If a future element type omits `position`, this control must be
   guarded — today none do.
2. **No clamping to page bounds.** Like the old `PositionProperties`, the fields
   allow any `x, y >= 0`; an element can be pushed past the page edge, exactly as
   before. Bounds enforcement is out of scope for this change.
3. **Bar width.** Two more numeric fields lengthen an already-wide bar for
   image/box/barcode. They are narrow (`tfb-num`), and the bar already scrolls /
   wraps by its existing CSS; no layout change is in scope.
4. **`PositionProperties.tsx` becomes dead code** until deleted (caveat, §2.3).

---

## 4. Phases

### Phase 1 — Shared control + both bars + de-dupe (this change)

| Task | Description |
| ---- | ----------- |
| T1.1 | `PositionFields.tsx` — X and Y `tfb-num` inputs, patching `position` through `UpdateElement`. Small, presentational, no element-type branching. |
| T1.2 | `TextFormatBar` — render `<PositionFields element onUpdate />` with its numeric fields. |
| T1.3 | `ElementFormatBar` — render `<PositionFields>` once at the end of the bar. |
| T1.4 | `ElementOptions` — remove the `PositionProperties` import and render (§2.3). |
| T1.5 | Tests: a unit test that `PositionFields` emits the right `position` patch for X and for Y, preserving the other axis (and `relativeOffset`). |

Exit check: every element type shows X/Y on its bar; table/chart/page-number show
it once (on the bar, not the panel); `npm run build`, `npm test`, `npm run lint`
clean of new issues.

---

## 5. Status (amendment)

Phase 1 implemented.

- **T1.1** `PositionFields.tsx` — X/Y `tfb-num` inputs. The pure merge rule lives in
  `positionPatch.ts` (`mergePosition`), split out so the component file stays
  component-only for react-refresh, and so the rule is unit-testable.
- **T1.2 / T1.3** Both bars render `<PositionFields>`: `TextFormatBar` (text +
  paragraph) and `ElementFormatBar` (once, for every type it serves).
- **T1.4** `PositionProperties` removed from `panel/ElementOptions.tsx` (import +
  render). Its file is left in place, now unused (safety rule: no deletion without
  confirmation). Deleting it is a one-line follow-up when confirmed.
- **T1.5** `PositionFields.test.ts` covers the merge: X keeps Y, Y keeps X, and
  `relativeOffset` survives an axis edit.

Verified: `npm run build` clean, `npm test` 71/71 (3 new), `npm run lint` unchanged
from master (54 problems, all pre-existing). Not driven in a live browser: `/canvas`
is auth-gated, so verification is the type-checked render tree plus the unit test,
not a manual editor session.

### 5.1 Follow-up done

The orphaned `properties/PositionProperties.tsx` (noted in §2.3 / T1.4 as left in
place pending confirmation) has now been deleted on explicit request. It was
verified to have zero importers first, so no working code was affected — the X/Y
editor on the bars (`PositionFields.tsx` / `positionPatch.ts`) is a separate,
untouched implementation. `npm run build` and `npm test` (71/71) stay green.
