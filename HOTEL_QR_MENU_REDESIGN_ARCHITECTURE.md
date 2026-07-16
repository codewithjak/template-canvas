# Hotel QR Menu — Photo-Row Redesign Architecture

Owner: TC-0216 follow-up
Status: Phase 1 in progress
Scope: the built-in template `builtin-hotel-qr-menu` only
Reference: `/home/user/Downloads/menu2.jpg` (alternating photo + item-list bands)

---

## 0. Problem statement

The current Hotel QR Menu spills onto a **second PDF page**. The user asked for
a single-page menu shaped like the reference image (photo bands with item lists)
with the **QR code moved to a bottom footer strip**.

---

## a. Current behaviour vs. new architecture

### Current behaviour (before)
- File: `src/templates/builtins/hotel-qr-menu.template.json`.
- One Letter page (816 x 1056). Every element is **absolutely positioned** and
  hand-sized to the exact sample data.
- Menu items live in **three data-bound tables** (`starters` 4 rows, `mains` 5
  rows, `desserts` 3 rows), each with a fixed slot height (136 / 170 / 102) and a
  fixed row height of 34px.
- The footer band is nailed to `y=912`.
- **Root cause of the overflow:** a data-bound table grows with its collection,
  but its neighbours do not reflow. As soon as a collection has more rows than
  its slot was measured for, the table extends past the footer and beyond
  `y=1056`, pushing the surplus onto a second PDF page. It is not an engine bug;
  the layout was measured to the sample row counts, so any richer menu breaks it.

### New architecture (after)
- Same single Letter page, same element schema — **no TypeScript/engine change**.
  The redesign is entirely in the two JSON assets.
- Menu items become **fixed slots**, not a growable table: four photo **bands**,
  each carrying **one dish photo + two dish entries** (name, price, dotted
  leader, description) = **8 dishes total**, matching the reference.
- Because every slot is a fixed, absolutely-positioned element, the layout is
  **single-page by construction and can never overflow.** This is the actual fix
  for the reported bug: removing the growable table removes the only element
  that could push past the page boundary.
- The **QR moves to a bottom footer strip** (rust band) with a "Scan to order"
  caption, replacing the header QR card.
- Photos bind via `{{band_N_image}}` field tokens (same mechanism the Realtor
  Brochure uses for `{{hero_image}}`); text binds via `{{item_N_*}}` tokens; the
  QR binds `{{order_url}}` exactly as before.

### Data-model change
- Old sample data used `collections.starters|mains|desserts`.
- New sample data uses flat `fields`: `venue_name`, `menu_heading`, eight
  `item_N_name|price|desc`, four `band_N_image`, `order_url`, `scan_caption`,
  `hours`, `footer_note`. `collections` becomes `{}`.

---

## b. Future caveats

1. **Fixed capacity.** The layout shows exactly 8 dishes / 4 photos. A longer
   menu will not grow into more rows — this is the deliberate trade for
   never-overflow, and it mirrors the reference, which is itself a fixed 8-item
   design. A future "growable + paginated" variant would be a separate template,
   not an amendment to this one.
2. **Photos ship empty.** Like the Realtor Brochure, `band_N_image` fields are
   empty strings; the editor shows the image placeholder until the user drops a
   dish photo. The built-in gallery preview therefore shows placeholder frames,
   not photographs.
3. **Round photos need a crop.** The schema renders `<img>` rectangular; the
   round look in the reference comes from the editor's crop-to-ellipse
   (`crop.shape = "ellipse"`), which bakes once a real photo is added. v1 ships a
   rounded frame ring around a rectangular placeholder; the user rounds the photo
   after uploading.
4. **Dotted leaders are decorative.** The dotted line between name and price is a
   full-width dotted `line` painted behind the text; the dots show in the gap.
   It is not an auto-measured tab leader.

---

## c. Phases

### Phase 1 — Redesign the built-in (this change)
Rebuild `hotel-qr-menu.template.json` + `hotel-qr-menu.data.json` to the
photo-band layout with a footer QR. No code changes. Registry description updated
to match. Validate with `npm test` + `npm run build`.

### Phase 2 — Visual polish (optional, later)
Round-photo crop presets, decorative background pattern, per-band accent colour.
Only if requested; not in scope now.

---

## d. Layout map (Phase 1 tasks)

Page 816 x 1056 (Letter). Palette: cream `#f4efe3`, rust `#b5471f`, ink `#5b5b52`.

- **Header** (`y 0..150`): `bg-page` cream fill; `hdr-title` = `{{venue_name}}`
  centred rust serif; `pill-box` + `pill-text` = `{{menu_heading}}` rust pill.
- **Bands** (tops `170 / 348 / 526 / 704`, card height 156): each band is one
  small pure block of elements —
  - `bN-card` rounded white capsule,
  - `bN-frame` + `bN-img` (`{{band_N_image}}`) photo, left on bands 1&3, right on 2&4,
  - two dish entries `item_(2N-1)` and `item_(2N)`: name + right-aligned price +
    dotted leader + description.
- **Footer** (`y 900..1056`): `ftr-band` rust strip; `ftr-qr-card` white card;
  `ftr-qr` barcode `{{order_url}}`; `ftr-scan-label` "SCAN TO ORDER";
  `ftr-caption` `{{scan_caption}}`; `ftr-hours` `{{hours}}`; `ftr-note`
  `{{footer_note}}`.

Each element is self-contained (single responsibility, no shared mutable state),
satisfying the low-cognitive-load / SOLID intent for a declarative asset.

---

## e. Amendments log
(Only append here after Phase 1; never rewrite sections above — rule k.)
