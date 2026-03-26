# Phase 14 (Branch TC-014): PDF Export with A4 Page Size

## Overview
This phase implements PDF export functionality for templates with full control over A4 page size formatting. The implementation uses jsPDF and html2canvas libraries to provide high-quality PDF generation with customizable settings for quality, scaling, and page layout.

## Implementation Details

### Features Added
1. **PDF Export Button**
   - Added "Export PDF" button to toolbar
   - Disabled when no elements exist on canvas
   - Positioned alongside Save/Load Template buttons
   - Tooltip: "Export template as PDF (A4 size)"

2. **A4 PDF Generation**
   - Standard A4 page size: 210mm × 297mm (portrait orientation)
   - High-quality canvas capture with 2x scale
   - Automatic aspect ratio preservation
   - Content centering within A4 page
   - White background for clean PDF output

3. **Export Control Options**
   - Configurable image quality (scale factor)
   - Customizable PDF compression
   - Control over margins and positioning
   - Support for cross-origin images
   - Automatic UI element hiding during export

### Components Updated
1. **TemplateCanvas Component** (`src/components/TemplateCanvas/TemplateCanvas.tsx`)
   - Added `useRef` hook for canvas reference
   - Imported `jsPDF` and `html2canvas` libraries
   - Created `handleExportPDF()` async function
   - Added `canvasRef` to template canvas div
   - Integrated PDF export handler with Toolbar

2. **Toolbar Component** (`src/components/TemplateCanvas/Toolbar.tsx`)
   - Added `onExportPDF` prop to interface
   - Added "Export PDF" button in toolbar section
   - Button disabled when `hasElements` is false
   - Styled as secondary button (consistent with Save/Load)

### Dependencies Added
1. **jsPDF** (`jspdf`)
   - PDF generation library
   - Full control over PDF creation
   - A4 format support
   - Image embedding capabilities

2. **html2canvas** (`html2canvas`)
   - HTML to canvas conversion
   - High-quality rendering
   - Cross-origin image support
   - Customizable capture settings

### PDF Export Function Implementation

#### Export Process
```typescript
const handleExportPDF = async () => {
  // 1. Validate canvas and elements
  // 2. Show loading indicator (cursor: wait)
  // 3. Hide UI elements (toolbar, properties panel)
  // 4. Capture canvas with html2canvas
  // 5. Calculate A4 dimensions and scaling
  // 6. Create PDF with jsPDF
  // 7. Add image to PDF
  // 8. Save PDF file
  // 9. Restore UI elements
}
```

#### A4 Configuration
```typescript
// A4 dimensions in millimeters
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// PDF creation
const pdf = new jsPDF({
  orientation: 'portrait',  // Can be changed to 'landscape'
  unit: 'mm',               // Can be 'pt', 'px', 'in', etc.
  format: 'a4',             // Standard A4 format
  compress: true,           // Enable compression
});
```

#### Canvas Capture Settings
```typescript
const canvas = await html2canvas(canvasRef.current, {
  scale: 2,                 // 2x scale for high quality
  useCORS: true,            // Allow cross-origin images
  logging: false,           // Disable console logging
  backgroundColor: '#ffffff', // White background
  width: canvasRef.current.offsetWidth,
  height: canvasRef.current.offsetHeight,
  windowWidth: canvasRef.current.scrollWidth,
  windowHeight: canvasRef.current.scrollHeight,
});
```

#### Aspect Ratio Handling
The export function automatically calculates the best fit for content within A4:
- If content is wider: Fits to width, centers vertically
- If content is taller: Fits to height, centers horizontally
- Maintains original aspect ratio
- No content distortion

### User Interaction

#### Exporting to PDF
1. Create template with elements (text, tables, images, lines, boxes)
2. Click "Export PDF" button in toolbar
3. Button shows loading state (cursor changes to wait)
4. UI elements (toolbar, properties panel) temporarily hidden
5. Canvas captured and converted to PDF
6. PDF automatically downloads with filename: `template-[timestamp].pdf`
7. UI elements restored after export completes

#### Export Requirements
- At least one element must exist on canvas
- Button is disabled when canvas is empty
- All images must be loaded (for best results)
- Canvas size: Already configured to A4 (210mm × 297mm)

### Customization Options

#### Quality Settings
You can modify these in `handleExportPDF()` function:

1. **Image Quality**
   ```typescript
   scale: 2  // Change to 1 (faster) or 3 (higher quality)
   canvas.toDataURL('image/png', 1.0)  // Compression: 0.0-1.0
   ```

2. **PDF Compression**
   ```typescript
   compress: true  // Enable/disable PDF compression
   ```

3. **Page Orientation**
   ```typescript
   orientation: 'portrait'  // Change to 'landscape' for landscape PDFs
   ```

4. **Page Size**
   ```typescript
   format: 'a4'  // Can use other formats: 'letter', 'legal', etc.
   // Or specify custom: { width: 210, height: 297 }
   ```

5. **Background Color**
   ```typescript
   backgroundColor: '#ffffff'  // Change to any color
   ```

6. **Scaling Behavior**
   - Current: Fits content to A4 with aspect ratio preservation
   - Can modify to fill entire page or add custom margins
   - Can adjust xOffset and yOffset for positioning

### Technical Implementation Details

#### Canvas Reference
```typescript
const canvasRef = useRef<HTMLDivElement>(null);

// Applied to template canvas div
<div ref={canvasRef} className="template-canvas">
  {/* elements */}
</div>
```

#### UI Element Hiding
```typescript
// Temporarily hide UI during export
const toolbar = document.querySelector('.toolbar');
const propertiesPanel = document.querySelector('.properties-panel');
if (toolbar) (toolbar as HTMLElement).style.display = 'none';
if (propertiesPanel) (propertiesPanel as HTMLElement).style.display = 'none';

// Restore after export
if (toolbar) (toolbar as HTMLElement).style.display = '';
if (propertiesPanel) (propertiesPanel as HTMLElement).style.display = '';
```

#### Aspect Ratio Calculation
```typescript
const imgAspectRatio = imgWidth / imgHeight;
const pdfAspectRatio = A4_WIDTH_MM / A4_HEIGHT_MM;

if (imgAspectRatio > pdfAspectRatio) {
  // Image is wider - fit to width
  finalWidth = A4_WIDTH_MM;
  finalHeight = A4_WIDTH_MM / imgAspectRatio;
  yOffset = (A4_HEIGHT_MM - finalHeight) / 2;
} else {
  // Image is taller - fit to height
  finalHeight = A4_HEIGHT_MM;
  finalWidth = A4_HEIGHT_MM * imgAspectRatio;
  xOffset = (A4_WIDTH_MM - finalWidth) / 2;
}
```

### Error Handling
- Validates canvas reference exists
- Checks if elements exist before export
- Catches and logs errors during export process
- Shows user-friendly error alerts
- Restores UI elements even if export fails
- Handles image loading errors gracefully

### File Output
- **Filename Format**: `template-[timestamp].pdf`
- **Example**: `template-1706201234567.pdf`
- **File Type**: PDF (Portable Document Format)
- **Page Size**: A4 (210mm × 297mm)
- **Orientation**: Portrait (can be customized)
- **Quality**: High (2x scale capture)

### Visual Design
- **Export Button**: Secondary button style (gray)
- **Button State**: Disabled when no elements exist
- **Loading State**: Cursor changes to "wait" during export
- **UI Hiding**: Toolbar and properties panel hidden during capture
- **PDF Output**: Clean white background, all elements preserved

### Edge Cases Handled
- Empty canvas validation (button disabled)
- Missing canvas reference handling
- Image loading timing (waits for capture)
- Cross-origin image support (useCORS: true)
- UI restoration on errors
- Aspect ratio preservation
- Content centering within A4 page
- Large canvas handling (scales appropriately)

### Files Modified
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added PDF export functionality
- `src/components/TemplateCanvas/Toolbar.tsx` - Added Export PDF button
- `package.json` - Added jsPDF and html2canvas dependencies

### Toolbar Structure
```
[Add Text] [Add Table] [Add Image] | [Structures ▼] | [Save Template] [Load Template] [Export PDF] | [Delete]
```

**Toolbar Sections:**
1. **Content Elements**: Text, Table, Image
2. **Structures**: Dropdown menu with Line and Box
3. **File Operations**: Save, Load, and Export PDF
4. **Actions**: Delete selected element

### Usage Examples

#### Basic PDF Export
1. Create template with various elements
2. Position and style elements as desired
3. Click "Export PDF" button
4. PDF downloads automatically
5. Open PDF to verify A4 formatting

#### Exporting with Images
1. Add image elements to template
2. Upload images or use placeholders
3. Ensure images are loaded
4. Click "Export PDF"
5. Images included in PDF with original quality

#### Customizing Export Quality
1. Open `TemplateCanvas.tsx`
2. Locate `handleExportPDF()` function
3. Modify `scale: 2` to desired value (1-3)
4. Adjust `compress: true` for file size vs quality
5. Change `orientation` for landscape PDFs

### Future Enhancements
- **Multi-page Support**: Split large templates across multiple A4 pages
- **Custom Page Sizes**: Support for Letter, Legal, custom dimensions
- **Export Settings Dialog**: UI for configuring export options
- **PDF Metadata**: Add title, author, subject to PDF
- **Print Margins**: Configurable margins for printing
- **Export Preview**: Preview PDF before downloading
- **Batch Export**: Export multiple templates at once
- **PDF Templates**: Pre-configured PDF layouts
- **Watermark Support**: Add watermarks to exported PDFs
- **Password Protection**: Secure PDF export option

### Integration Notes
- Works seamlessly with existing template system
- No changes required to template JSON format
- Compatible with all element types (text, table, image, line, box)
- Preserves all styling and positioning
- Maintains placeholder syntax in exported PDF

### Performance Considerations
- **Export Speed**: Depends on canvas complexity and image count
- **File Size**: Controlled by compression and image quality settings
- **Memory Usage**: High-quality exports may use more memory
- **Browser Compatibility**: Works in modern browsers (Chrome, Firefox, Safari, Edge)

### Known Limitations
- Large images may increase PDF file size significantly
- Very complex templates may take longer to export
- Some advanced CSS features may not render perfectly
- External images require CORS headers to be captured

## Next Steps
The template canvas editor now supports:
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
- ✅ **PDF Export with A4 page size**
