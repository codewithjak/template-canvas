# Phase 4: Drag and Drop

## Overview
This phase implements drag-and-drop functionality, allowing users to move text elements around the canvas by dragging them.

## Implementation Details

### Dependencies Installed
- `@dnd-kit/core` - Core drag and drop functionality
- `@dnd-kit/utilities` - Utility functions for drag and drop

### Components Updated
1. **TemplateCanvas Component**
   - Wrapped with `DndContext` from `@dnd-kit/core`
   - Added `handleDragEnd` function to update element positions
   - Configured `PointerSensor` with activation constraint (8px distance) to prevent accidental drags

2. **TextElement Component**
   - Integrated `useDraggable` hook from `@dnd-kit/core`
   - Added drag handlers and attributes
   - Disabled dragging when element is in edit mode
   - Added visual feedback during dragging (opacity change)

### Features
- ✅ Drag elements by clicking and holding
- ✅ Visual feedback during drag (opacity: 0.5)
- ✅ Position updates on drag end
- ✅ Drag disabled during text editing
- ✅ Activation distance (8px) prevents accidental drags
- ✅ Cursor changes to "move" when hovering over draggable elements
- ✅ Cursor changes to "grabbing" during drag

### User Interaction
1. **Drag Element**: Click and hold on a text element, then move mouse to drag
2. **Edit Element**: Double-click to edit (disables dragging)
3. **Drop Element**: Release mouse button to drop at new position
4. **Cancel Drag**: Move mouse back to original position before releasing

### Technical Implementation

#### Drag Context Setup
```typescript
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
  {/* Canvas content */}
</DndContext>
```

#### Pointer Sensor Configuration
- Activation distance: 8px (prevents accidental drags on clicks)
- Uses `PointerSensor` for mouse and touch support

#### Position Update
On drag end, calculates new position:
```typescript
position: {
  x: element.position.x + delta.x,
  y: element.position.y + delta.y,
}
```

#### Drag State Management
- `isDragging`: Boolean state from `useDraggable` hook
- Transform applied during drag for smooth movement
- Position updated only on drag end (not during drag)

### Visual Feedback
- **Hover**: Blue dashed outline appears
- **Dragging**: Element opacity reduced to 50%
- **Cursor**: Changes from "move" to "grabbing" during drag
- **Edit Mode**: Dragging disabled, cursor changes to "text" in input

### Edge Cases Handled
- Dragging disabled when editing text (prevents conflicts)
- Input field stops event propagation (prevents drag when clicking input)
- Activation distance prevents accidental drags on double-click
- Transform applied during drag for smooth visual feedback

## Files Modified
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added DndContext and drag handlers
- `src/components/TemplateCanvas/TextElement.tsx` - Added useDraggable hook
- `src/components/TemplateCanvas/TextElement.css` - Updated cursor and drag styles
- `package.json` - Added @dnd-kit/core and @dnd-kit/utilities

## Next Phase
Phase 5: Selection and Properties Panel - Select elements and edit their properties.

