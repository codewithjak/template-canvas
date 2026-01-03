# Phase 7: Tables

## Overview
This phase implements table elements, allowing users to add tables to the canvas, edit table data, and support placeholders in table cells.

## Implementation Details

### Components Created
1. **TableElement Component** (`src/components/TemplateCanvas/TableElement.tsx`)
   - Renders table with rows and columns
   - Supports inline cell editing (double-click)
   - Placeholder support in cells
   - Drag and drop support
   - Resize handle for font size

2. **Updated TemplateCanvas Component**
   - Added support for both text and table elements
   - Created `CanvasElement` union type
   - Added `handleAddTable` function
   - Added `handleUpdateTable` function
   - Updated rendering to handle both element types

3. **Updated Toolbar Component**
   - Added "Add Table" button
   - Creates default 3x3 table with sample data

4. **Updated PropertiesPanel Component**
   - Table data editor with inline cell editing
   - Add/remove rows and columns
   - Visual table editor interface

### Features
- ✅ Add table button in toolbar
- ✅ Table element type with data structure
- ✅ Render table with rows/columns
- ✅ Placeholder support in table cells
- ✅ Edit table data in properties panel
- ✅ Inline cell editing (double-click)
- ✅ Add/remove rows and columns
- ✅ Drag and drop tables
- ✅ Resize font size
- ✅ Selection and properties editing

### Table Data Structure
```typescript
interface TableElementType {
  id: string;
  type: 'table';
  data: string[][];  // 2D array of cell content
  position: { x: number; y: number };
  style: {
    fontSize: number;
    fontWeight: string;
    color: string;
  };
}
```

### Default Table
When adding a table, creates a 3x3 table with:
- Row 1: Header row with "Header 1", "Header 2", "Header 3"
- Row 2: Sample data with placeholders `{{item1}}`, `{{qty1}}`, `{{price1}}`
- Row 3: Sample data with placeholders `{{item2}}`, `{{qty2}}`, `{{price2}}`

### User Interaction

#### Adding Tables
1. Click "Add Table" button in toolbar
2. Table appears on canvas with default 3x3 structure

#### Editing Table Cells
1. **Inline Editing**: Double-click any cell to edit
2. **Properties Panel**: Select table → Edit cells in properties panel
3. **Placeholders**: Type `{{variable_name}}` in cells

#### Managing Rows/Columns
- **Add Row**: Click "+ Add Row" button in properties panel
- **Add Column**: Click "+ Add Column" button in properties panel
- **Remove Row**: Click × button on row (disabled if only 1 row)
- **Remove Column**: Click × button on column (disabled if only 1 column)

### Table Features

#### Cell Editing
- Double-click cell to edit inline
- Press Enter to save, Escape to cancel
- Placeholder validation and highlighting
- Real-time updates

#### Properties Panel Editor
- Visual table editor showing all cells
- Inline cell editing in properties panel
- Add/remove controls for rows and columns
- Scrollable for large tables

#### Visual Styling
- Table borders and cell padding
- Hover effects on cells
- Selected table has blue outline
- Resize handle for font size adjustment

### Technical Implementation

#### Element Type Union
```typescript
type CanvasElement = TextElementType | TableElementType;
```

#### Table Rendering
- Uses HTML `<table>` element
- Maps `data` array to table rows and cells
- Supports placeholder parsing in each cell

#### Cell Update Handler
```typescript
const handleUpdateTable = (id: string, data: string[][]) => {
  setElements(
    elements.map((element) =>
      element.id === id && element.type === 'table' 
        ? { ...element, data } 
        : element
    )
  );
};
```

### Edge Cases Handled
- Minimum 1 row and 1 column (remove buttons disabled)
- Type checking for text vs table elements
- Proper state updates for table data
- Placeholder validation in table cells
- Drag disabled during cell editing
- Resize handle hidden during editing

## Files Created/Modified
- `src/components/TemplateCanvas/TableElement.tsx` - New table component
- `src/components/TemplateCanvas/TableElement.css` - Table styling
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added table support
- `src/components/TemplateCanvas/Toolbar.tsx` - Added "Add Table" button
- `src/components/TemplateCanvas/PropertiesPanel.tsx` - Added table editor
- `src/components/TemplateCanvas/PropertiesPanel.css` - Table editor styling

## Next Phase
Phase 8: Save/Load Template - Save template as JSON and load it back.

