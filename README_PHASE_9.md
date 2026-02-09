# Phase 9: Library/Package Preparation

## Overview
This phase transforms the Template Canvas Editor from an application into a reusable React component library that can be published to npm and used in other projects.

## Implementation Details

### Package Configuration

#### Updated `package.json`
- **Package Name**: Changed from `data-to-docs` to `template-canvas-editor`
- **Version**: Set to `1.0.0`
- **Type**: Configured as ES module
- **Main Entry Points**:
  - `main`: `./dist/index.js` (CommonJS)
  - `module`: `./dist/index.mjs` (ESM)
  - `types`: `./dist/index.d.ts` (TypeScript definitions)
- **Exports**: Configured dual format exports (ESM and CommonJS)
- **Peer Dependencies**: React 18 or 19, React DOM 18 or 19
- **Build Scripts**: Added `build:lib` using tsup, `prepublishOnly` hook
- **Keywords**: Added for npm discoverability

### Build System

#### New Build Configuration
1. **`tsup.config.ts`**
   - Configured tsup for library bundling
   - Dual format output (CJS and ESM)
   - TypeScript declaration files generation
   - Source maps enabled
   - External dependencies (react, react-dom, @dnd-kit packages)
   - Tree shaking enabled
   - JSX automatic mode

2. **`tsconfig.lib.json`**
   - Separate TypeScript config for library compilation
   - Declaration files enabled
   - Excludes app-specific files (main.tsx, App.tsx)
   - Output directory: `./dist`

### Code Organization

#### New Files Created
1. **`src/index.ts`** - Main entry point
   - Exports `TemplateCanvas` component
   - Exports `TemplateCanvasProps` type
   - Exports all element types (`TextElementType`, `TableElementType`, `CanvasElement`)
   - Exports utility functions (`saveTemplate`, `loadTemplate`, `downloadTemplate`)
   - Exports `TemplateData` type

2. **`src/components/TemplateCanvas/types.ts`**
   - Extracted all TypeScript interfaces and types
   - `TextElementType` interface
   - `TableElementType` interface
   - `CanvasElement` union type
   - `TemplateData` interface

3. **`src/components/TemplateCanvas/utils.ts`**
   - Extracted utility functions from component
   - `saveTemplate`: Converts elements to JSON string
   - `loadTemplate`: Parses JSON and validates format
   - `downloadTemplate`: Downloads template as file

4. **`.npmignore`**
   - Excludes source files from npm package
   - Excludes development files and configs
   - Excludes app-specific files
   - Only includes `dist` and `README.md` in package

### Component API Enhancement

#### Updated `TemplateCanvas.tsx`
- **Props Interface**: Added `TemplateCanvasProps` with:
  - `elements?`: Controlled elements array
  - `onElementsChange?`: Callback for controlled mode
  - `initialElements?`: Initial elements for uncontrolled mode
  - `showToolbar?`: Toggle toolbar visibility
  - `showPropertiesPanel?`: Toggle properties panel visibility

- **Controlled/Uncontrolled Mode**:
  - Supports both controlled and uncontrolled usage patterns
  - Controlled: Parent manages state via `elements` and `onElementsChange`
  - Uncontrolled: Component manages internal state with `initialElements`

- **Type Safety Improvements**:
  - Proper type checking for text vs table elements in update handler
  - Better type narrowing for element operations

- **Refactored Save/Load**:
  - Uses extracted utility functions
  - Better error handling with typed errors

### Features

- ✅ Package ready for npm publication
- ✅ Dual format support (ESM and CommonJS)
- ✅ TypeScript definitions included
- ✅ Proper exports for all public APIs
- ✅ Controlled and uncontrolled component modes
- ✅ Configurable UI (toolbar and properties panel visibility)
- ✅ Extracted types and utilities for external use
- ✅ Clean package structure (only dist and README)

### Package Structure

```
template-canvas-editor/
├── dist/
│   ├── index.js          # CommonJS bundle
│   ├── index.mjs         # ESM bundle
│   ├── index.d.ts        # TypeScript definitions
│   ├── index.d.cts       # CommonJS TypeScript definitions
│   ├── index.css         # Styles
│   └── *.map             # Source maps
├── README.md
└── package.json
```

### Usage Examples

#### Installation
```bash
npm install template-canvas-editor
```

#### Basic Usage
```tsx
import { TemplateCanvas } from 'template-canvas-editor';
import 'template-canvas-editor/styles.css';

function App() {
  return <TemplateCanvas />;
}
```

#### Controlled Mode
```tsx
import { TemplateCanvas, type CanvasElement } from 'template-canvas-editor';
import { useState } from 'react';

function App() {
  const [elements, setElements] = useState<CanvasElement[]>([]);

  return (
    <TemplateCanvas
      elements={elements}
      onElementsChange={setElements}
    />
  );
}
```

#### Custom Configuration
```tsx
<TemplateCanvas
  initialElements={[]}
  showToolbar={true}
  showPropertiesPanel={true}
  onElementsChange={(elements) => {
    console.log('Elements changed:', elements);
  }}
/>
```

#### Using Utilities
```tsx
import { saveTemplate, loadTemplate, downloadTemplate } from 'template-canvas-editor';

// Save template to JSON string
const json = saveTemplate(elements);

// Load template from JSON string
const elements = loadTemplate(jsonString);

// Download template as file
downloadTemplate(elements, 'my-template.json');
```

### Technical Implementation

#### Build Process
1. **Development**: `npm run dev` - Uses Vite for app development
2. **Library Build**: `npm run build:lib` - Uses tsup to build library
3. **App Build**: `npm run build:app` - Uses Vite to build demo app
4. **Pre-publish**: Automatically builds library before npm publish

#### Export Strategy
- **Default Export**: TemplateCanvas component
- **Named Exports**: Types, utilities, props interface
- **CSS Export**: Separate stylesheet import path
- **Type Exports**: Full TypeScript support

#### External Dependencies
- React and React DOM marked as peer dependencies
- @dnd-kit packages marked as external (not bundled)
- Ensures consumers use their own versions

### Edge Cases Handled
- Proper type narrowing for text vs table elements
- Controlled mode state management
- Uncontrolled mode with initial values
- Error handling in utility functions
- Type-safe element updates
- Proper cleanup of extracted code

## Files Created
- `src/index.ts` - Main entry point
- `src/components/TemplateCanvas/types.ts` - Type definitions
- `src/components/TemplateCanvas/utils.ts` - Utility functions
- `tsup.config.ts` - Library build configuration
- `tsconfig.lib.json` - Library TypeScript configuration
- `.npmignore` - Package exclusion rules

## Files Modified
- `package.json` - Package configuration and metadata
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added props interface and controlled/uncontrolled modes

## Next Steps
The library is now ready for:
- ✅ npm publication
- ✅ Distribution to other projects
- ✅ Integration into applications
- ✅ Further customization by consumers
