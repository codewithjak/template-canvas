# Multilingual Export Architecture & Roadmap

Support for building templates and rendering exports in **non‑Latin and
right‑to‑left languages** — Spanish, Arabic, Chinese, and the scripts that
follow the same rules (Persian, Urdu, Hebrew, Hindi, Japanese, Korean, …).

> **TL;DR** — The editor and the data layer are already multilingual. The
> **export engine is not.** pdf-lib with the 3 built‑in PDF fonts only encodes
> Latin‑1, so Spanish exports fine, but Chinese/Arabic text is **silently
> dropped** from the PDF (and can hard‑fail in table/chart paths). Fixing it is
> a font‑embedding problem first, then a text‑shaping/bidi problem.

---

## 1. Current State — what works and what doesn't

The pipeline has three stages. They behave very differently for non‑Latin text.

```
   ┌──────────────┐      ┌──────────────┐      ┌──────────────────────────┐
   │  1. EDITOR   │      │ 2. DATA IN   │      │ 3. EXPORT (PDF / PNG)     │
   │  (browser)   │ ───▶ │ CSV/XLSX/API │ ───▶ │ backend pdf-lib renderer  │
   └──────────────┘      └──────────────┘      └──────────────────────────┘
        ✅ ALL                ✅ MOSTLY              ❌ LATIN-1 ONLY
   Unicode + shaping     UTF-8 strings in IR    Helvetica/Times/Courier
   + RTL via the DOM                            (WinAnsi encoding)
```

### Stage 1 — Editor (browser) ✅ works for every language
Text elements render as normal HTML/DOM (`src/components/TemplateCanvas/
TextElement.tsx`, `ParagraphElement.tsx`, table cells). The browser supplies
the fonts, contextual shaping, and bidi reordering for free. Arabic shows
joined glyphs and runs right‑to‑left **on screen**. This is the trap: the
preview looks perfect, so the export gap is invisible until you download.

### Stage 2 — Data import ✅ mostly works
| Source | Status | Notes |
|---|---|---|
| Excel `.xlsx` (`xlsx` lib) | ✅ | Internally UTF‑8; Arabic/Chinese/Spanish values pass through clean |
| API / JSON | ✅ | JSON is UTF‑8 by definition |
| Raw CSV | ⚠️ | **No encoding detection.** A CSV saved as Windows‑1256 (Arabic) or GBK (Chinese) instead of UTF‑8 will mojibake |

Values flow as JS strings through the `CanonicalDocument` IR. The data layer is
**not** the bottleneck.

### Stage 3 — Export ❌ the blocker
The backend renderer (`backend/renderer/`) uses **pdf-lib** with only the three
built‑in PDF font families, resolved in `fontLoader.js`:

```
Helvetica  ·  Times Roman  ·  Courier   →  all WinAnsi (Latin-1) encoded
```

There is no `@pdf-lib/fontkit`, no embedded TTF/OTF, and no `backend/fonts/`
directory. Consequences by language:

| Language | Export result | Root cause |
|---|---|---|
| **Spanish** | ✅ Works | `á é í ñ ¿ ¡` are inside Latin‑1, so the standard fonts encode them |
| **Chinese (CJK)** | ❌ Text vanishes | Glyphs absent from standard fonts. In the main path (`drawTextAt`) `page.drawText` throws *"WinAnsi cannot encode"* and is swallowed by a `catch {}`, so the run is **silently dropped → blank**. Table/chart drawers in `elementDrawers.js` lack that guard and can hard‑fail the export |
| **Arabic / RTL** | ❌ Vanishes — and would be wrong even if present | Same encode failure; **plus** pdf-lib has no text‑layout engine, so even with an Arabic font embedded it draws glyphs *isolated* (no contextual joining) and *left‑to‑right* (no RTL/bidi reordering) |

PNG/JPEG export rasterizes this same vector PDF (`imageRenderer.js` →
`generatePdfBuffer`), so it inherits the identical limitation.

### Two distinct problems, do not conflate them
1. **Glyph availability** — the font has no glyph for the codepoint. Affects
   CJK, Arabic, and any non‑Latin‑1 char. Fixed by **embedding Unicode fonts**.
2. **Text layout (shaping + bidi)** — turning a Unicode string into correctly
   positioned glyphs: Arabic letter joining, RTL/bidi ordering, Indic
   reordering. pdf-lib does **none** of this. CJK and Spanish don't need it;
   Arabic/Persian/Urdu/Hebrew/Hindi do.

This split is why the roadmap is phased: **(1) is a self‑contained win that
unlocks CJK + full‑Unicode Latin; (2) is a larger architectural decision.**

---

## 2. Target Architecture

```
                         ┌───────────────────────────────────────────┐
   resolved text run ──▶ │  textLayout(text, lang/dir)               │   NEW
                         │   1. detect script / direction            │
                         │   2. bidi reorder (bidi-js)               │
                         │   3. shape (Arabic reshaper / HarfBuzz)   │
                         └───────────────────────┬───────────────────┘
                                                 ▼
                         ┌───────────────────────────────────────────┐
   FontCache (rewritten) │  pick font by script → subset-embed via    │
   backend/fonts/*.ttf   │  @pdf-lib/fontkit → measure → drawText     │
                         └───────────────────────────────────────────┘
```

### Font registry (extends `fontLoader.js` — does **not** replace StandardFonts)
> **Guardrail:** the existing Latin path is untouched. The StandardFonts
> (Helvetica/Times/Courier) remain the default and keep rendering existing
> English/Spanish documents **byte‑for‑byte identical to today**. A text run is
> routed to an embedded Unicode font **only when it contains a character outside
> Latin‑1** (i.e. only the runs that fail today). See §6.

A script‑aware registry maps each *non‑Latin‑1* text run to a real Unicode font,
embedded **subsetted** (only used glyphs) so CJK files stay small:

| Script | Bundled font (suggested) | Approx. subset cost |
|---|---|---|
| Latin / Spanish / Cyrillic / Greek | Noto Sans (+ Bold/Italic) | small |
| Arabic / Persian / Urdu | Noto Naskh Arabic | small–medium |
| Hebrew | Noto Sans Hebrew | small |
| Chinese (Simplified) | Noto Sans SC | medium (subset!) |
| Chinese (Traditional) | Noto Sans TC | medium |
| Japanese / Korean | Noto Sans JP / KR | medium |

Fonts live in `backend/fonts/` and are embedded once per `PDFDocument` via
`@pdf-lib/fontkit`, keeping the existing `FontCache` shape (`cache.get(family,
bold)`). The cache gains a `(script, weight, style)` key **alongside** the
current StandardFonts entries — embedded fonts are loaded lazily, so a document
with no non‑Latin‑1 text never embeds anything and pays zero extra cost.

### Direction / language as first‑class template data
A `direction` (`'ltr' | 'rtl' | 'auto'`) and optional `lang` field at the
template and/or element level so alignment, text anchoring, table column order,
and list bullets flip correctly for RTL. `'auto'` derives direction from the
first strong‑directional character of the resolved text.

---

## 3. Roadmap (phased)

### Phase 0 — Foundations (small)
- Add `@pdf-lib/fontkit` dependency; `registerFontkit(pdfDoc)` in
  `generatePdfBuffer`.
- Create `backend/fonts/` with an initial Latin Unicode font (Noto Sans) +
  bold/italic; add a `LICENSES` note (Noto = SIL OFL).
- **CSV encoding hardening** (Stage 2 gap): detect/transcode non‑UTF‑8 CSV in
  `backend/parsers/sheetParser.js` (e.g. `chardet` + `iconv-lite`). **Default to
  UTF‑8 and only transcode on high‑confidence detection** — never downgrade a
  valid UTF‑8 read, so existing imports are unaffected.
- *Outcome:* infra in place; full‑Unicode Latin (accents, Cyrillic, Greek)
  exports correctly. **No change to existing exports** — StandardFonts still
  default.

### Phase 1 — Embedded fonts → **Chinese works** (medium)
- Extend `fontLoader.js` with a script‑aware `FontRegistry` **layered on top of**
  the existing StandardFonts map: detect each text run's script; **Latin‑1 runs
  keep using StandardFonts exactly as today**, non‑Latin‑1 runs select the
  matching embedded font, subset‑embed via fontkit, cache per document.
- Add Noto Sans SC/TC/JP/KR to `backend/fonts/`.
- Swap the silent `catch {}` in `drawTextAt` for a **tofu/▯ fallback** (degrade
  visibly, never crash) and harden the table/chart drawers in
  `elementDrawers.js` the same way. Behavior only ever improves on the current
  silent drop — it must not turn a previously‑working export into a throw.
- *Outcome:* **CJK, Cyrillic, Greek, Hebrew (glyphs only) export.** Arabic
  glyphs now appear but are still unshaped/LTR — explicitly *not done yet*.
  Existing Latin/Spanish exports are **unchanged** (same font, same metrics).

### Phase 2 — Shaping + bidi → **Arabic works** (large; architectural call)
Insert a `textLayout()` step before measurement/draw. **Two viable engines:**

| Option | How | Pros | Cons |
|---|---|---|---|
| **A. JS shaping** | `bidi-js` (reorder) + an Arabic reshaper, feed shaped glyphs to pdf-lib | stays in current pdf-lib renderer; no new runtime | reshapers cover Arabic/Hebrew well, weak for Indic; manual per‑script work |
| **B. HarfBuzz** | `harfbuzzjs` (WASM) for real shaping; pdf-lib draws positioned glyphs | correct for *all* complex scripts | heavier integration; glyph‑level drawing rework |
| **C. HTML→PDF** | Render via headless Chromium (Puppeteer/Playwright) | browser already shapes everything perfectly (matches editor 1:1) | new heavy runtime, replaces the renderer, big perf/infra change |

Recommendation: **A** for an Arabic‑first launch (covers Arabic/Persian/Urdu/
Hebrew, the highest‑demand RTL set) with the layer designed so the shaper is
swappable for **B (HarfBuzz)** when Indic/SE‑Asian scripts are needed. Keep
**C** on the table only if export must become pixel‑identical to the editor.

### Phase 3 — RTL layout intent (medium)
- Add `direction`/`lang` to the template + element model
  (`src/types/canvas.ts`) and surface a direction toggle in the editor.
- Honor direction in the renderer: alignment defaults, table column order, list
  markers, and text anchoring flip for RTL.
- Editor preview already does this via the DOM; goal is **export parity**.

### Phase 4 — Editor & UX polish (small)
- `src/components/TemplateCanvas/properties/FontFamilyOptions.tsx` is Latin‑only
  today — add language‑appropriate families mapped to the embedded backend
  fonts, and auto‑suggest a font when RTL/CJK text is detected.
- Wire into the shared **i18n layer** (see §5) so font/direction defaults track
  the chosen template locale.

---

## 4. File-Level Change Map

| Area | File | Change |
|---|---|---|
| Fonts | `backend/renderer/fontLoader.js` | **Extend** (not replace) StandardFonts map with a script‑aware `FontRegistry` + fontkit subset‑embedding; Latin‑1 runs stay on StandardFonts |
| Fonts | `backend/fonts/` *(new)* | Bundled Noto fonts + license note |
| Render | `backend/renderer/pdfLibRenderer.js` | `registerFontkit`; insert `textLayout()`; swap silent text‑drop `catch {}` for tofu fallback |
| Render | `backend/renderer/elementDrawers.js` | Guard table/chart `drawText`/`widthOfTextAtSize` against missing glyphs |
| Layout | `backend/renderer/textLayout.js` *(new)* | script detect → bidi → shape |
| Data | `backend/parsers/sheetParser.js` | CSV encoding detection/transcode |
| Model | `src/types/canvas.ts` | `direction` / `lang` on template + element |
| Editor | `.../properties/FontFamilyOptions.tsx` | Multilingual font families + RTL/CJK auto‑suggest |
| Deps | `backend/package.json` | `@pdf-lib/fontkit`, `bidi-js`, reshaper/`harfbuzzjs`, `chardet`, `iconv-lite` |

---

## 5. Relationship to the i18n / notifications work

This roadmap and the **customized-alert / notifications module** share the same
foundation: a translation layer (`t(key, vars)`, locale catalogs, `setLocale`).
- *That module* uses i18n for **UI chrome** (toasts, dialogs, buttons).
- *This roadmap* uses it for **document content** (font/direction defaults per
  locale, language‑aware editor affordances).

Build the i18n layer once; both consume it. The notifications module is the
natural first consumer because it is self‑contained and low‑risk.

---

## 6. Backward Compatibility — the central guardrail

**Nothing in this roadmap may change how today's English/Spanish documents
export.** The whole design is *additive and opt‑in*; the existing Latin path is
the default and stays exactly as it is.

- **Latin‑1 stays on StandardFonts.** A text run is re‑routed to an embedded
  Unicode font **only when it contains a codepoint outside Latin‑1** — i.e. only
  the runs that are broken today. Pure English/Spanish runs never touch the new
  code, so their font, glyph widths, wrapping, and layout are **byte‑for‑byte
  unchanged**. (This is what avoids the metrics/reflow regression that a global
  font swap would cause.)
- **Lazy embedding = zero cost when unused.** A document with no non‑Latin‑1
  text embeds no fonts and adds no bytes or render time.
- **Fallback only ever improves behavior.** The silent `catch {}` becomes a
  visible tofu/▯ glyph. It must never convert a previously‑rendering export into
  a throw — degrade, don't crash.
- **CSV stays UTF‑8 by default.** Encoding detection only transcodes on high
  confidence; a valid UTF‑8 read is never downgraded.
- **Feature‑flagged rollout + golden snapshots.** Gate the path behind a flag,
  and snapshot‑test a corpus of existing templates before/after each phase so any
  unintended reflow is caught in CI, not in production.
- **New model fields default to the old behavior.** `direction` defaults to
  `'ltr'`/`'auto'` and `lang` is optional, so existing saved templates load and
  render identically without migration.

> Net: the new path is reachable **only** by text that currently fails. If a
> document exports correctly today, every phase below leaves it untouched.

---

## 7. Risks & Notes
- **File size:** never embed full CJK fonts — always subset, or PDFs balloon to
  multi‑MB. fontkit subsetting handles this.
- **Mixed‑script runs:** a single text element can contain Arabic + Latin +
  digits. `textLayout()` must segment by script and pick a font per run, not per
  element.
- **Measurement consistency:** wrap/center/right alignment use
  `widthOfTextAtSize`; widths must be measured on the **shaped** glyphs of the
  **same font that draws them**, not the raw string or a different font, or
  wrapping drifts. (This is also why Latin‑1 must keep measuring on StandardFonts
  — see §6.)
- **Image export is free‑riding:** since PNG/JPEG rasterize the PDF, every phase
  benefits images automatically — no separate work.
- **Licensing:** Noto fonts are SIL OFL (redistribution OK); record it.

---

## 8. Suggested sequencing
1. **Phase 0 + 1** — biggest ratio of value to effort: unlocks Chinese + full
   Unicode Latin and fixes the silent‑drop bug. Self‑contained, low risk.
2. **i18n layer + notifications module** — in parallel; independent of the
   renderer.
3. **Phase 2 (Arabic shaping)** — the real architectural decision; do the
   engine spike (Option A vs B) before committing.
4. **Phase 3 + 4** — RTL layout intent and editor polish once shaping lands.
