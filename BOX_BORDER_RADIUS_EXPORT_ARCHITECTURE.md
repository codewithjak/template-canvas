# Box `borderRadius` in PDF Export — Architecture

Owner: TC-0216 follow-up
Status: Phase 1 in progress
Scope: rounded-corner rendering for **box** elements in the PDF exporter only.
Trigger: the Hotel QR Menu redesign — rounded card capsules and circular photo
frames render round in the editor but square in the exported PDF.

---

## 0. Problem statement

A box element carries `style.borderRadius`. The editor (`BoxElement.tsx`) honors
it via CSS, so a box with a large radius looks rounded — or, when
`borderRadius >= min(w,h)/2`, a perfect circle. The PDF exporter does **not**:
it draws every box with `page.drawRectangle`, which has no corner radius. So a
box that relies on `borderRadius` to look round exports as a sharp-cornered
rectangle, keeping its border color. This is why the menu's circular photo
frames and rounded cards came out as rust rectangles in the PDF.

`borderRadius` appears **nowhere** in `backend/renderer/*` — it is silently
dropped for every box, on every template, today.

---

## a. Current behaviour vs. new architecture

### Current behaviour (verified against source)
- Live path: `backend/index.js` → `generatePdfBuffer` (`pdfLibRenderer.js`).
- `drawElement()` `case 'box'` (pdfLibRenderer.js:744) draws:
  - a fill `page.drawRectangle({ color })` when `backgroundColor` is set, and
  - a border `page.drawRectangle({ borderColor, borderWidth })` when `borderWidth > 0`.
  - It reads width, height, borderWidth, opacity, background/border color —
    **never `borderRadius`**.
- `elementDrawers.js` `drawBox()` is a **dead parallel** copy of the same logic
  (not required or called anywhere in the render path). Out of scope; left
  untouched to avoid changing code nothing runs.
- Box `shape` (`ellipse` / `triangle`) is **also** ignored by the exporter today
  (all shapes draw as rectangles). That is a separate, pre-existing gap and is
  explicitly **out of scope** here — this change touches only `borderRadius`.

### New architecture
- `case 'box'` gains a single decision on the corner radius:
  - `rPt = min(borderRadius*SCALE, wPt/2, hPt/2)` (clamped so it can never exceed
    half the shorter side, which would produce a malformed path).
  - **`rPt <= 0` → unchanged.** The exact same two `drawRectangle` calls run, so
    every existing box (all current templates use radius 0 / unset) exports
    **byte-identical**. This is the safety guarantee.
  - **`rPt > 0`** → fill and border are drawn with `page.drawSvgPath()` using a
    rounded-rectangle path. When `w === h` and `r === w/2`, that same path is a
    circle, so no special-case circle code is needed.
- One new **pure** helper, `roundedRectSvgPath(w, h, r)`, returns the SVG path
  string. No new dependency: `page.drawSvgPath` is already in pdf-lib and is
  already used in this codebase (chart triangles, `elementDrawers.js:469`). The
  SVG coordinate convention (origin top-left, `+y` down, mapped to `x,y`) is the
  same one that code relies on, so the box's top-left maps to `(xPt, pdfY)`.

### Why `drawSvgPath` and not a "rounded rectangle" library
- pdf-lib has no rounded-rect primitive. `drawSvgPath` is the primitive already
  present and already trusted in this file's sibling module. Adding a dependency
  would violate "less dependency" for zero benefit.

---

## b. Future caveats

1. **Stroke centering.** `drawSvgPath` strokes on the path centerline, like
   `drawRectangle`'s border. For very thick borders the rounded border sits a
   hair differently than a hypothetical inner/outer stroke, but it matches the
   editor closely and is correct for the 1-3px borders in use.
2. **Shapes still rectangular.** `shape: 'ellipse' | 'triangle'` remain drawn as
   rectangles in export (unchanged). If those are wanted later, that is a
   separate phase, not an amendment here (rule k).
3. **Dead `drawBox` divergence.** `elementDrawers.drawBox` now differs from the
   live path. It is unreachable, so this is cosmetic; a later cleanup can delete
   it (needs explicit confirmation — safety rule) or route both through one
   helper. Not done now to keep the change minimal (rule i).
4. **PNG/JPEG export** rasterizes this same vector PDF, so it inherits the fix
   for free — no extra work.

---

## c. Phases

### Phase 1 — Honor `borderRadius` for box fill + border (this change)
- Task 1.1 — add pure `roundedRectSvgPath(w, h, r)` helper (string builder, no
  side effects).
- Task 1.2 — in `case 'box'`, compute the clamped `rPt`; branch: `rPt <= 0`
  keeps the existing `drawRectangle` calls verbatim; `rPt > 0` draws fill/border
  via `drawSvgPath`.
- Task 1.3 — verify: multilingual golden hashes still byte-identical (radius-0
  path untouched); a rounded box renders round in a real exported PDF.

### Phase 2 (optional, not in scope) — box `shape` ellipse/triangle in export.

---

## d. Test / safety plan
- `backend/test/multilingual-baseline.test.js` locks Latin output to sha256
  goldens; it must stay green with no `UPDATE_GOLDEN`. Because radius-0 boxes go
  down the identical `drawRectangle` path, the hashes cannot change.
- Full `node --test test/` (backend) and `npm test` (frontend) run after the
  change.
- A rounded box is exported and inspected to confirm real rounded/circular
  corners (the fix's positive assertion).

---

## e. Amendments log
(Append only after Phase 1 — never rewrite the above, rule k.)

- **2026-07-16 — Phase 1 DONE.** Implemented in `backend/renderer/pdfLibRenderer.js`:
  - Added pure `roundedRectSvgPath(w, h, r)` (Task 1.1).
  - `case 'box'` now clamps `rPt = min(borderRadius*SCALE, wPt/2, hPt/2)`; `rPt <= 0`
    runs the original two `drawRectangle` calls unchanged, `rPt > 0` draws fill +
    border via `page.drawSvgPath` (Task 1.2).
  - Verify (Task 1.3): backend `node --test test/` = **160/160 pass**, incl. the
    multilingual sha256 golden baseline (radius-0 output byte-identical — safety
    guarantee held). Frontend `npm test` = 80/80. Direct render check: a
    `borderRadius:70` 140×140 box emits **8 bezier curves and no straight-line
    rectangle** (a true circle); a `borderRadius:0` box emits straight `l` line
    operators exactly as before. pdf-lib draws rectangles via `m`/`l` path ops
    (not the `re` shorthand), which is why radius-0 stays line-based.
  - No drift vs §a: scope stayed `borderRadius`-only; box `shape` and the dead
    `elementDrawers.drawBox` were left untouched as documented.
