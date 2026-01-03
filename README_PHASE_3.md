# Phase 3: Placeholder Support

## Overview
This phase implements support for `{{variable}}` placeholders in text elements, allowing users to insert and visualize template variables.

## Implementation Details

### Components Created/Updated
1. **TextElement Component** (`src/components/TemplateCanvas/TextElement.tsx`)
   - New component to handle individual text elements
   - Supports inline editing (double-click to edit)
   - Parses and highlights placeholders in text
   - Validates placeholder syntax

2. **Updated TemplateCanvas Component**
   - Refactored to use TextElement component
   - Added `handleUpdateText` function to update element content

### Features
- ✅ Parse text for `{{...}}` patterns using regex
- ✅ Visual highlighting of placeholders (yellow background with border)
- ✅ Placeholder validation (validates variable name syntax)
- ✅ Invalid placeholders shown with red background
- ✅ Inline text editing (double-click to edit, Enter/Escape to save/cancel)
- ✅ Tooltip hints for placeholders
- ✅ Hover outline on text elements

### Placeholder Syntax
- Format: `{{variable_name}}`
- Valid variable names: Start with letter or underscore, followed by alphanumeric characters and underscores
- Examples:
  - ✅ Valid: `{{customer_name}}`, `{{total_amount}}`, `{{item_1}}`
  - ❌ Invalid: `{{123var}}`, `{{var-name}}`, `{{}}`, `{{ var }}`

### Visual Styling
- **Valid Placeholders**: Yellow background (#fff3cd), dark yellow text (#856404), yellow border
- **Invalid Placeholders**: Red background (#f8d7da), dark red text (#721c24), red border
- **Text Element Hover**: Blue dashed outline
- **Editing Mode**: Blue border around input field

### User Interaction
1. **Add Text**: Click "Add Text" button in toolbar
2. **Edit Text**: Double-click any text element to edit
3. **Insert Placeholder**: Type `{{variable_name}}` while editing
4. **Save Changes**: Press Enter or click outside the input
5. **Cancel Editing**: Press Escape

### Validation Rules
- Placeholder must be wrapped in double curly braces: `{{...}}`
- Variable name must not be empty
- Variable name must start with a letter (a-z, A-Z) or underscore (_)
- Variable name can contain letters, numbers, and underscores
- No spaces or special characters allowed in variable name

## Files Created/Modified
- `src/components/TemplateCanvas/TextElement.tsx` - New component for text elements with placeholder support
- `src/components/TemplateCanvas/TextElement.css` - Styling for text elements and placeholders
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Updated to use TextElement component
- `src/components/TemplateCanvas/TemplateCanvas.css` - Updated canvas overflow

## Technical Implementation

### Placeholder Parsing
Uses regex pattern `/\{\{[^}]*\}\}/g` to find all placeholder patterns in text, then validates each match.

### Validation Function
```typescript
validatePlaceholder(placeholder: string): boolean
```
- Checks format: `{{variable_name}}`
- Validates variable name against regex: `/^[a-zA-Z_][a-zA-Z0-9_]*$/`

### Text Parsing
Splits text into parts (regular text and placeholders) for rendering with appropriate styling.

## Next Phase
Phase 4: Drag and Drop - Allow users to move elements around the canvas.

