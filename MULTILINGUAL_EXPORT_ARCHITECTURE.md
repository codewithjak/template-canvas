# Multilingual Export — Implementation Architecture

Support for exporting templates in non-Latin and right-to-left languages:
Arabic first (Saudi/GCC market entry), then CJK and the rest of Unicode.
The editor and data layer are already multilingual; the export engine is not.

> **TL;DR** — pdf-lib with the built-in PDF fonts only encodes Latin-1
> (WinAnsi). Chinese/Arabic text is silently dropped from the PDF, and in
> several code paths (center/right alignment, charts) it hard-fails the whole
> export. Fixing it is a font-embedding problem first (Phase 1), then a
> text-shaping/bidi problem for Arabic (Phase 2), then RTL layout intent
> (Phase 3). Every phase is additive: documents that export correctly today
> are byte-for-byte unchanged.

**Business driver:** Saudi GTM. ZATCA e-invoicing requires Arabic on tax
invoices; until Phase 2 lands, Mapdoc cannot produce compliant Saudi tax
invoices. Arabic is therefore the priority script, ahead of CJK.

---

## 0. Phase Status Tracker

*(update this table when a phase completes — rule f; check work against this
doc when a phase completes — rule j)*

| Phase | Name | Status | Branch | Notes |
|---|---|---|---|---|
| 0 | Foundations (fontkit, fonts dir, font routing fix, guards) | **DONE** (2026-07-10) | TC-0178 | All 7 tasks; 127/127 backend tests pass; Latin output verified byte-identical vs pre-change frozen-clock baseline; CJK/Arabic now export with visible `?` (were blank/500) |
| 1 | Embedded Unicode fonts (glyphs for Arabic/CJK/Cyrillic/…) | **DONE** (2026-07-10) | TC-0178 | All tasks incl. 1.7; 130/130 tests; Latin byte-identical; CJK+Arabic render real subset-embedded glyphs (CJK/Arabic fixture PDF = 73 KB, well under the 1 MB cap); PNG path verified visually. **Bonus finding:** pdf-lib encodes embedded fonts through fontkit's shaping engine, so Arabic contextual joining already works — Phase 2 shrinks to bidi reordering (mixed-direction runs, Arabic-Indic digit order, RTL wrap order) |
| 2 | Arabic shaping + bidi (Arabic actually correct) | **DONE** (2026-07-10) | TC-0180 | Engine = bidi-js run reordering only (spike: fontkit already shapes + reverses RTL runs; no reshaper added). `visualSegments` in textLayout.js; Arabic-Indic digit order fixed; mixed AR/EN/digit lines match browser bidi; 131/131 tests; Latin byte-identical; verified visually via rasterized PNG |
| 3 | RTL layout intent (direction/lang in model + renderer) | NOT STARTED | | |
| 4 | Editor & UX polish (font picker, CSV encoding) | NOT STARTED | | |

---

## 1. Current Code Behavior (verified against source, 2026-07-10)

The pipeline has three stages. They behave very differently for non-Latin text.

```
   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐
   │  1. EDITOR   │      │ 2. DATA IN   │      │ 3. EXPORT (PDF/PNG/JPEG) │
   │  (browser)   │ ───▶ │ CSV/XLSX/API │ ───▶ │ backend pdf-lib renderer │
   └──────────────┘      └──────────────┘      └──────────────────────────┘
        ✅ ALL                ✅ MOSTLY              ❌ LATIN-1 ONLY
```

### Stage 1 — Editor (browser): works for every language
Text elements render as normal HTML/DOM (`TextElement.tsx`,
`ParagraphElement.tsx`, table cells). The browser supplies fonts, contextual
shaping, and bidi reordering for free. **This is the trap:** the preview looks
perfect, so the export gap is invisible until the user downloads.

### Stage 2 — Data import: mostly works
| Source | Status | Evidence |
|---|---|---|
| Excel `.xlsx` | ✅ | UTF-8 internally; values pass through clean |
| API / JSON | ✅ | JSON is UTF-8 by definition |
| Raw CSV | ⚠️ | `sheetParser.js:317` reads the buffer via `XLSX.read` with **no encoding detection**. A CSV saved as Windows-1256 (Arabic) or GBK (Chinese) mojibakes |

### Stage 3 — Export: the blocker (all failure modes, with line refs)

> **Correction (2026-07-10, verified by live probes before Phase 0):** an
> earlier revision of this doc claimed center/right-aligned non-Latin text
> hard-fails the export (old "F3"). That is wrong: a WinAnsi sanitizer in the
> resolver (**F0**, below) strips non-Latin characters from all text/table
> content *before* the renderer sees it, so text elements never crash — they
> silently lose their content. Only the chart path, which bypasses the
> resolver, hard-fails. Probes: a center-aligned CJK text element exports
> "successfully" (blank); a CJK chart title throws
> `WinAnsi cannot encode "季"`.

**F0. The resolver deletes non-WinAnsi characters — the real "silent blank".**
`backend/utils/resolver.js:83-103 toWinAnsiSafe()` is a chokepoint that every
resolved string passes through (`replacePlaceholders`, `resolveCellValue`):
WinAnsi chars pass, a small symbol map transliterates (≤ → `<=`), everything
else is NFKD-decomposed and any remaining unmappable char **degrades to `""`
— deleted**. Text, paragraph, date, barcode content, and all table cells are
sanitized here, which is why Arabic/CJK exports come out blank rather than
erroring. This was a deliberate crash-guard (its header comment says so);
Phase 0 keeps it but makes the degradation visible, and Phase 1 must make it
font-aware (see task 1.7) or embedded fonts will never receive the original
Unicode.

**F1. The renderer ignores `fontLoader.js` entirely.**
`backend/renderer/fontLoader.js` exports `FontCache` / `resolveStandardFont`
(mapping Arial/Times/Courier), but **nothing imports it**. The real path is
`pdfLibRenderer.js:121-126 embedFonts()`, which embeds exactly two fonts:
`StandardFonts.Helvetica` and `StandardFonts.HelveticaBold`. Consequences:
- Template `fontFamily` (Times, Courier) is silently ignored in every export.
- Italic is never rendered in the PDF path.
- `fontLoader.js` is dead code. Per rule g we **fix it and wire it in**
  (it becomes the font registry); we do not add another layer beside it.

**F2. Renderer-level silent drop (secondary net, mostly dead).**
`pdfLibRenderer.js:189-200 drawTextAt()` wraps `page.drawText` in
`try { … } catch (e) {}`, and the alignment width measurements at `:182,185`
sit **outside** that guard. Because F0 pre-sanitizes all resolved text, these
paths normally never see unencodable chars; the only live consumer of the
catch is unsanitized template-authored strings (e.g. checkbox `el.labels` at
`:810`), which are silently dropped. The unguarded width calls remain a
latent crash if any new unsanitized string reaches them — they get hardened
anyway (cheap, and Phase 1 will route real Unicode through here).

**F4. Charts bypass the sanitizer and are unguarded — the real hard 500.**
Chart text never passes through `toWinAnsiSafe`: static `chart.title` /
`chart.data` labels/values are drawn raw (`elementDrawers.js:440-443` title,
`:491-514` value/axis labels), and collection-bound series are built with
plain `String(resolve(...))` in `resolveChartEl`
(`pdfLibRenderer.js:349-364`). Raw `widthOfTextAtSize` + `page.drawText`
with no try/catch: a single CJK/Arabic chart title or bound label
**hard-fails the entire export**. Verified live.

**F5. Wrapping measures unencodable text as width 0 (latent).**
`pdfLibRenderer.js:132-168 wrapText()` catches measurement errors and leaves
`w = 0`. Latent for the same reason as F2 (F0 sanitizes first), but it means
any future unsanitized text wraps wrong. Fixed by `safeWidth`.

**F6. `elementDrawers.js` text/table drawers are dead code.**
Only `drawBarcode` and `drawChart` are ever imported
(`pdfLibRenderer.js:720,727`); the module's `drawText`, `drawTable`,
`drawBox`, `drawLine`, `drawImage` exports (and `coordinateUtils.wrapText`
consumers) belong to a previous renderer generation, like the dead
`FontCache`. Phase 0 does **not** invest in routing dead functions; only the
live chart path is hardened. (Removing the dead exports is out of scope —
Safety Rule: no deletions without explicit confirmation.)

**Even with fonts embedded, Arabic would still be wrong.** pdf-lib has no
text-layout engine: it draws glyphs isolated (no contextual joining) and
left-to-right (no bidi). This is why fonts (Phase 1) and shaping (Phase 2)
are separate problems and separate phases.

**Downstream emitters:**
- PNG/JPEG (`imageRenderer.js`) rasterizes the vector PDF from
  `generatePdfBuffer`, so every fix here benefits images automatically.
- ZPL (`zplRenderer.js`) is a separate emitter with printer-resident fonts.
  Arabic/CJK on ZPL is **out of scope** for this feature (see §8).

### Language outcome matrix (today, verified by probes)

| Language | Text / paragraph / table (any alignment) | In a chart | Root cause |
|---|---|---|---|
| English/Spanish (WinAnsi incl. € ñ á) | ✅ | ✅ | inside WinAnsi |
| Chinese/Japanese/Korean | chars **deleted** → blank (F0) | **500 error** (F4) | no glyphs |
| Arabic/Hebrew/Persian | chars **deleted** → blank (F0) | **500 error** (F4) | no glyphs + no shaping/bidi |
| Cyrillic/Greek/Hindi | chars **deleted** → blank (F0) | **500 error** (F4) | no glyphs (Hindi also needs shaping) |
| ≤ ≥ → ⁹ etc. | transliterated (`<=`, `->`, `^9`) | **500 error** (F4) | resolver symbol map; charts bypass it |

---

## 2. Target Architecture

```
                        ┌─────────────────────────────────────────────┐
  resolved text run ──▶ │  textLayout(text, opts)          NEW module │
                        │   1. segment into script runs               │
                        │   2. (Phase 2) bidi reorder + Arabic shape  │
                        │   3. pick font per run via FontRegistry     │
                        │   4. measure on the SAME font that draws    │
                        └──────────────────────┬──────────────────────┘
                                               ▼
                        ┌─────────────────────────────────────────────┐
  FontRegistry          │  fontLoader.js (FIXED and finally wired in) │
  backend/fonts/*.ttf   │  Latin-1 → StandardFonts (unchanged today)  │
                        │  other scripts → subset-embed via fontkit   │
                        └─────────────────────────────────────────────┘
```

### Design principles (SOLID, applied without over-engineering)

- **Single responsibility:** `fontLoader.js` owns font selection/embedding.
  `textLayout.js` owns segmentation/shaping/measurement. Renderers own
  geometry only.
- **Open/closed:** the shaper inside `textLayout.js` is one function behind a
  stable signature, so swapping the Arabic reshaper for HarfBuzz later
  (Phase 2 option B) changes one module, not the renderers.
- **Dependency direction:** `pdfLibRenderer.js` and `elementDrawers.js` both
  depend on `textLayout.js`; `textLayout.js` depends on `fontLoader.js`;
  nothing depends back. No new abstraction layers beyond these two modules.
- **Fix, don't layer (rule g):** `embedFonts()` in `pdfLibRenderer.js` and the
  dead `FontCache` are the buggy existing code. They get fixed and unified,
  not bypassed with a parallel path.

### Font registry (fixes and extends `fontLoader.js`)

**Guardrail:** Latin-1 text keeps using StandardFonts with identical metrics.
A run is routed to an embedded Unicode font **only when it contains a
codepoint outside Latin-1**, i.e. only text that is broken today.

| Script | Bundled font (`backend/fonts/`) | Notes |
|---|---|---|
| Arabic / Persian / Urdu | Noto Naskh Arabic (+ Bold) | **priority (Saudi GTM)** |
| Cyrillic / Greek / extended Latin | Noto Sans (+ Bold) | small; italic deferred — the PDF renderer has no italic path today |
| Hebrew | Noto Sans Hebrew | small |
| CJK (Chinese / Japanese / Korean) | Noto Sans CJK SC (single OTF) | always subset. **Phase 1 bundles only the SC variant (~16 MB)**: it contains Han, kana, and hangul glyphs, so all CJK text renders. TC/JP/KR variants differ only in regional glyph *preferences* (~65 MB for all four) and are deferred until a customer needs them |

All Noto, SIL OFL licensed; a `backend/fonts/LICENSES.md` records this.
Fonts embed **subsetted** (only used glyphs) once per `PDFDocument`, loaded
lazily: a document with no non-Latin-1 text embeds nothing and pays zero cost.

---

## 3. Phases

Every task below is a small, self-explanatory function or a bounded edit.
Nothing outside this document gets implemented (rule h).

### Phase 0 — Foundations and bug fixes (small)

Goal: the renderer stops lying (no silent drops, no 500s) and font handling
goes through one honest path. **No new languages work yet**; behavior only
becomes visible and safe.

| # | Task | Where | Definition |
|---|---|---|---|
| 0.1 | Add `@pdf-lib/fontkit` dep; call `pdfDoc.registerFontkit(fontkit)` inside font setup | `backend/package.json`, `fontLoader.js` | one-line registration, no behavior change |
| 0.2 | Fix `fontLoader.js` so the renderer actually uses it: `createFontContext(pdfDoc)` in `fontLoader.js` owns font setup and returns the same `{ normal, bold }` shape as before (Helvetica pair) so output is byte-identical; the renderer's `embedFonts` became a one-line delegate to it (call sites unchanged) | `fontLoader.js`, `pdfLibRenderer.js` | kills the dead code by making it the real path (rule g) |
| 0.3 | `isLatin1(text: string): boolean` — pure helper, true iff every codepoint ≤ 0xFF | `fontLoader.js` | the routing predicate for everything later |
| 0.4 | `safeWidth(font, text, size): number` — returns `widthOfTextAtSize`, or `0` for a null font (preserves the dry-run contract), or on encode failure the width of the `?`-substituted string that `drawTextSafe` will actually draw (so wrapping/alignment match the drawn output) — never throws | new `backend/renderer/textLayout.js` | fixes F5 and the latent width crashes |
| 0.5 | Route the **live** paths through `safeWidth`/`drawTextSafe`: `pdfLibRenderer.js` `wrapText`/`drawTextAt` (132-203) and the chart text in `elementDrawers.js` (title 440-443, labels 491-514). Dead `elementDrawers.drawText`/`drawTable` are left untouched (F6) | both renderers | fixes F4: charts stop 500ing |
| 0.6 | Make the silent deletion visible, at its source: `toWinAnsiSafe` step 3 (`resolver.js:97-101`) substitutes `?` for each unmappable char instead of `''` (fixes F0 per rule g — the buggy behavior is fixed in place, not layered over). WinAnsi fast path, symbol map, and accent decomposition are untouched, so Latin output is byte-identical. `drawTextSafe(page, text, opts)` in `textLayout.js` is the last-resort net for unsanitized strings: on encode failure it probes per-char and redraws with `?` substituted, never throws. *(Note: real tofu ▯ U+25AF is itself not WinAnsi-encodable, so Phase 0's visible fallback is `?`; Phase 1's embedded fonts can render actual glyphs.)* | `resolver.js`, `textLayout.js` | fixes F0/F2: degrade visibly, never crash, never blank |
| 0.7 | Golden snapshot baseline: a `node --test` test that renders Latin fixtures and asserts normalized-byte stability, plus CJK/Arabic fixtures asserting export **succeeds** (`?` fallback allowed, no 500) for text, charts, and the PNG image path | `backend/test/multilingual-baseline.test.js` + `backend/test/fixtures/multilingualFixtures.js` | CI tripwire for every later phase; also fix `package.json` `"test"` to `node --test test/` since it is currently a stub |

*Phase 0 acceptance:* all existing tests pass; Latin exports byte-identical
(verified against a pre-change baseline); CJK/Arabic exports return a PDF
with visible `?` placeholders instead of blank text, and charts no longer 500.

### Phase 1 — Embedded Unicode fonts: glyphs appear (medium)

Goal: CJK, Cyrillic, Greek, Hebrew export correctly. Arabic glyphs appear but
are unshaped/LTR (explicitly not done until Phase 2).

| # | Task | Where | Definition |
|---|---|---|---|
| 1.1 | Add fonts to `backend/fonts/` + `LICENSES.md` (Noto set from §2 — SC-only CJK, see note there) | new dir | assets only |
| 1.2 | `detectScript(text): 'latin' \| 'arabic' \| 'hebrew' \| 'cjk' \| 'cyrillic-greek' \| 'other'` — pure function over Unicode ranges | `textLayout.js` | small, table-driven |
| 1.3 | `FontRegistry`: extend `createFontContext` with `getForRun(script, { bold, italic })` — Latin-1 → StandardFonts exactly as today; other scripts → lazy `fs.readFile` + `embedFont(bytes, { subset: true })`, cached per document | `fontLoader.js` | one map, one cache, no classes beyond what exists |
| 1.4 | `segmentRuns(text): Array<{ text, script }>` — split mixed-script strings so each run gets its own font (Arabic + Latin + digits in one element is the common case) | `textLayout.js` | pure function |
| 1.5 | Wire per-run font selection into both draw paths; measurement uses the same font object that draws (never measure with one font and draw with another, or wrapping drifts) | both renderers | fixes wrapping/height for non-Latin |
| 1.6 | Extend golden tests: CJK fixture now asserts real glyphs (text extraction contains the input), Latin fixtures still byte-identical | `backend/test/` | |
| 1.7 | **Make sanitization font-aware** (discovered in Phase 0): `toWinAnsiSafe` currently runs at *resolve* time (`replacePlaceholders`/`resolveCellValue`), which deletes/substitutes Unicode before the renderer can route it to an embedded font. Move the sanitize step to *layout* time and apply it only to runs that will draw with StandardFonts; embedded-font runs receive the original string. Without this task, Phase 1 fonts are unreachable for all text/table content | `utils/resolver.js`, `textLayout.js` | the resolver keeps exporting `toWinAnsiSafe`; it just stops being called unconditionally |

*Phase 1 acceptance:* Chinese invoice template exports readable PDF and PNG;
Latin snapshots unchanged; PDF size for a subsetted CJK doc stays under ~1 MB.

*Phase 1 result (2026-07-10):* accepted. Verified by golden tests + visual
rasterization: CJK text/tables/charts render real glyphs; a pure-Latin
document embeds nothing; the CJK/Arabic fixture PDF is 73 KB. Two findings
recorded for Phase 2:
1. **Arabic joining already works.** pdf-lib's custom-font embedder encodes
   text through fontkit's OpenType shaping engine, so Naskh contextual forms
   (and within-run RTL) come out correct without our own shaper. What is
   still wrong: **bidi across runs** — mixed Arabic/Latin/digit lines and
   Arabic-Indic digit sequences render in logical (not visual) order, and
   RTL paragraph wrap order is unverified. Phase 2's engine spike (task 2.1)
   should therefore evaluate `bidi-js` reordering alone before adding any
   reshaper — option A may reduce to just bidi.
2. Filenames now carry raw Unicode (zip entries are UTF-8); the pre-existing
   `sanitizeFileName` strips filesystem-illegal chars. ZPL sanitizes at its
   own resolve layer (not Unicode-capable).

### Phase 2 — Arabic shaping + bidi: Arabic works (large, the architectural call)

Goal: Arabic/Persian/Urdu/Hebrew render with correct joining and direction.

**Engine decision (make the spike before committing):**

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. JS shaping (recommended)** | `bidi-js` for reordering + an Arabic reshaper; feed shaped codepoints to pdf-lib | stays in current renderer, no new runtime | weak for Indic; per-script work |
| B. HarfBuzz WASM | `harfbuzzjs` shapes; draw positioned glyphs | correct for all complex scripts | glyph-level drawing rework |
| C. HTML→PDF (Chromium) | headless browser renders | matches editor 1:1 | replaces the whole renderer; heavy infra |

Recommendation: **A** for Arabic-first launch, with the shaper isolated behind
`shapeRun()` so B can replace it later without touching renderers.

**Spike verdict (2026-07-10, `_spike/bidi/`):** fontkit (which pdf-lib uses
to encode embedded fonts) already performs contextual joining
(`.init/.medi/.fina` glyph forms verified) AND reverses RTL runs to visual
order internally. Its one defect: it blindly reverses a whole run, including
digit sequences (`١٢٣` lays out as `٣٢١`). bidi-js correctly assigns such
sequences a higher embedding level. **Engine choice: no reshaper at all** —
bidi-js splits each line into level runs and orders them visually; fontkit
keeps intra-run shaping/reversal. Tasks below are amended to this reality
(original 2.2 `shapeRun` would be dead code — not built, rule i).

| # | Task | Where | Definition |
|---|---|---|---|
| 2.1 | Spike: fontkit RTL behavior + bidi-js evaluation | `_spike/bidi/` | **DONE** — verdict above |
| 2.2 | `visualSegments(text): Array<{ text, script }>` — bidi-js embedding levels → level runs → visual order (L2 via reorder segments); odd-level (RTL) runs handed to fontkit in logical order (it shapes+reverses), even-level runs in RTL scripts (Arabic-Indic digits) pre-reversed to compensate fontkit's blind flip | `textLayout.js` | the engine seam: swapping to HarfBuzz later replaces this function's internals |
| 2.3 | Base direction per line: `'auto'` = first strong directional char (bidi-js P2/P3 default) | `textLayout.js` | matches the planned `direction: 'auto'` model semantics |
| 2.4 | `drawMixed` draws `visualSegments` order when the line contains any RTL char; otherwise the existing logical-order path runs unchanged (Latin byte-identity) | `textLayout.js` | widths are order-independent, so `mixedWidth` stays as is |
| 2.5 | RTL-aware wrapping: wrap on the logical string (existing `wrapText`), each wrapped line laid out visually at draw time | already holds once 2.4 lands | line *content* correct; direction-aware alignment defaults are Phase 3 scope |
| 2.6 | Golden tests: digit-order unit tests on `visualSegments`; Arabic fixture export + rasterization; Latin snapshots still byte-identical | `backend/test/` | |

*Phase 2 acceptance:* an Arabic invoice (Arabic labels, Latin digits, mixed
lines) exports correctly in PDF and PNG; this is the ZATCA-unblocking milestone.

*Phase 2 result (2026-07-10):* accepted. `visualSegments()` (textLayout.js)
computes UAX#9 embedding levels per line via bidi-js, applies L2 reordering,
and hands each run to pdf-lib in the form fontkit needs: RTL runs in logical
order (fontkit shapes and reverses), even-level runs in RTL script blocks
(Arabic-Indic digits) pre-reversed to compensate fontkit's blind flip.
`drawMixed` engages this only when a line contains RTL characters — LTR
lines keep the Phase 1 path, Latin lines the Phase 0 path (byte-identical,
golden-tested). Verified: digits render ١٢٣٤ (previously ٤٣٢١), paragraph
lines read from the right with embedded Latin tokens placed per UAX#9,
CJK output unchanged. New dependency: `bidi-js` (~10 KB, zero deps).
Known limits (unchanged scope): direction-aware alignment/table order is
Phase 3; Indic/Thai shaping still requires the HarfBuzz upgrade path.

### Phase 3 — RTL layout intent (medium)

Goal: direction is first-class in the template model, and layout (not just
text) flips correctly.

| # | Task | Where | Definition |
|---|---|---|---|
| 3.1 | Add `direction?: 'ltr' \| 'rtl' \| 'auto'` and `lang?: string` to `TemplateMeta` and text-bearing element styles; defaults preserve old behavior (`'auto'` derives from first strong-directional char) — no migration needed | `src/types/canvas.ts` | additive, optional fields only |
| 3.2 | Honor direction in the renderer: alignment defaults, table column order, list markers flip for RTL | both renderers | export parity with what the DOM preview already does |
| 3.3 | Direction toggle in the editor properties panel | `PropertiesPanel.tsx` area | small UI |

### Phase 4 — Editor & data polish (small)

| # | Task | Where | Definition |
|---|---|---|---|
| 4.1 | CSV encoding hardening: detect/transcode non-UTF-8 CSV (`chardet` + `iconv-lite`) in the CSV branch only; **default stays UTF-8, transcode only on high-confidence detection**, never downgrade a valid UTF-8 read | `backend/parsers/sheetParser.js:317` area | fixes the Stage 2 gap |
| 4.2 | `FontFamilyOptions.tsx`: add language-appropriate families mapped to the embedded backend fonts; auto-suggest when RTL/CJK text detected | editor properties | UI only |

---

## 4. Backward Compatibility — the central guardrail

**Nothing in this roadmap may change how today's Latin-1 documents export.**

- Latin-1 runs stay on StandardFonts: same font object, same glyph widths,
  same wrapping, byte-for-byte identical output. The new path is reachable
  only by text that fails today.
- Lazy embedding: documents without non-Latin-1 text embed nothing.
- Fallbacks only ever improve behavior: silent-blank becomes tofu, 500
  becomes a rendered page. A previously-working export must never start
  throwing.
- New model fields (`direction`, `lang`) are optional with old-behavior
  defaults; existing saved templates load and render identically.
- Golden snapshot tests (task 0.7) run in every phase; any Latin diff is a
  regression, full stop.

---

## 5. Future Caveats (rule b)

1. **PDF size:** never embed full CJK fonts; always `subset: true`. A full
   Noto Sans SC is ~10 MB; subsets are tens of KB.
2. **Mixed-script runs** are the norm in the target market (Arabic labels +
   Latin SKUs + digits). Everything is per-run, never per-element.
3. **Measurement drift:** widths must be measured on the shaped text with the
   same font that draws it. This is the invariant `layoutLine` exists to hold.
4. **ZPL is out of scope** (§8). Arabic on label printers needs `^A@` font
   downloads or bitmap rendering; if Saudi label demand materializes, that is
   its own architecture doc.
5. **Indic/Thai/Khmer need real shaping** (option B). Option A ships Arabic
   without blocking that upgrade, but do not claim Hindi support after
   Phase 2; glyphs will appear (Phase 1) but reordering will be wrong.
6. **pdf-to-img rasterization** (PNG/JPEG) inherits everything for free, but
   verify Phase 1/2 fixtures through the image path too; pdfjs uses its own
   font stack for rasterizing embedded fonts.
7. **Bulk memory:** embedded fonts add per-document cost in bulk export
   (fresh `PDFDocument` per row). Subsetting keeps this small, but the 300-DPI
   bulk image path on Lightsail should be re-checked after Phase 1.
8. **`backend/package.json` "test" script is a stub** (`exit 1`) even though
   `backend/test/` has a real `node --test` suite. Task 0.7 fixes this so the
   workflow rule "run tests after changes" actually works.

---

## 6. File-Level Change Map

| Area | File | Change |
|---|---|---|
| Fonts | `backend/renderer/fontLoader.js` | **Fix + wire in** (currently dead): `createFontContext`, `isLatin1`, script-keyed lazy subset embedding |
| Fonts | `backend/fonts/` *(new)* | Noto fonts + `LICENSES.md` |
| Layout | `backend/renderer/textLayout.js` *(new)* | `safeWidth`, `drawTextSafe`, `detectScript`, `segmentRuns`, `shapeRun`, `reorderBidi`, `layoutLine` |
| Render | `backend/renderer/pdfLibRenderer.js` | `embedFonts` → `createFontContext`; `wrapText`/`drawTextAt` route through textLayout; guards fixed at 132-203 |
| Render | `backend/renderer/elementDrawers.js` | chart text (440-443, 491-514) routes through textLayout; dead `drawText`/`drawTable` untouched |
| Resolver | `backend/utils/resolver.js` | P0: `toWinAnsiSafe` degrades to `?` not `''`; P1 (task 1.7): sanitize moves to layout time, font-aware |
| Data | `backend/parsers/sheetParser.js` | CSV encoding detection (Phase 4 only) |
| Model | `src/types/canvas.ts` | optional `direction`/`lang` (Phase 3 only) |
| Editor | `properties/FontFamilyOptions.tsx`, `PropertiesPanel.tsx` | Phase 3/4 UI |
| Tests | `backend/test/multilingual-baseline.test.js` *(new)* | golden snapshots + failure-mode fixtures; fix `"test"` script |
| Deps | `backend/package.json` | `@pdf-lib/fontkit` (P0); reshaper + `bidi-js` (P2); `chardet` + `iconv-lite` (P4) |

---

## 7. Test Plan

- Runner: `node --test test/` (existing suite style, hermetic, no network).
- Golden Latin corpus (3 templates) asserted byte-identical every phase.
- Failure-mode fixtures: left/center/right CJK text, CJK chart title, Arabic
  paragraph, mixed Arabic+Latin+digits line; each asserts the phase-correct
  outcome (P0: no 500 + tofu; P1: real glyphs; P2: joined + RTL).
- Image path: one fixture rendered via `rasterizePdfBuffer` per phase.
- Existing e2e tests (`v1-generate.e2e.test.js`, bulk) must stay green.

---

## 8. Out of Scope (rule h)

- ZPL Arabic/CJK (separate emitter, separate doc if needed).
- UI chrome translation / i18n layer (separate module; this doc covers
  document content only).
- Full Indic/SE-Asian shaping (arrives only if/when the shaper is swapped to
  HarfBuzz; not promised by Phase 2).
- Editor font uploads by users (only bundled Noto fonts are in scope).
- ZATCA e-invoice XML/QR compliance logic (Mapdoc renders documents; tax
  compliance fields are template content, not engine features).
