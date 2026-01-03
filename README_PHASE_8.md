# Phase 8: Save/Load Template

## Overview
This phase implements save and load functionality, allowing users to save templates as JSON files and load them back to restore the canvas state.

## Implementation Details

### Features Added
1. **Save Template**
   - Converts canvas state to JSON format
   - Downloads JSON file with timestamp
   - Includes version information
   - Saves all elements (text and tables)

2. **Load Template**
   - File input for selecting JSON template file
   - Parses JSON and validates format
   - Restores canvas state
   - Clears selection after load

### Components Updated
1. **TemplateCanvas Component**
   - Added `handleSaveTemplate` function
   - Added `handleLoadTemplate` function
   - JSON serialization/deserialization
   - Error handling for invalid files

2. **Toolbar Component**
   - Added "Save Template" button (green)
   - Added "Load Template" button (green)
   - Organized buttons into sections with dividers
   - Save button disabled when no elements

### Save Functionality

#### JSON Format
```json
{
  "version": "1.0",
  "elements": [
    {
      "id": "text-1234567890",
      "type": "text",
      "content": "Hello {{name}}",
      "position": { "x": 100, "y": 50 },
      "style": {
        "fontSize": 16,
        "fontWeight": "normal",
        "color": "#000000"
      }
    },
    {
      "id": "table-1234567890",
      "type": "table",
      "data": [
        ["Header 1", "Header 2"],
        ["{{item1}}", "{{qty1}}"]
      ],
      "position": { "x": 50, "y": 100 },
      "style": {
        "fontSize": 14,
        "fontWeight": "normal",
        "color": "#000000"
      }
    }
  ]
}
```

#### Save Process
1. User clicks "Save Template" button
2. Canvas state converted to JSON
3. JSON formatted with indentation (2 spaces)
4. File downloaded with name: `template-{timestamp}.json`
5. Blob URL created and cleaned up after download

### Load Functionality

#### Load Process
1. User clicks "Load Template" button
2. File input dialog opens (accepts .json files)
3. File read as text
4. JSON parsed and validated
5. Elements array extracted and restored
6. Selection cleared
7. Error handling for invalid files

#### Validation
- Checks if template has `elements` property
- Validates that `elements` is an array
- Shows error alert for invalid format
- Console logs errors for debugging

### User Interaction

#### Save Template
1. Create/edit template on canvas
2. Click "Save Template" button
3. JSON file downloads automatically
4. File saved with timestamp in name

#### Load Template
1. Click "Load Template" button
2. Select JSON template file
3. Template loads and replaces current canvas
4. All elements restored with their properties

### Technical Implementation

#### Save Handler
```typescript
const handleSaveTemplate = () => {
  const template = {
    version: '1.0',
    elements: elements,
  };
  const json = JSON.stringify(template, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `template-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
```

#### Load Handler
```typescript
const handleLoadTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string;
      const template = JSON.parse(text);
      
      if (template.elements && Array.isArray(template.elements)) {
        setElements(template.elements);
        setSelectedElementId(null);
      } else {
        alert('Invalid template file format');
      }
    } catch (error) {
      console.error('Error loading template:', error);
      alert('Error loading template file. Please check the file format.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
};
```

### Visual Design
- **Save Button**: Green (#28a745), disabled when no elements
- **Load Button**: Green (#28a745)
- **Toolbar Sections**: Organized with visual dividers
- **Button States**: Disabled state with reduced opacity

### Edge Cases Handled
- Save button disabled when canvas is empty
- File input reset after load (allows loading same file twice)
- Error handling for invalid JSON
- Error handling for missing elements array
- Selection cleared after load
- Blob URL cleanup after download
- File type validation (.json only)

### File Format Details
- **Version**: Template format version (currently "1.0")
- **Elements**: Array of all canvas elements
- **Element Types**: Supports both 'text' and 'table' types
- **Preserved Properties**: All element properties saved (id, type, content/data, position, style)

## Files Modified
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added save/load handlers
- `src/components/TemplateCanvas/Toolbar.tsx` - Added save/load buttons
- `src/components/TemplateCanvas/Toolbar.css` - Updated toolbar styling with sections

## Usage Examples

### Saving a Template
1. Create text elements and tables
2. Arrange and style them
3. Click "Save Template"
4. File downloads: `template-1704123456789.json`

### Loading a Template
1. Click "Load Template"
2. Select previously saved JSON file
3. Canvas restores with all elements
4. Continue editing as needed

## Next Steps
All 8 phases are now complete! The template canvas editor is fully functional with:
- ✅ Basic canvas setup
- ✅ Text elements
- ✅ Placeholder support
- ✅ Drag and drop
- ✅ Selection and properties
- ✅ Delete and resize
- ✅ Tables
- ✅ Save/Load templates

