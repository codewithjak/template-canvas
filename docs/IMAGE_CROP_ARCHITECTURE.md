# Image Crop-to-Shape — Architecture

Replace the right panel's duplicate **Insert** tab with an **Edit** tab whose first
tool is **crop-to-shape**: the user drags a rectangular region over the selected
image and picks a shape (rectangle, circle/ellipse, triangle); the image is masked
to that shape and region.

---

## 1. Current behaviour

### 1.1 The duplicate being replaced

`panel/InsertPane.tsx` is, by its own docstring, "a second door to the same
handlers" — it renders the same 13 add-element buttons the left tool rail
(`Toolbar.tsx`) already renders, wired to the identical `onAdd*` handlers. It adds
no capability; it occupies the panel's first tab. The rail is the primary surface
and is unaffected by anything here.

### 1.2 The image model and its render/export

An image element (declared, duplicated, in BOTH `types/canvas.ts` and
`properties/elementTypes.ts`):

```ts
interface ImageElementType {
  id; type: 'image'; role?: 'signature';
  src: string;                       // data URL (uploaded) | http URL | {{field}}
  position: { x; y };
  style: { width; height; objectFit; opacity? };
}
```

- **Canvas render** (`ImageElement.tsx`) is a plain `<img src>` in the element box.
- **Export** (`backend/renderer/elementDrawers.js drawImage`) embeds the whole
  bitmap into the box via `embedPng` / `embedJpg` (detected by magic bytes) and
  `page.drawImage`. There is **no crop and no objectFit** applied server-side.

### 1.3 The consequence that shapes the design

Because export embeds `src` **as-is**, a crop that is **baked into `src` as a
transparent PNG** needs **zero export changes**: `embedPng` keeps the alpha, so
everything outside a triangle/ellipse mask is simply transparent in the PDF. This
is the pivot the whole feature turns on.

---

## 2. Target architecture

### 2.1 Bake, don't re-plumb (the core decision)

Applying a crop draws the source image onto an off-screen `<canvas>`, clips it to
the chosen shape, and exports a **PNG data URL** that becomes the element's new
`src`. The original is preserved on the element so the crop stays re-editable and
resettable — nothing is destroyed (rule g: fix/extend the model, don't layer a
second hidden copy).

Model additions (optional, non-breaking; added to BOTH declarations so they cannot
drift):

```ts
originalSrc?: string;                          // pre-crop image, for re-crop / reset
crop?: { shape: CropShape; rect: NormRect };   // last region + shape, to reopen the editor
```

`CropShape = 'rect' | 'ellipse' | 'triangle'`. `NormRect = { x; y; w; h }` in
**0..1** of the ORIGINAL image's natural size, so it survives element resizing and
re-open without depending on pixels.

### 2.2 Scope boundary — uploaded (data-URL) images only

Phase 1 crops images whose `src` is a **data URL** (i.e. uploaded via the bar's
Upload). Reasons, from §1.2:

- A canvas reading an external `http` image is CORS-tainted and `toDataURL()`
  throws — unreliable to bake.
- A `{{field}}`-bound image has **no pixels at design time** — nothing to bake.

For non-croppable images the Edit tab shows a short hint, not a broken tool. Bound
and URL images are a later phase (§4), which needs a stored crop rect honoured in
the renderer (the non-baked path).

### 2.3 Modules (SRP, low coupling, testable core)

```
src/components/TemplateCanvas/crop/
  cropGeometry.ts   ← PURE. normalized↔pixel rect, clamp, shape polygon, aspect. Unit-tested.
  maskImage.ts      ← DOM canvas: load image → clip to shape → PNG data URL. (impure, manual-tested)
  CropModal.tsx     ← the editor: image + draggable region overlay + shape picker + Apply/Reset.
  CropModal.css
src/components/TemplateCanvas/panel/
  EditPane.tsx      ← replaces InsertPane in the first tab. Opens CropModal for a croppable image.
```

The pure geometry is isolated from the canvas/DOM so it is unit-testable under the
repo's `node --test` runner (which cannot render a canvas). `maskImage` holds the
only DOM dependency; `CropModal` holds the only interaction state.

### 2.4 Data flow (Apply)

1. `CropModal` opens on `originalSrc ?? src`, seeded with `crop` (or a default
   centered rect + `rect` shape).
2. User drags/resizes the region (state: `NormRect`) and picks a `CropShape`.
3. **Apply**:
   - `toPixelRect(normRect, naturalW, naturalH)` → integer pixel region.
   - `maskImageToShape(source, pixelRect, shape)` → PNG data URL.
   - one `onUpdate(id, …)` patch: `{ src: png, originalSrc: source, crop: { shape, rect },
     style: { …, height: aspectHeight(width, pixelRect) } }` — height is matched to the
     crop's aspect so the baked PNG is not stretched by the box.
4. **Reset** restores `src = originalSrc` and clears `crop` / `originalSrc`.

### 2.5 Replace-image coupling (fixed, not worked around)

Replacing the image must not keep a stale crop. The bar's image controls
(`ElementFormatBar.renderImage`: Upload handler and the `src` text field) will
clear the crop fields in the same patch — `{ src, originalSrc: undefined,
crop: undefined }` — so a new image starts uncropped. This fixes the existing
handler rather than adding a guard elsewhere (rule g).

### 2.6 Panel wiring

`EditorPanel`'s first tab becomes **Edit** and renders `EditPane` (using the
`options.selectedElement` + `options.onUpdate` it already receives) instead of
`InsertPane`. The `insert` prop and its call-site object in `TemplateCanvas` are
removed. `InsertPane.tsx` is left in place (unused; safety rule: no file deletion
without confirmation) and can be deleted in a follow-up. The **Data** tab and the
`ElementOptions` block below the tabs are untouched.

---

## 3. Caveats

1. **`originalSrc` doubles the stored image.** Keeping the pre-crop bytes on the
   element (and in saved template JSON) is the price of re-editable, resettable
   crops. If payload size becomes a problem, dropping `originalSrc` trades away
   re-edit/reset — a conscious future toggle, not a silent one.
2. **Data-URL images only** in Phase 1 (§2.2). URL/bound images show a hint.
3. **JPEG → PNG growth.** A masked JPEG is re-encoded as PNG (needs alpha), which
   can be larger. Acceptable; the shape mask requires transparency.
4. **`objectFit` still applies** to the baked PNG in its box. Matching the box
   height to the crop aspect (§2.4) avoids distortion for the common cases.
5. **Two `ImageElementType` declarations** are kept in sync by hand here; this
   feature does not unify them (out of scope, rule h).

---

## 4. Phases

### Phase 1 — Crop-to-shape for uploaded images (this change)

| Task | Description |
| ---- | ----------- |
| T1.1 | `cropGeometry.ts` — `CropShape`, `NormRect`, `clampNormRect`, `toPixelRect`, `aspectHeight`, `shapePolygon(shape,w,h)`. Small pure functions. |
| T1.2 | Model — add `originalSrc?` and `crop?` to `ImageElementType` in `types/canvas.ts` AND `properties/elementTypes.ts`. |
| T1.3 | `maskImage.ts` — `maskImageToShape(src, pixelRect, shape): Promise<string>` (canvas clip + PNG). |
| T1.4 | `CropModal.tsx` + `.css` — image, draggable/resizable region overlay, shape picker, Apply / Cancel / Reset. Follows the existing modal pattern. |
| T1.5 | `EditPane.tsx` — croppable-image → open CropModal (+ Reset); otherwise a hint. |
| T1.6 | `EditorPanel` — first tab → **Edit**/`EditPane`; drop the `insert` prop. `TemplateCanvas` — stop passing `insert`. |
| T1.7 | `ElementFormatBar.renderImage` — clear `originalSrc`/`crop` when the image is replaced (§2.5). |
| T1.8 | Tests — `cropGeometry.test.ts`: clamp bounds, normalized↔pixel round-trip, aspect height, triangle/ellipse polygon points. |

Exit check: select an uploaded image → Edit tab → crop to a triangle → the canvas
shows the triangle, export shows the triangle (no backend change); Reset restores
the full image; replacing the image clears the crop. `npm run build`, `npm test`,
`npm run lint` clean of new issues.

### Future phases (documented, NOT built now)

- **P2 — Bound / URL images:** store the crop rect (already modelled) and honour it
  in `elementDrawers.drawImage` by slicing/clipping at render, so `{{field}}` images
  crop without a design-time bake.
- **P3 — More shapes:** rounded-rect, diamond, star, hexagon — each is one more
  `shapePolygon` case + one preview swatch; the engine is unchanged.
- **P4 — In-canvas crop handles** and image **adjust** (flip / rotate 90° / mask
  radius), reusing the same bake path.

---

## 5. Status (amendment)

Phase 1 implemented. Checked against §4 — no drift; every task landed as specified.

| Task | Landed as |
| ---- | --------- |
| T1.1 | `crop/cropGeometry.ts` — `CropShape`, `NormRect`, `clampNormRect`, `toPixelRect`, `aspectHeight`, `shapePolygon`. |
| T1.2 | `originalSrc?` / `crop?` added to `ImageElementType` in `types/canvas.ts` AND `properties/elementTypes.ts` (kept in sync, per §3.5). |
| T1.3 | `crop/maskImage.ts` — `maskImageToShape(src, pixelRect, shape)`. |
| T1.4 | `crop/CropModal.tsx` + `.css` — image, draggable/resizable region, shape picker, Apply / Cancel. |
| T1.5 | `panel/EditPane.tsx` — croppable-image → CropModal (+ Reset); otherwise a hint. |
| T1.6 | `EditorPanel` first tab Insert → **Edit**/`EditPane`; `insert` prop and its `TemplateCanvas` call-site object removed. |
| T1.7 | `ElementFormatBar.renderImage` clears `originalSrc`/`crop` on image replace (§2.5). |
| T1.8 | `crop/cropGeometry.test.ts` — clamp, normalized↔pixel, aspect, polygon points. |

### 5.1 Deltas worth recording (within scope)

- **Reset lives in `EditPane`, not `CropModal`** (§2.4 put Reset "in the editor").
  Reset just restores `src = originalSrc` and clears the crop — no modal needed — so
  it sits next to the Crop button. Same behaviour, one fewer modal round-trip.
- **Mask preview dims the cut-away area** (even-odd SVG path = region rect minus the
  shape) rather than tinting the kept area, so what stays lit is exactly what Apply
  keeps. Refinement of §2.4's editor, not a scope change.
- **`InsertPane.tsx` is orphaned, not deleted** — its wiring is removed (§2.6) but the
  file remains (safety rule: no deletion without confirmation). Pending confirmation.
  **Update:** confirmed and deleted; verified zero importers first, build + tests
  (80/80) still green.

### 5.2 Verification

`npm run build` clean; `npm test` 80/80 (9 new geometry tests); `npm run lint`
unchanged from master (54 pre-existing problems, new files add none).

**Not yet driven in the live editor** — `/canvas` is auth-gated, and the intended
browser check of the canvas→transparent-PNG bake (the one path unit tests cannot
exercise) was interrupted. Outstanding before this can be called end-to-end verified:
crop an uploaded image to a triangle, confirm the canvas shows it, and confirm the
PDF export shows the same transparency.

---

## 6. Amendment (2026-07-16) — P2 expanded: placeholder crop authoring

> Amends §4 **P2 — Bound / URL images**. The original P2 bullet is left as written
> (rule k); this section supersedes it where they differ and fills the two gaps it
> left: (1) it only described *honoring* a stored crop at render, never *how the
> shape is authored* on an image that has no pixels at design time; (2) it named
> `elementDrawers.drawImage`, which is **dead code** — the live path is
> `case 'image'` in `backend/renderer/pdfLibRenderer.js`.

### 6.1 The requirement this adds

The user selects an image element bound to a token (`{{field}}`) — one whose pixels
arrive later from an API, sheet, or any datasource — and **crops it to a shape
before any image exists**. At generation the incoming image is masked to that
stored shape, so every generated document shows the datasource image already
cropped, identical to the shape the designer drew on the empty placeholder.

### 6.2 Current behaviour (verified against source)

- `EditPane.croppableImage()` (`panel/EditPane.tsx:15`) returns true only when
  `(originalSrc ?? src).startsWith('data:')`. A `{{field}}` (or `http`) src fails,
  so the panel shows the hint — no way to author a crop.
- `CropModal` (`crop/CropModal.tsx:67`) opens on `originalSrc ?? src` and probes it
  as an `Image` for natural size. A token has no loadable pixels, so the modal
  cannot render its drag surface.
- The model already carries `crop?: { shape: CropShape; rect: NormRect }` (§2.1) —
  the field needed to persist a shape **without** a baked `src` already exists.
- Live export `case 'image'` (`pdfLibRenderer.js`) embeds `_imgBytes` and draws a
  plain rectangle; it never reads `el.crop`. (`elementDrawers.drawImage` is dead.)

### 6.3 Target architecture — author the shape, mask at render (no bake)

The Phase-1 path **bakes** a masked PNG into `src` (§2.1). A placeholder has no
pixels to bake, so P2 splits crop into its two halves and defers the mask to
render time:

1. **Authoring (editor) — persist shape + rect only.** For a token/URL image the
   Edit tab offers a **shape-only** crop: the designer picks a shape and a region
   over the *element box* (not over image pixels), and Apply writes **only**
   `{ crop: { shape, rect } }`. `src` (the `{{field}}` token) and `originalSrc` are
   left untouched — nothing is baked, nothing is destroyed (rule g).
2. **Preview (editor canvas).** `ImageElement.tsx` applies the crop shape as a CSS
   `clip-path` (derived from the same `shapePolygon`/geometry) so the empty
   placeholder box already shows the intended silhouette — "looks the same as it
   was cropped before uploading."
3. **Honoring (export, live path).** In `pdfLibRenderer.js` `case 'image'`, when
   `el.crop` is set, set a **PDF clipping path** to the shape (positioned/scaled in
   the element box, and offset so `crop.rect` selects the shown region of the
   source) and draw the fetched image inside it. Clip, not re-encode: it reuses the
   vector path machinery already in the renderer (the same `drawSvgPath`/path
   approach used by the box-radius fix and chart triangles), so **no image-masking
   dependency is added** (`sharp` is not resolvable from the backend here anyway).

This keeps the two flows cleanly separated (SRP): Phase-1 data-URL images stay on
the bake path unchanged; token/URL images take the store-shape-then-clip path.
Byte-for-byte, any image with no `crop` is unaffected.

### 6.4 Phase P2 tasks (small, single-responsibility)

| Task | Description |
| ---- | ----------- |
| P2.1 | `shapeAuthorable(el)` predicate in `EditPane` — true for an image whose src is a `{{field}}`/`http` (i.e. not croppable-by-bake but valid to carry a shape). Keep `croppableImage` as-is; add the new predicate beside it. |
| P2.2 | Shape-only authoring UI: reuse `CropModal` in a **no-pixels mode** (render the element box + draggable region over a neutral backdrop, shape picker) OR a lightweight inline shape picker. Apply patches `{ crop: { shape, rect } }` only — never `src`/`originalSrc`. |
| P2.3 | `ImageElement.tsx` — when `crop` is set and src is a placeholder/URL, apply `clip-path` from `shapePolygon(crop.shape, rect)` so the canvas previews the silhouette. |
| P2.4 | `pdfLibRenderer.js` `case 'image'` — when `el.crop` is set, push a clip path for the shape+rect, `drawImage`, pop state. Pure helper `imageClipPath(shape, rect, wPt, hPt)` reusing `cropGeometry`. |
| P2.5 | Retarget the dead reference: this work lands in the **live** renderer; do not touch `elementDrawers.drawImage`. |
| P2.6 | Tests — geometry for `imageClipPath` (unit); an export assertion that a `{{field}}` image with `crop.shape='ellipse'` produces curve/clip operators (not a bare rectangle), mirroring the box-radius verification. |

Exit check: bind an image to `{{photo}}`, author an ellipse crop on the empty
placeholder, fill `{{photo}}` from sample data, export → the generated image is a
clean ellipse; an image with no `crop` exports byte-identical to today.

### 6.5 Caveats

1. **Clip vs. bake fidelity.** Clipping at render avoids re-encoding but relies on
   the renderer's clip support; if a shape proves hard to clip cleanly, the
   fallback is a render-time raster mask, which *would* add an image dependency —
   a conscious trade, not a silent one.
2. **`rect` semantics for bound images.** For a placeholder the `rect` is authored
   over the element box (aspect unknown until fill), so at render it maps to the
   fetched image via `objectFit: cover` within the shape. Documented so the
   authoring rect is not mistaken for original-pixel coordinates (§2.1's meaning
   for baked crops).
3. **Still no `shape`/`objectFit` unification** with box shapes — out of scope
   (rule h); P2 only adds the image clip path.
