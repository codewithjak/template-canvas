# Phase 6: Delete and Resize

## Overview
This phase implements delete functionality and resize handles, allowing users to remove elements and resize them by dragging.

## Implementation Details

### Features Added
1. **Delete Functionality**
   - Delete button in toolbar (appears when element is selected)
   - Keyboard support: Delete or Backspace key
   - Removes selected element from canvas
   - Clears selection after deletion

2. **Resize Handles**
   - Resize handle appears on selected elements (bottom-right corner)
   - Drag handle to resize font size
   - Visual feedback during resize
   - Font size constrained between 8px and 72px

### Components Updated
1. **TemplateCanvas Component**
   - Added `handleDeleteElement` function
   - Added keyboard event listener for Delete/Backspace keys
   - Added `onResize` prop to TextElement
   - Updated Toolbar with delete button

2. **Toolbar Component**
   - Added delete button (only visible when element is selected)
   - Red styling for delete button
   - Tooltip showing keyboard shortcut

3. **TextElement Component**
   - Added resize handle (circular blue dot at bottom-right)
   - Resize logic that updates font size based on drag distance
   - Handle only visible when element is selected and not editing

### Delete Functionality

#### Keyboard Shortcuts
- **Delete key**: Deletes selected element
- **Backspace key**: Deletes selected element
- Only works when not typing in input fields

#### Delete Button
- Appears in toolbar when element is selected
- Red button with "Delete" label
- Tooltip: "Delete selected element (Delete key)"

### Resize Functionality

#### Resize Handle
- Blue circular handle at bottom-right corner of selected elements
- Only visible when element is selected and not in edit mode
- Hover effect: Slightly larger on hover

#### Resize Behavior
- Drag handle up to increase font size
- Drag handle down to decrease font size
- Font size range: 8px to 72px
- Real-time updates during drag
- Scale factor: 1px drag = ~1% font size change

### Technical Implementation

#### Delete Handler
```typescript
const handleDeleteElement = (id: string) => {
  setElements((prevElements) => prevElements.filter((element) => element.id !== id));
  setSelectedElementId((prevId) => (prevId === id ? null : prevId));
};
```

#### Keyboard Event Listener
- Listens for Delete/Backspace keys globally
- Checks if element is selected
- Prevents deletion when typing in input fields
- Uses functional state updates to avoid dependency issues

#### Resize Handler
- Mouse down on resize handle starts resize
- Tracks initial mouse position and font size
- Calculates new font size based on drag distance
- Updates font size in real-time
- Cleans up event listeners on mouse up

### Visual Feedback
- **Delete Button**: Red color (#dc3545), darker on hover
- **Resize Handle**: Blue circle (#007bff) with white border
- **Resize Handle Hover**: Slightly larger (scale 1.2)
- **Resize Handle Shadow**: Subtle shadow for depth

### User Interaction
1. **Delete Element**:
   - Select element → Press Delete/Backspace OR click Delete button
   - Element is removed from canvas

2. **Resize Element**:
   - Select element → Drag resize handle (bottom-right corner)
   - Font size updates in real-time
   - Release to finish resize

### Edge Cases Handled
- Delete button only shows when element is selected
- Keyboard delete disabled when typing in input fields
- Resize handle hidden during text editing
- Resize handle hidden when element not selected
- Font size constrained to valid range (8-72px)
- Selection cleared after deletion
- Proper cleanup of resize event listeners

## Files Modified
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added delete and resize handlers
- `src/components/TemplateCanvas/Toolbar.tsx` - Added delete button
- `src/components/TemplateCanvas/Toolbar.css` - Added delete button styling
- `src/components/TemplateCanvas/TextElement.tsx` - Added resize handle and logic
- `src/components/TemplateCanvas/TextElement.css` - Added resize handle styling

## Next Phase
Phase 7: Tables - Add table elements to the canvas.

