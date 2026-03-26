# Phase 10 (Branch TC-012): Structural Elements - Line and Box

## Overview
This phase implements structural elements (Line and Box) with a dedicated Structures dropdown menu in the toolbar. These elements provide basic structural components for template design, with full drag-and-drop, resize, and property customization capabilities.

## Implementation Details

### Features Added
1. **Structures Dropdown Menu**
   - Separate toolbar section for structural elements
   - Dropdown menu with "Add Line" and "Add Box" options
   - Clean separation from content elements (Text, Table, Image)
   - Click outside to close functionality

2. **Line Element**
   - Horizontal and vertical line support
   - Resize from start or end handles
   - Customizable length, thickness, color, style, and opacity
   - Line styles: solid, dashed, dotted

3. **Box Element**
   - Empty rectangle/box with customizable borders
   - 8 resize handles (4 corners + 4 edges)
   - Left/top edge handles resize and move position (stretch from opposite side)
   - Full border and background customization
   - Optional border radius for rounded corners

### Components Created
1. **StructuresDropdown Component** (`src/components/TemplateCanvas/StructuresDropdown.tsx`)
   - Dropdown menu for structural elements
   - Click outside to close functionality
   - Clean UI with icons for each structure type

2. **StructuresDropdown Styles** (`src/components/TemplateCanvas/StructuresDropdown.css`)
   - Dropdown menu styling
   - Hover effects
   - Proper z-index management

3. **LineElement Component** (`src/components/TemplateCanvas/LineElement.tsx`)
   - Renders horizontal or vertical lines
   - Resize handles at both ends
   - Drag and drop support
   - Support for solid, dashed, and dotted line styles

4. **LineElement Styles** (`src/components/TemplateCanvas/LineElement.css`)
   - Line element styling
   - Resize handle positioning
   - Selection and hover states

5. **BoxElement Component** (`src/components/TemplateCanvas/BoxElement.tsx`)
   - Renders empty box/rectangle
   - 8 resize handles (corners and edges)
   - Drag and drop support
   - Border and background customization

6. **BoxElement Styles** (`src/components/TemplateCanvas/BoxElement.css`)
   - Box element styling
   - Resize handle positioning for all 8 handles
   - Selection and hover states

### Components Updated
1. **TemplateCanvas Component**
   - Added `LineElementType` interface
   - Added `BoxElementType` interface
   - Added `handleAddLine()` function
   - Added `handleAddBox()` function
   - Updated `CanvasElement` union type
   - Integrated line and box rendering
   - Added position update handler for box elements

2. **Toolbar Component**
   - Added StructuresDropdown component
   - New toolbar section for structures
   - Props for `onAddLine` and `onAddBox` handlers

3. **PropertiesPanel Component**
   - Added line-specific property controls
   - Added box-specific property controls
   - Direction toggle for lines
   - Border controls for boxes
   - Background color picker for boxes
   - Border radius control for boxes

### Line Element Data Structure
```typescript
interface LineElementType {
  id: string;
  type: 'line';
  position: { x: number; y: number };
  style: {
    length: number;        // Line length in pixels
    thickness: number;     // Line thickness (1-20px)
    direction: 'horizontal' | 'vertical';
    color: string;         // Hex color code
    style: 'solid' | 'dashed' | 'dotted';
    opacity?: number;      // 0-100%
  };
}
```

### Box Element Data Structure
```typescript
interface BoxElementType {
  id: string;
  type: 'box';
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    borderWidth: number;      // Border thickness (0-20px)
    borderColor: string;      // Hex color code
    borderStyle: 'solid' | 'dashed' | 'dotted' | 'double';
    backgroundColor: string;  // Hex color code (can be transparent)
    opacity?: number;         // 0-100%
    borderRadius?: number;    // 0-50px for rounded corners
  };
}
```

### Default Elements

#### Line Element
- Default length: 200px
- Default thickness: 2px
- Default direction: horizontal
- Default color: #000000 (black)
- Default style: solid
- Default opacity: 100%

#### Box Element
- Default size: 200x200px
- Default border width: 1px
- Default border color: #000000 (black)
- Default border style: solid
- Default background: transparent
- Default border radius: 0px
- Default opacity: 100%

### User Interaction

#### Adding Structural Elements
1. Click "Structures" button in toolbar
2. Select "Add Line" or "Add Box" from dropdown
3. Element appears on canvas at default position
4. Dropdown closes automatically after selection

#### Editing Line Elements
1. **Resize**: Drag start or end handle to change length
2. **Move**: Drag the line itself to reposition
3. **Properties Panel**:
   - Change direction (horizontal/vertical)
   - Adjust length (20-1000px)
   - Adjust thickness (1-20px)
   - Change color
   - Change style (solid/dashed/dotted)
   - Adjust opacity (0-100%)

#### Editing Box Elements
1. **Resize**:
   - Corner handles: Resize both width and height
   - Right edge: Resize width only
   - Bottom edge: Resize height only
   - Left edge: Resize width and move position (stretches from right)
   - Top edge: Resize height and move position (stretches from bottom)
2. **Move**: Drag the box itself to reposition
3. **Properties Panel**:
   - Adjust width and height (50-1000px)
   - Change border width (0-20px)
   - Change border color
   - Change border style (solid/dashed/dotted/double)
   - Change background color
   - Adjust border radius (0-50px)
   - Adjust opacity (0-100%)

### Resize Behavior

#### Line Element Resize
- **Start Handle**: Resizes length and moves position (stretches from end)
- **End Handle**: Resizes length only (stretches from start)
- Minimum length: 20px
- Maximum length: 1000px

#### Box Element Resize
- **Corner Handles**: Resize both dimensions simultaneously
- **Right/Bottom Edges**: Resize single dimension
- **Left/Top Edges**: Resize dimension and adjust position (stretch from opposite side)
- Minimum size: 50x50px
- Maximum size: 1000x1000px

### Visual Design

#### Structures Dropdown
- Button color: #6c757d (gray) to distinguish from content elements
- Dropdown menu: White background with shadow
- Menu items: Icons + text labels
- Hover effects on menu items

#### Line Element
- Selected state: Blue outline (2px solid #007bff)
- Hover state: Dashed blue outline
- Resize handles: Blue circles at line endpoints
- Visual feedback during resize

#### Box Element
- Selected state: Blue outline (2px solid #007bff)
- Hover state: Dashed blue outline
- Resize handles: Blue circles (corners) and rectangles (edges)
- Visual feedback during resize

### Technical Implementation

#### Structures Dropdown
```typescript
const [isOpen, setIsOpen] = useState(false);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  };
  // Add/remove event listener
}, [isOpen]);
```

#### Line Resize Logic
```typescript
const handleResizeStart = (e: React.MouseEvent, handle: 'start' | 'end') => {
  // Track mouse movement
  // Calculate new length based on handle type
  // Update position if resizing from start
  // Update style with new length
};
```

#### Box Resize Logic
```typescript
const handleResizeStart = (e: React.MouseEvent, type: 'corner' | 'right' | 'bottom' | 'left' | 'top') => {
  // Track mouse movement
  // Calculate new dimensions based on resize type
  // Update position if resizing from left/top
  // Update style with new width/height
};
```

### JSON Template Format
```json
{
  "version": "1.0",
  "elements": [
    {
      "id": "line-1234567890",
      "type": "line",
      "position": { "x": 100, "y": 50 },
      "style": {
        "length": 200,
        "thickness": 2,
        "direction": "horizontal",
        "color": "#000000",
        "style": "solid",
        "opacity": 100
      }
    },
    {
      "id": "box-1234567891",
      "type": "box",
      "position": { "x": 100, "y": 100 },
      "style": {
        "width": 200,
        "height": 200,
        "borderWidth": 1,
        "borderColor": "#000000",
        "borderStyle": "solid",
        "backgroundColor": "transparent",
        "opacity": 100,
        "borderRadius": 0
      }
    }
  ]
}
```

### Edge Cases Handled
- Line resize constraints (min 20px, max 1000px)
- Box resize constraints (min 50px, max 1000px)
- Proper position updates when resizing from left/top edges
- Drag disabled during resize operations
- Click outside to close dropdown menu
- Type-safe property updates in PropertiesPanel
- Visual feedback during all interactions

### Files Created/Modified
- `src/components/TemplateCanvas/StructuresDropdown.tsx` - New dropdown component
- `src/components/TemplateCanvas/StructuresDropdown.css` - Dropdown styling
- `src/components/TemplateCanvas/LineElement.tsx` - New line component
- `src/components/TemplateCanvas/LineElement.css` - Line styling
- `src/components/TemplateCanvas/BoxElement.tsx` - New box component
- `src/components/TemplateCanvas/BoxElement.css` - Box styling
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added line/box support
- `src/components/TemplateCanvas/Toolbar.tsx` - Added StructuresDropdown
- `src/components/TemplateCanvas/PropertiesPanel.tsx` - Added line/box properties

### Toolbar Structure
```
[Add Text] [Add Table] [Add Image] | [Structures ▼] | [Save Template] [Load Template] | [Delete]
```

**Toolbar Sections:**
1. **Content Elements**: Text, Table, Image
2. **Structures**: Dropdown menu with Line and Box
3. **File Operations**: Save and Load template
4. **Actions**: Delete selected element

### Usage Examples

#### Creating a Separator Line
1. Click "Structures" → "Add Line"
2. Line appears horizontally (200px)
3. Resize to desired length
4. Change color/style in Properties Panel
5. Use as section separator in template

#### Creating a Bordered Box
1. Click "Structures" → "Add Box"
2. Box appears (200x200px with border)
3. Resize to desired dimensions
4. Customize border (width, color, style)
5. Set background color or keep transparent
6. Add border radius for rounded corners

#### Creating a Vertical Divider
1. Add line element
2. In Properties Panel, change direction to "Vertical"
3. Adjust length and position
4. Use as vertical divider between content sections

### Future Enhancements
- **Additional Structures**: Circle, Arrow, Polygon shapes
- **Line Rotation**: Support for diagonal lines at any angle
- **Box Fill Patterns**: Hatching, stripes, gradients
- **Structure Groups**: Group multiple structures together
- **Snap to Grid**: Align structures to grid
- **Structure Templates**: Pre-defined structure combinations

## Next Steps
All 10 phases are now complete! The template canvas editor supports:
- ✅ Basic canvas setup
- ✅ Text elements
- ✅ Placeholder support
- ✅ Drag and drop
- ✅ Selection and properties
- ✅ Delete and resize
- ✅ Tables
- ✅ Save/Load templates
- ✅ Image elements with placeholders
- ✅ Structural elements (Line and Box)
