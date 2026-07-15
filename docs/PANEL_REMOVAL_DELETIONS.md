# What was deleted when the Properties panel was removed

Date: 2026-07-14. Commits: **TC-0198** (panel), **TC-0199** (orphans),
**TC-0200** (fixes two things TC-0198/0199 got wrong).

This is the accountability record for eleven deleted files. For each one: what it
controlled, and where every one of those controls lives **now**. Nothing here is
from memory — each row was extracted from the deleted file in git and matched
against the current bar code.

**Recover any file with:** `git show 7a9d7d9:<path>`

---

## 1. Why they went

The floating format bars are the editing model. `ElementFormatBar`'s own header said
so, and **TC-0132** is literally *"properties panel changed to format bar"*. The
panel was legacy, mid-removal, and gated at the call site to just three cases:

```
selectedElement.type === 'chart' || 'table' || (text && pageNumber.enabled)
```

**Everything the panel contained for any other element type was already unreachable
dead code** — selecting an image, box, line, barcode, radio, checkbox or date never
opened the panel.

---

## 2. The deletions, and where each control lives now

### 2.1 `PropertiesPanel.tsx` — the container
Gone. Its three live cases now open from the **⋯** on the floating bar
(`FormatBarMore`): table, chart, page-number text.

### 2.2 Fully covered — nothing lost

| Deleted file | Its controls | Where they are now |
|---|---|---|
| `BarcodeProperties` | Data Field · Custom Value · Format · Show Text · Width · Height | `ElementFormatBar.renderBarcode` — all six |
| `BoxProperties` | Width · Height · Border Width · Border Color · Border Style · Background · Border Radius · Opacity | `renderBox` — W · H · Thickness · Border · Style · Fill · Radius · Opacity |
| `DateProperties` | Include Time · Date Value · Time Value · Date Format | `renderDate` — all four |
| `ImageProperties` | Source · Width · Height · Object Fit · Opacity | `renderImage` — all five |
| `LineProperties` | Direction · Length · Thickness · Color · Style · Opacity | `renderLine` — all six |
| `RadioCheckboxProperties` | Orientation · Relative Offset · Number of Checkboxes · Number of Options | `renderRadioCheckbox` — Orientation · Offset · Count · Options |
| `TextContentProperties` | Content (and Watermark Text) | **Inline editing on the canvas.** `TextElement.handleDoubleClick` opens an editor; a watermark is a `type: 'text'` element with `role: 'watermark'` (`elementFactories.ts:67`), so it renders through `TextElement` and edits the same way. |

All seven were **also unreachable before deletion** (the gate above never allowed
their element types), so removing them changed nothing a user could see.

### 2.3 `TypographyProperties` — covered, but one control had to be rescued

| Its control | Where it is now |
|---|---|
| Font Size | `TextFormatBar` — size stepper |
| Font Weight | `TextFormatBar` — Bold toggle (`fontWeight: 'bold' \| 'normal'`) |
| Font Family | `TextFormatBar` — family select |
| Color | `TextFormatBar` — colour swatch |
| Width · Opacity · Rotation | `TextFormatBar` — number fields |
| Text Align | `TextFormatBar` — align buttons |
| **Direction (LTR/RTL/Auto)** | **WAS LOST. Restored in TC-0200** → `TextFormatBar`, "Dir" select. |

**CORRECTED (TC-0211). The Direction control is gone again, and that is right.**

TC-0200 put an LTR/RTL/Auto select on the text bar, reasoning that deleting
`TypographyProperties` had removed "the only text-direction control in the product"
and that RTL was therefore "unsettable". **That reasoning was wrong on the part that
mattered.**

The panel rendered `TypographyProperties` only for **page-number text**, so the real
prior behaviour was **no direction control anywhere** — and the editor worked
correctly, because it never needed one:

- `TextElement` and `ParagraphElement` render `dir={style.direction ?? 'auto'}`, and
  **`dir="auto"` follows the text's first strong character**. Arabic and other RTL
  content flips itself. That is why RTL "was working correctly before".
- A template that genuinely wants an explicit direction sets `style.direction` in its
  JSON — several Arabic built-ins do — and that is still honoured. The model keeps the
  field.

So the control was not a restored capability; it was a knob for something the browser
already gets right, and it invited users to break correct behaviour. Removed on the
product owner's call. **The model and the rendering are untouched.**

### 2.4 `PositionProperties` — deleted in error, restored

Numeric **X / Y**. The panel rendered this for *every* element it displayed, so
**chart, layout table and page-number text all had X/Y inputs**.

TC-0198 re-housed the "main" components into the ⋯ popover and **missed Position**.
TC-0199 then deleted it as dead — which it was, but only because TC-0198 had just
orphaned it. That is a self-inflicted circle, and it is exactly the failure the "no
functionality change" rule exists to prevent.

**Restored in TC-0200** into all three popovers (table, chart, page-number text).
Other element types never had numeric X/Y — the gate hid it from them — so nothing
was added.

---

## 3. `DateTypography` — the gap, now CLOSED (TC-0201)

**Font Size · Font Weight · Font Family · Color**, for a **date** element. These had
**no home on the bar**: `renderDate` carried only value/time/format.

This was **not a regression from the deletions** — date was never in the panel's gate,
so the panel never opened for a date element and these controls have been unreachable
for as long as that gate has existed. The model always supported them:
`DateElementType.style` is exactly `{fontSize, fontWeight, color, fontFamily}` and
`DateElement` renders with all four. They were settable by a template's JSON and
invisible in the UI.

**Closed in TC-0201**: `renderDate` now carries font family, size, bold and colour, in
the bar's own idioms (`Stepper`, `ToggleBtn`, `Swatch`) and reusing the **shared**
`FontFamilyOptions` list rather than a second copy of it.

Every control from all eleven deleted files now has a home. Nothing is outstanding.

---

## 4. How this was checked

Not by reading the diff. For each deleted file, its controls were extracted from
`git show 7a9d7d9:<path>` and matched one-by-one against the current
`ElementFormatBar` / `TextFormatBar` source. That is how the Position and Direction
losses surfaced — both would have passed a diff review, and both passed all 67 unit
tests, because no test covers "can a user still reach this control".

**Still unverified in a browser:** the ⋯ popover has not been seen rendering. The
table case is the one to look at — `LayoutTableProperties` was built for a 300px
panel and now sits in a 300px popover.
