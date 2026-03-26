# Phase 9 (Branch TC-011): Image Placeholder Support

## Overview
This phase implements image element support, allowing users to add images to the canvas, upload images via file input, resize images, and use placeholders for dynamic image URLs. Images are stored as base64 data URLs in the JSON template for quick implementation with the ability to scale to server-side storage later.

## Implementation Details

### Features Added
1. **Image Elements**
   - Add image placeholders to canvas
   - Upload images via file input (converts to base64)
   - Support for image URLs
   - Placeholder syntax: `{{image_url}}` or `{{image_1}}`

2. **Image Manipulation**
   - Drag and drop images
   - Resize images (corner, width, height)
   - Maintain aspect ratio on corner resize
   - Object fit options (contain, cover, fill, none, scale-down)
   - Opacity control (0-100%)

3. **Image Properties**
   - Width and height controls
   - Image source input (URL or placeholder)
   - File upload button
   - Object fit dropdown
   - Opacity slider

### Components Created
1. **ImageElement Component** (`src/components/TemplateCanvas/ImageElement.tsx`)
   - Renders image with drag and drop support
   - Resize handles (corner, right edge, bottom edge)
   - Double-click to upload new image
   - Placeholder display for `{{image_url}}` syntax
   - Error handling for failed image loads

2. **ImageElement Styles** (`src/components/TemplateCanvas/ImageElement.css`)
   - Styling for image elements
   - Resize handle styles
   - Placeholder display styles
   - Error state styling

### Components Updated
1. **TemplateCanvas Component**
   - Added `ImageElementType` interface
   - Added `handleAddImage()` function
   - Added `handleUpdateImage()` function
   - Updated `CanvasElement` union type
   - Integrated image rendering in canvas

2. **Toolbar Component**
   - Added "Add Image" button
   - Creates default image placeholder `{{image_url}}`

3. **PropertiesPanel Component**
   - Added image-specific property controls
   - Image source input field
   - Upload image button
   - Width/Height number inputs
   - Object Fit dropdown
   - Opacity slider
   - Hidden font properties for images

### Image Data Structure
```typescript
interface ImageElementType {
  id: string;
  type: 'image';
  src: string;  // Base64 data URL or image URL or placeholder
  position: { x: number; y: number };
  style: {
    width: number;
    height: number;
    objectFit: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
    opacity?: number;
  };
}
```

### Default Image Element
When adding an image, creates:
- Default placeholder: `{{image_url}}`
- Default size: 200x200px
- Default object fit: `contain`
- Default opacity: 100%

### User Interaction

#### Adding Images
1. Click "Add Image" button in toolbar
2. Image placeholder appears on canvas with `{{image_url}}`
3. Double-click image or use Properties Panel "Upload Image" button
4. Select image file from file picker
5. Image converts to base64 and displays

#### Editing Images
1. **Upload New Image**: Double-click image or use "Upload Image" button
2. **Change Source**: Edit source field in Properties Panel (URL or placeholder)
3. **Resize**: 
   - Corner handle: Resize both dimensions (maintains aspect ratio)
   - Right edge: Resize width only
   - Bottom edge: Resize height only
4. **Properties**: Select image → Edit in Properties Panel

#### Placeholder Support
- Type `{{image_url}}` or `{{image_1}}` in source field
- Placeholder displays with icon and text
- Can be replaced with actual image later
- Supports same validation as text placeholders

### Image Features

#### Resize Behavior
- **Corner Handle**: Resizes both width and height while maintaining aspect ratio
- **Right Edge**: Resizes width only (height unchanged)
- **Bottom Edge**: Resizes height only (width unchanged)
- Visual feedback during resize
- Minimum size: 50px, Maximum size: 1000px

#### Object Fit Options
- **Contain**: Image fits within bounds, maintains aspect ratio
- **Cover**: Image covers entire area, maintains aspect ratio
- **Fill**: Image stretches to fill area, may distort
- **None**: Image displays at natural size
- **Scale Down**: Like contain, but never upscales

#### Image Storage
- **Current Implementation**: Base64 data URLs stored in JSON
- **Format**: `data:image/png;base64,iVBORw0KG...`
- **Benefits**: Self-contained, works offline, no external dependencies
- **Future Scaling**: Can migrate to server-side storage with URLs

### Technical Implementation

#### Image Upload Process
```typescript
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const base64 = event.target?.result as string;
    onUpdate(id, base64); // Update element with base64 data URL
  };
  reader.readAsDataURL(file);
};
```

#### Resize Implementation
```typescript
const handleResizeStart = (e: React.MouseEvent, type: 'corner' | 'right' | 'bottom') => {
  // Track mouse movement
  // Calculate new dimensions based on resize type
  // Update element style with new width/height
};
```

#### Placeholder Detection
```typescript
const isPlaceholder = typeof src === 'string' && 
  src.trim().startsWith('{{') && 
  src.trim().endsWith('}}');
```

### JSON Template Format
```json
{
  "version": "1.0",
  "elements": [
    {
      "id": "image-1234567890",
      "type": "image",
      "src": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "position": { "x": 100, "y": 50 },
      "style": {
        "width": 200,
        "height": 200,
        "objectFit": "contain",
        "opacity": 100
      }
    },
    {
      "id": "image-1234567891",
      "type": "image",
      "src": "{{image_url}}",
      "position": { "x": 300, "y": 50 },
      "style": {
        "width": 150,
        "height": 150,
        "objectFit": "cover",
        "opacity": 80
      }
    }
  ]
}
```

### Visual Design
- **Image Element**: Displays image with border on hover/selection
- **Selected State**: Blue outline (2px solid #007bff)
- **Hover State**: Dashed blue outline
- **Placeholder**: Gray background with dashed border, icon, and placeholder text
- **Resize Handles**: Blue circular/rectangular handles at corners and edges
- **Error State**: Red background with error message if image fails to load

### Edge Cases Handled
- File type validation (only image files accepted)
- Image load error handling (shows error message)
- Placeholder display (shows icon and text instead of broken image)
- Resize constraints (min 50px, max 1000px)
- Aspect ratio maintenance on corner resize
- Drag disabled during resize operation
- Double-click to upload (doesn't interfere with selection)

### Files Created/Modified
- `src/components/TemplateCanvas/ImageElement.tsx` - New image component
- `src/components/TemplateCanvas/ImageElement.css` - Image styling
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added image support
- `src/components/TemplateCanvas/Toolbar.tsx` - Added "Add Image" button
- `src/components/TemplateCanvas/PropertiesPanel.tsx` - Added image properties

### Usage Examples

#### Adding and Uploading an Image
1. Click "Add Image" button
2. Image placeholder appears with `{{image_url}}`
3. Double-click the placeholder
4. Select image file from file picker
5. Image displays on canvas

#### Using Image Placeholders
1. Add image element
2. In Properties Panel, source field shows `{{image_url}}`
3. Can change to `{{logo}}`, `{{photo_1}}`, etc.
4. Placeholder displays with icon
5. Can be replaced with actual image later

#### Resizing Images
1. Select image element
2. Drag corner handle to resize both dimensions (maintains aspect ratio)
3. Drag right edge to resize width only
4. Drag bottom edge to resize height only

### Future Enhancements (For Scaling)
- **Server-Side Storage**: Upload images to server, store URLs in template
- **Image Optimization**: Compress images before storing
- **CDN Integration**: Serve images from CDN for better performance
- **Image Library**: Browse and select from previously uploaded images
- **Aspect Ratio Lock**: Toggle to lock/unlock aspect ratio during resize
- **Image Cropping**: Crop images before adding to canvas
- **Multiple Image Formats**: Support for SVG, WebP, etc.

## Next Steps
All 9 phases are now complete! The template canvas editor supports:
- ✅ Basic canvas setup
- ✅ Text elements
- ✅ Placeholder support
- ✅ Drag and drop
- ✅ Selection and properties
- ✅ Delete and resize
- ✅ Tables
- ✅ Save/Load templates
- ✅ Image elements with placeholders
