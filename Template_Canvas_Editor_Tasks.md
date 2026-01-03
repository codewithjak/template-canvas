# Template Canvas Editor - Development Tasks

## Overview
This document breaks down the Template Canvas Editor component into manageable development phases.

---

## Phase 1: Basic Canvas Setup

**Goal:** Create a blank canvas that can be rendered on screen.

**Steps:**
1. Create `TemplateCanvas.tsx` component
2. Add a container div with fixed dimensions (e.g., A4 size: 210mm x 297mm)
3. Add basic styling (border, background, padding)
4. Render it in the App

**Result:** A visual canvas area displayed on the screen.

**Estimated Time:** 30 minutes

---

## Phase 2: Add Text Elements

**Goal:** Allow users to add and display text on the canvas.

**Steps:**
1. Create a Toolbar component with "Add Text" button
2. On click, add a text element to the canvas state
3. Render text elements at their positions
4. Add basic styling (font, size, color)

**Result:** Users can add text blocks to the canvas.

**Estimated Time:** 1-2 hours

---

## Phase 3: Placeholder Support

**Goal:** Support `{{variable}}` placeholders in text.

**Steps:**
1. Parse text for `{{...}}` patterns
2. Highlight placeholders visually (different color/background)
3. Allow typing `{{` to insert placeholders
4. Validate placeholder syntax

**Result:** Users can insert and see placeholders in text.

**Estimated Time:** 2-3 hours

---

## Phase 4: Drag and Drop

**Goal:** Move elements around the canvas.

**Steps:**
1. Install drag-and-drop library (`@dnd-kit/core`)
2. Make elements draggable
3. Track position when dropped
4. Update element position in state

**Result:** Users can drag elements to reposition them.

**Estimated Time:** 2-3 hours

---

## Phase 5: Selection and Properties Panel

**Goal:** Select elements and edit their properties.

**Steps:**
1. Click to select an element (highlight selected)
2. Create Properties Panel component
3. Show selected element's properties (text content, font size, color, position)
4. Update properties when changed

**Result:** Users can select and edit element properties.

**Estimated Time:** 3-4 hours

---

## Phase 6: Delete and Resize

**Goal:** Remove elements and resize them.

**Steps:**
1. Add delete button (keyboard Delete key or button)
2. Remove selected element from state
3. Add resize handles to selected elements
4. Update element dimensions when resized

**Result:** Users can delete and resize elements.

**Estimated Time:** 2-3 hours

---

## Phase 7: Tables

**Goal:** Add table elements to the canvas.

**Steps:**
1. Add "Add Table" button in toolbar
2. Create table element type
3. Render table with rows/columns
4. Support placeholders in table cells
5. Edit table data in properties panel

**Result:** Users can add and edit tables.

**Estimated Time:** 4-5 hours

---

## Phase 8: Save/Load Template

**Goal:** Save template as JSON and load it back.

**Steps:**
1. Convert canvas state to JSON format
2. Add "Save Template" button
3. Add "Load Template" button
4. Parse JSON and restore canvas state

**Result:** Users can save and load templates.

**Estimated Time:** 1-2 hours

---

## Recommended Build Order

1. ✅ **Phase 1:** Basic Canvas (simplest, gives visual feedback)
2. ✅ **Phase 2:** Add Text Elements (core functionality)
3. ✅ **Phase 3:** Placeholder Support (needed for MVP)
4. ✅ **Phase 4:** Drag and Drop (improves UX)
5. ✅ **Phase 5:** Selection and Properties (essential for editing)
6. ✅ **Phase 6:** Delete and Resize (polish features)
7. ✅ **Phase 7:** Tables (advanced feature)
8. ✅ **Phase 8:** Save/Load (data persistence)

---

## Technical Requirements

### Dependencies to Install:
- `@dnd-kit/core` - Drag and drop functionality
- `@dnd-kit/sortable` - Sortable lists
- `@dnd-kit/utilities` - Utility functions

### Component Structure:
```
src/components/
  └── TemplateCanvas/
      ├── TemplateCanvas.tsx      (main component)
      ├── Toolbar.tsx             (add elements)
      ├── Canvas.tsx               (editing area)
      ├── PropertiesPanel.tsx      (edit properties)
      └── TemplateCanvas.css
```

### Data Structure Example:
```json
{
  "elements": [
    {
      "type": "text",
      "content": "Invoice for {{customer_name}}",
      "position": { "x": 100, "y": 50 },
      "style": { "fontSize": 24, "fontWeight": "bold" }
    },
    {
      "type": "table",
      "data": "{{items}}",
      "columns": ["name", "qty", "price"]
    }
  ]
}
```

---

## Total Estimated Time: 15-22 hours

---

**Document Created:** January 2026  
**Project:** Data to Docs - PDF Generator MVP

