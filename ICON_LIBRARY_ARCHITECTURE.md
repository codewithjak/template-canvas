# Industry Icon Library — Architecture

> Status: **DRAFT / Phase 0 (design)**. No code written yet.
> Owner: TC-0219 (proposed). Supersedes nothing; amends only.

Per project rule: this doc is the source of truth. Once a phase ships, this doc
is **amended** (points appended), never rewritten. Nothing is implemented outside
what is written here.

---

## 1. Goal (one sentence)

Give the editor a toolbar **Icons library**: the user picks an **industry** in
Settings, and the toolbar's Icons dropdown is populated with that industry's
pictograms (e.g. Logistics → truck, pallet, warehouse, forklift). Clicking an
icon drops it onto the canvas as a normal element that exports in the PDF/PNG.

Confirmed scope decisions (2026-07-16):
- **Feature = new clip-art library.** The existing Text/Table/Image/Shape
  buttons are NOT re-skinned. Only a new "Icons" dropdown is added.
- **Industry preference is persisted per user/team** (Supabase), not localStorage.

Explicit non-goals (to avoid over-engineering, rule *i*):
- No icon upload / custom user icons (v1 ships a curated built-in set only).
- No per-icon colour theming beyond the single fill the icon already carries.
- No new element type. Icons reuse the existing `image` element.
- No AI icon generation.

---

## 2. Current behaviour (what exists today)

Traced in code before writing this doc:

| Concern | Where | Behaviour today |
|---|---|---|
| Toolbar | `src/components/TemplateCanvas/Toolbar.tsx` | Stateless. Renders buttons, fires `onAddX` callbacks passed from the parent. Glyphs in `toolbar/icons.tsx` are **button chrome**, not canvas content. |
| Insert pattern | `toolbar/ShapesMenu.tsx` | Proven dropdown: button → click-outside close → grid of items → item calls `action()` + closes. This is the pattern the Icons menu copies. |
| Insert flow | `TemplateCanvas.tsx:583` | `handleAddImage → addEl(createImageElement())`. Every inserted thing is a typed element. |
| Element model | `src/types/canvas.ts:101` | Image element = `{ id, type:'image', src, role?, position, style }`. `src` is any string (URL or data URI). |
| Industry taxonomy | `src/templates/registry.ts:90` | `BuiltinCategory` already enumerates 9 industries (Courier & Last-Mile, Logistics & Freight, Construction & Engineering, Insurance, Healthcare, Manufacturing, Events & Hospitality, Real Estate, Arabic RTL). `filterByCategory.ts` already scopes templates by it. |
| Settings page | `src/pages/Settings.tsx` | Thin — only `PlanSection` + `UsageSection`. **No user-preference persistence exists yet.** |
| Client raster helper | `crop/maskImage.ts:54` | Already converts a drawn `<canvas>` to a PNG data URI via `canvas.toDataURL('image/png')`. Icons reuse this exact technique. |
| PDF image embed | `backend/renderer/pdfLibRenderer.js:446,859` | `preloadImages` decodes `data:` (base64) and `http` `src`. Embed accepts **JPEG or PNG only** (`embedJpg`/`embedPng`). **SVG bytes throw and are silently swallowed by the catch.** |

### Key consequence of the export finding
An icon stored as an **SVG data URI would render on-canvas but vanish in the
exported PDF**. Therefore icons must reach the element layer as **PNG**. We
rasterize SVG → PNG on the client at insert time (same `toDataURL` trick as
`maskImage.ts`). Result: **no backend change**, and the icon rides the entire
existing image pipeline (select, move, resize, crop, PDF, PNG, JPEG, bulk).

---

## 3. New architecture

### 3.1 One shared industry vocabulary (SOLID: single source of truth)

`BuiltinCategory` is currently owned by `templates/registry.ts`. Extract the
union to `src/domain/industries.ts` and have both the templates registry AND the
icon registry import it. Picking "Logistics & Freight" then scopes templates
*and* icons from one enum — no parallel taxonomy, no drift (rule *e*).

```
src/domain/industries.ts
  export type Industry = 'Courier & Last-Mile' | 'Logistics & Freight' | ...
  export const INDUSTRIES: readonly Industry[]
  export const DEFAULT_INDUSTRY: Industry   // fallback when user hasn't chosen
```

`registry.ts` re-exports `BuiltinCategory = Industry` so existing imports keep
working (rule *g*: fix/extend existing code, don't fork it).

### 3.2 Icon registry (mirrors the template registry philosophy)

Bundled static assets, no DB, no network — same story as built-in templates.

```
src/icons/registry.ts
  export interface LibraryIcon { id: string; label: string; svg: string }
  export const ICONS_BY_INDUSTRY: Record<Industry, readonly LibraryIcon[]>
  export function iconsForIndustry(i: Industry): readonly LibraryIcon[]
      // falls back to a 'General' set if an industry has no icons yet,
      // mirroring how categoriesOf() guards against empty categories.
```

`svg` is a raw inline SVG string (monochrome, `currentColor` or a fixed fill).

### 3.3 SVG → PNG at insert (the one bit of real work)

```
src/icons/rasterizeIcon.ts
  export async function svgToPngDataUrl(svg: string, px = 256): Promise<string>
      // draw <img src=svg-data-uri> onto an offscreen canvas, toDataURL('image/png')
      // same technique already proven in crop/maskImage.ts
```

Insert factory (small, single-purpose — rule *d*):

```
src/components/TemplateCanvas/elementFactories.ts
  createIconElement(pngDataUrl: string): ImageElementType
      // = image element with src = pngDataUrl, sensible default box (e.g. 64×64)
```

Why raster and not `drawSvgPath` in the backend: adding an SVG branch to the
renderer touches shared export code and pulls SVG-path parsing into the PDF
layer. Rasterizing on the client is smaller, isolated, and reuses an existing
pattern (rule *i*: don't over-engineer; rule *e*: low dependency).

### 3.4 Toolbar integration (toolbar stays dumb)

New `toolbar/IconsMenu.tsx`, a near-copy of `ShapesMenu.tsx`:
- Props: `icons: readonly LibraryIcon[]` and `onAddIcon(icon)`.
- Renders one dropdown button + a grid; no knowledge of industry or persistence.

`Toolbar.tsx` gains two optional props (`icons?`, `onAddIcon?`) and renders the
menu only when `icons?.length`. The parent (`TemplateCanvas`) resolves the
active industry → `iconsForIndustry` → passes the set + an `onAddIcon` that
rasterizes then `addEl(createIconElement(png))`. Toolbar remains presentational.

### 3.5 Settings: industry preference (persisted per user/team)

- **DB**: migration adds `preferred_industry text null` to the existing
  user/team profile row (exact table TBD in Phase 3 against Supabase schema —
  reuse whatever `PlanSection`/`TeamSection` already read).
- **Read/write hook**: `src/account/usePreferredIndustry.ts` — reads on mount,
  writes on change, optimistic. localStorage is only a first-paint cache, not
  the system of record.
- **UI**: new `IndustrySection` card on `Settings.tsx` (a `<select>` over
  `INDUSTRIES`), following the existing `SectionCard` pattern.
- **Consumption**: a light context/provider (or the same hook) exposes the
  active industry to the editor so `TemplateCanvas` can populate the menu.

---

## 4. Phases

Each phase is independently shippable and checked against this doc before moving
on (rule *j*). Tests run after every phase (workflow rule).

- **Phase 0 — Design.** This doc. ✅ (pending review)
- **Phase 1 — Vocabulary + icon data, no UI wiring.**
  `domain/industries.ts`, `icons/registry.ts` (start with ONE industry's set,
  e.g. Logistics + a General fallback), `rasterizeIcon.ts`, unit tests for the
  registry lookup + fallback. No toolbar change yet. *Amend this doc on
  completion.*
- **Phase 2 — Toolbar Icons menu (industry hard-coded to DEFAULT).**
  `IconsMenu.tsx`, `createIconElement`, wire into `Toolbar` + `TemplateCanvas`.
  Verify insert → resize → **PDF/PNG export** actually shows the icon (drives
  the export path, per the /verify habit). No Settings yet.
- **Phase 3 — Settings persistence + real industry selection.**
  Migration, `usePreferredIndustry`, `IndustrySection`, provider; menu now
  follows the stored industry. Backfill remaining industries' icon sets.

---

## 5. Future caveats (rule *b*)

1. **SVG never reaches the PDF as SVG.** Locked in by pdfLibRenderer embed
   supporting PNG/JPEG only. If a future dev stores an icon's raw SVG in `src`,
   it renders on-canvas and disappears on export. The rasterize step is the
   guardrail; keep it.
2. **Raster fidelity vs size.** PNG at fixed px (e.g. 256) is crisp for small
   icons but a large-scaled icon can look soft, and many icons inflate the saved
   template JSON (base64). If this bites, revisit `drawSvgPath` as a *separate*
   amendment — do not pre-build it now.
3. **Taxonomy coupling.** Templates and icons now share `Industry`. Adding an
   industry means adding (optionally empty) icon coverage; the General fallback
   prevents an empty menu but a half-covered industry is a content gap, not a
   bug.
4. **Icon colour.** v1 icons carry their own fill. "Match brand colour" /
   recolour-on-canvas is out of scope and, if wanted later, is a new amendment
   (likely easier if we kept an SVG source alongside the PNG).
5. **Profile table choice.** Phase 3 must confirm whether the preference belongs
   on the user row or the team row (memory notes a `teams` table). Decide against
   the live schema, not assumptions.

---

## 6. Open items to confirm before Phase 1

- Icon source: hand-authored inline SVGs in-repo, or an offline-vendored open
  set (e.g. a permissively licensed pack) reduced to the industries we ship?
  (Licensing + bundle size decision — affects `icons/registry.ts` contents only,
  not the architecture.)
