# UI/UX Mockup — Gap Analysis against the Codebase

Status: evaluation only. No implementation authorised by this document.
Date: 2026-07-13. Subject: the "Mapdoc — Full App Experience" HTML mockup.

This doc answers one question: **what does the mockup show that we already have,
and what does it show that we do not have?** It is deliberately not a plan. Where
it recommends sequencing (§7) it does so only to separate "cheap because the
engine exists" from "expensive because the engine does not".

Method: every surface in the mockup was traced to real code (or to its absence).
File/line references below are load-bearing — they are the evidence, not decoration.

---

## 1. Summary verdict

The mockup is **two products stacked on top of each other**:

1. **A workspace shell** (sidebar, Dashboard, Templates page, Data Sources page).
   We have essentially **none of this UI**, but we have **most of the data behind
   it**. This half is mostly assembly work.
2. **A re-imagined editor** (mode tabs, Live-data toggle, flow/anchor Layout
   panel, zoom, region frames). We already have **more editor capability than the
   mockup shows** — but the mockup's *Layout panel implies a layout engine we do
   not have and cannot cheaply build*.

The single most important finding: **the mockup quietly replaces our absolute
x/y positioning model with a flow/anchor model.** That is not a UI change. It is
a change to the document model, the IR, and all emitters. Everything else in the
mockup is comparatively shallow.

The second most important finding: **the mockup has no empty-state / first-run
surface at all** — it always renders a fully-populated invoice. We just shipped
the Start Layer (canvas activation Phase 1) precisely because a cold empty canvas
is where users stall. Adopting the mockup wholesale would delete that work.

---

## 2. What we already have (and the mockup shows)

| Mockup surface | Reality | Evidence |
|---|---|---|
| Token chips (`{{field}}` styled inline, valid/invalid) | **Have.** Canvas highlights placeholders and validates them | `TextElement.tsx:97`, `ParagraphElement.tsx:83`, `LayoutTableElement.tsx:199` |
| Values substituted into the canvas | **Have, always-on** (see §3.4 for the toggle nuance) | `TemplateCanvas.tsx:462` `previewPages`, `mappingEngine.ts:283` `mapTemplateForPreview` |
| "Repeats on every page" region | **Have** as header/footer boundaries + `repeatHeader` | `BoundaryLine.tsx`, `CanvasPage.repeatHeader` |
| "Repeats per data row" region | **Have** as layout-table binding | `layoutTable.ts` `binding {enabled, collectionKey, itemAlias}` |
| Element select + resize handles + name | **Have** (selection, handles, floating quick bar) | `ElementQuickBar.tsx`, per-element `onResize` |
| Undo / redo | **Have** | `useUndoRedo.ts`, Toolbar `Icons.Undo/Redo` |
| "Saved" indicator | **Have** | `cloudStatus`, `CloudStatusToast.tsx` |
| Record navigation (1 / N) | **Have** | `Toolbar.tsx:200-207`, `BatchExportBar.tsx` |
| Export | **Have, and richer**: PDF, PNG, JPEG, ZPL + bulk + email | `toolbar/ExportMenu.tsx`, `BulkExportPanel.tsx`, `SendDocumentModal.tsx` |
| Data field tree / schema browser | **Have** (viewer + mapping phase) | `DataStructureViewer.tsx`, `upload/MappingPhase.tsx` |
| Template library with categories | **Have**: 35 builtins across 9 categories | `TemplatesLibraryModal.tsx`, `src/templates/builtins/` |
| "My projects" (saved templates) | **Have** | `TemplatesLibraryModal.tsx` mode `projects`, `from('templates')` |
| Plan card + usage bar | **Data exists**, UI does not | `apiIntegration.ts:34` `UsageSummary`, `PlanProvider.tsx` |
| Team / Settings nav | **Have** as a page (not sidebar nav) | `pages/Settings.tsx` — Plan · Team · API · Webhooks · Usage |
| AI rebuild entry | **Have** | `RebuildWithAiModal.tsx` |

**We also have, and the mockup omits entirely** (see §5 — this is a regression risk):
chart, watermark, digital signature, paragraph, radio, checkbox and date elements;
page breaks and multi-page documents; page rulers; page-size presets + custom sizes;
ZPL label export; bulk export; email send; RTL/Arabic support; the relationship
builder for multi-collection data; and the Start Layer first-run surface.

---

## 3. What we do not have

### 3.1 The flow/anchor layout model — THE deep gap

The mockup's Layout panel offers: `Flow: In flow | Pinned`, `Anchor: Below ▸ Header
region`, `Align: Left|Center|Right`, `Width: Hug | Fill column | Fixed`. It
conspicuously has **no X/Y coordinates**.

Our model is **absolute coordinates, everywhere**:
- every element carries `position: { x, y }` (`types/canvas.ts`)
- the properties panel edits them numerically (`properties/PositionProperties.tsx:21-31`)
- elements render `position:absolute; left:{x}px; top:{y}px` (e.g. `TextElement.tsx`)
- `seedLayout.ts` places its seeded title/table by hard-coded x/y (`{x:48, y:40}`)

Implementing the mockup's Layout panel means introducing a constraint/flow solver,
migrating every stored template, and teaching all emitters (PDF, ZPL, image) to
resolve anchors. **This is its own architecture doc, not a task in an existing
phase.** Nothing else in the mockup is remotely this expensive, and it should not
be smuggled in as "UI polish".

### 3.2 The workspace shell (no Dashboard / Templates / Data Sources routes)

There is no app shell. `/canvas` *is* the product: `pages/Canvas.tsx` is a fixed
52px bar containing `UserMenu` + an "Integrations" button, with `<TemplateCanvas />`
below it. Routes are Home, Features, Pricing, Careers, Login, Canvas, Builder,
Settings, Admin (`App.tsx`). There is no Dashboard, no Templates page, no Data
Sources page, and no persistent sidebar.

Consequences per mockup surface:
- **Dashboard stat tiles**: the *numbers* exist (`GET /v1/usage` → templates used,
  exports this month, AI builds this month) but no frontend reads them for display,
  and "avg. batch time" does not exist anywhere.
- **Recent generations feed**: `analytics_events` is **write-only from the
  frontend** (`analytics.ts:35` is the only `from('analytics_events')` in `src/`).
  The backend *does* read it (`backend/usage.js`, `backend/admin/activity.js`
  already builds a per-member timeline), so a user-facing feed needs a new
  endpoint, not a new data model.
- **Templates page**: cheapest win in the whole mockup. Categories already exist
  on the builtins, so the chip filter is real. Only thumbnails are missing — and
  that is already scoped as **Phase 2 of the canvas activation doc**.

### 3.3 Persisted data sources — no backend at all

The mockup's Data Sources page shows saved sources with sync times and a **live
streaming API source**. Persisted tables in the app are only: `templates`,
`template_bindings`, `profiles`, `memberships`, `analytics_events`.

**There is no data-source table.** An uploaded file becomes in-memory state
(`ir` / `rds` in `TemplateCanvas`) and is lost on reload. "Synced 2m ago",
"live", and re-using one source across templates are all **new backend surface**
(storage, refresh, and — for the API source — polling/streaming). This is the
second-most expensive item in the mockup and is easy to mistake for a UI page.

### 3.4 The Live-data toggle (subtler than it looks)

We have the substitution engine and we run it: when `ir` exists, the canvas
renders `previewPages`, i.e. **resolved values, always**. What we lack is the
*control*: there is no way to look at your template as `{{tokens}}` **while data
is bound**. The mockup treats token-view and value-view as a user-controlled
toggle; we treat it as a mode implied by whether data happens to be loaded.

So this is genuinely small — a boolean plus one ternary at `TemplateCanvas.tsx:1291`
choosing `pages` vs `previewPages` — but it is a real capability we do not offer,
and it is worth having (it is how a user checks *why* a field is not filling).

### 3.5 Everything else missing (cheap → moderate)

- **Zoom / fit controls**: absent. Already declared out of scope in the activation
  doc ("touches rendering and coordinate math"), and that judgment still holds.
- **Mode tabs** (Design / Data / Preview / Export): absent. We use modal panels and
  an always-on preview instead. This is a navigation re-frame, not new capability.
- **Right-panel Insert tab**: we insert from the left rail (`Toolbar.tsx:92-137`).
  The mockup moves insertion into the right panel. Pure re-arrangement — but note
  our rail carries **13 element types** vs the mockup's 8 tiles.
- **Hover-a-field-to-locate-it-on-the-page**: absent, and genuinely nice. Needs a
  field→element index, which `fieldMapping` already effectively contains.
- **Drag a field onto the canvas to bind it**: absent (binding is done in the
  mapping phase / properties). Moderate.
- **Bound / unbound dots in the field tree**: absent. Data exists in `fieldMapping`.
- **Favourites / starred templates**: absent (no column, no UI).
- **Share**: absent entirely (no sharing model).
- **Global search** (templates + data + docs): absent.
- **Sidebar plan card**: absent as UI; data exists.

---

## 4. Caveats and risks (rule b)

1. **The mockup is a visual system, not just screens.** It is a light "Clean
   Studio" palette with its own token set (`--ink-*`, `--pink`, `--jade`,
   `--amber`). We already ran an editor UI revamp on an existing token system.
   Adopting the mockup's look means **mapping its tokens onto ours**, not pasting
   its CSS. Doing this piecemeal will produce two visual languages in one app.
2. **The mockup's document is a demo, not our renderer.** Its "paper" is
   hand-authored HTML with flow layout. Ours is absolutely-positioned React
   elements driven by the canvas model. Screenshots will not match until §3.1 is
   answered, and no amount of CSS closes that gap.
3. **`parseTextWithPlaceholders` is triplicated** (`TextElement`,
   `ParagraphElement`, `LayoutTableElement`). Any change to token rendering — which
   the mockup's chip styling implies — must fix that duplication first (rule g:
   fix the existing code, do not add a fourth copy).
4. **Do not let the mockup's reduced rail shrink the product** (§5).
5. **Overlap with the canvas activation doc**: template thumbnails are its Phase 2
   and toolbar clarity is its Phase 4. Those stay owned by that doc — this analysis
   must not fork them (rule k: amend, do not duplicate).

---

## 5. What the mockup would REGRESS if adopted literally

The mockup's rail is Select / Text / Image / Shape / Table / Data field /
Barcode / AI. Our rail additionally ships **Chart, Watermark, Digital signature,
Paragraph, Radio, Checkbox, Date**. Its editor also has no page breaks, no
multi-page, no rulers, no page-size control, no ZPL, no bulk export, no email
send, no RTL support, no relationship builder, and — most importantly — **no
first-run/empty state**, which is the entire subject of the workstream currently
in flight.

The mockup is best read as **a visual and navigational proposal**, not as a
feature specification. Treating its element list as a target would delete shipped
capability.

---

## 6. Honest scorecard

| Area | Have | Partial | Missing |
|---|---|---|---|
| Editor element types | ✅ (superset) | | |
| Data binding + preview | ✅ | toggle (§3.4) | drag-to-bind, hover-to-locate |
| Regions / repeat semantics | ✅ | visual framing + labels | |
| Export | ✅ (superset) | | |
| Template library | ✅ | thumbnails (activation Phase 2) | favourites, page-level route |
| Layout model | | | ❌ flow/anchor (§3.1) |
| Workspace shell | | Settings only | ❌ Dashboard, Templates page, Sources page |
| Data-source persistence | | | ❌ no table, no backend |
| Dashboard metrics | backend has them | | ❌ no user-facing read path |
| Zoom | | | ❌ (deliberately out of scope) |
| Visual system | tokens exist | | ❌ not the mockup's system |

---

## 7. If we pursue this, the honest sequencing

Ordered by (value ÷ cost), **not** proposed for approval here:

1. **Live-data / token toggle** (§3.4) — hours. Engine already exists.
2. **Templates page + category chips** — days. Categories exist; converts the
   existing modal into a route. Lands naturally with activation Phase 2 thumbnails.
3. **Workspace shell + sidebar + Dashboard** — weeks. Needs one new read endpoint
   for the activity feed; stat tiles can reuse `GET /v1/usage` today.
4. **Field tree UX** (bound/unbound dots, hover-to-locate, drag-to-bind) — weeks.
5. **Persisted data sources** (§3.3) — new backend: schema, storage, refresh.
6. **Flow/anchor layout** (§3.1) — **its own architecture doc.** Do not start it
   inside any existing phase.

**Explicitly out of scope of any adoption:** zoom (owned by its own future doc),
sharing, favourites, global search, and the live-streaming API source.

---

## 8. Recommendation

Adopt the mockup as a **visual and navigational direction**, and reject it as a
**feature specification**. Items 1–3 above are real wins that the existing engine
already supports. Items 5–6 are new products in disguise and must not be started
without their own documents.

Above all: finish the canvas activation workstream first. The mockup shows a
populated, healthy account — it is silent about the cold-start problem, which is
the problem we currently have evidence for.
