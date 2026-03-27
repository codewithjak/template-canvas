# Branch Change Notes: `TC-016`

This file documents the key changes implemented in branch `TC-016` for the Template Canvas editor.

## Scope

Primary work focused on table editing/formatting UX and PDF export quality improvements.

## Implemented Changes

### 1) Table selection and merge behavior
- Added range-based table cell selection (single cell, drag-select, shift-select).
- Added merge/unmerge support using real HTML table span behavior (`colSpan`/`rowSpan`).
- Added merge persistence in element state (`merges`) and ensured updates are saved.

### 2) Table dragging UX
- Reworked table drag interaction to use a dedicated top-edge drag handle.
- Prevented drag/select conflicts between table movement and cell editing/selection.

### 3) Table border and export display cleanup
- Updated table border rendering for clearer row/column visibility.
- Added export-specific CSS behavior to suppress editor-only artifacts (selection highlights, drag handles, outlines).

### 4) PDF export artifact fixes
- Updated export flow to:
  - blur focused element before capture,
  - toggle `export-mode` on canvas during capture,
  - restore UI state reliably in a `finally` block.
- Removed page outline/shadow from export-mode rendering to avoid top/bottom page lines in PDF.

### 5) Per-cell/per-range table formatting
- Introduced table `cellStyles` map for granular styling by cell key (`row:col`).
- Added selection scope mode for table operations:
  - `cell`
  - `row`
  - `column`
- Applied formatting to selected scope/range rather than whole table.

### 6) Table-specific property controls
- Added/extended table format controls in Properties panel:
  - Merge / Unmerge
  - Selection Scope (Cell/Row/Column)
  - Bold
  - Italic
  - Underline
  - Background color
  - Text align (left/center/right)
  - Clear formatting (selected range only)

## Files Updated

- `src/components/TemplateCanvas/TemplateCanvas.tsx`
- `src/components/TemplateCanvas/TemplateCanvas.css`
- `src/components/TemplateCanvas/TableElement.tsx`
- `src/components/TemplateCanvas/TableElement.css`
- `src/components/TemplateCanvas/PropertiesPanel.tsx`
- `src/components/TemplateCanvas/PropertiesPanel.css`
- `src/components/TemplateCanvas/TextElement.tsx`

## Notes

- Existing TypeScript issues in `src/services/*` may still block full `npm run build` in this branch, but they are unrelated to the table/PDF UI changes listed above.
