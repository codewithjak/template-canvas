# Phase 15 (Branch TC-015): CSV Data Upload and Dynamic Template Binding

## Overview
This phase implements CSV file upload functionality with a visual wizard and side-by-side template/data preview. Users can upload CSV files containing data, automatically map placeholders to CSV columns, preview templates with real data, and generate PDFs with dynamic data replacement.

## Implementation Details

### Features Added
1. **CSV Upload Wizard**
   - Drag-and-drop or click to upload CSV files
   - Automatic CSV parsing and validation
   - Data preview (first 5 rows)
   - File format validation
   - Error handling for invalid files

2. **Side-by-Side Template & Data View**
   - Left panel: Data rows list with selection
   - Left panel: Field mapping interface (template placeholders → CSV columns)
   - Left panel: Selected row data display
   - Right panel: Template preview with filled data
   - Real-time preview updates when selecting different rows

3. **Automatic Field Mapping**
   - Auto-detects placeholders from template
   - Auto-maps to CSV columns (exact and fuzzy matching)
   - Case-insensitive matching
   - Manual override capability

4. **Dynamic PDF Generation**
   - Generate PDF with data from selected CSV row
   - Automatic placeholder replacement before PDF export
   - Preserves template structure while filling data

### Components Created
1. **CSVUploadWizard Component** (`src/components/TemplateCanvas/CSVUploadWizard.tsx`)
   - File upload interface
   - CSV parsing using papaparse library
   - Data preview table
   - File validation and error handling

2. **CSVUploadWizard Styles** (`src/components/TemplateCanvas/CSVUploadWizard.css`)
   - Modal overlay styling
   - Upload dropzone design
   - Preview table styling
   - Loading and error states

3. **TemplateDataView Component** (`src/components/TemplateCanvas/TemplateDataView.tsx`)
   - Side-by-side layout (data left, template right)
   - Data row selection
   - Field mapping interface
   - Template preview with filled data
   - PDF generation trigger

4. **TemplateDataView Styles** (`src/components/TemplateCanvas/TemplateDataView.css`)
   - Split-panel layout styling
   - Data row list styling
   - Mapping table design
   - Template preview canvas styling

### Components Updated
1. **TemplateCanvas Component** (`src/components/TemplateCanvas/TemplateCanvas.tsx`)
   - Added CSV data state management
   - Added `handleCSVDataLoaded()` function
   - Added `replacePlaceholdersWithData()` function
   - Added `handleGeneratePDFWithData()` function
   - Integrated CSV upload wizard
   - Integrated template/data view
   - Enhanced PDF export to support data replacement

2. **Toolbar Component** (`src/components/TemplateCanvas/Toolbar.tsx`)
   - Added "Upload CSV" button
   - Button shows "📊 Data Loaded" when CSV is uploaded
   - Integrated with CSV upload functionality

### Dependencies Added
1. **papaparse** (`papaparse`)
   - CSV parsing library
   - Handles CSV file reading and parsing
   - Supports header row detection
   - Error handling for malformed CSV

### CSV File Format
The system expects CSV files with:
- **Header row**: Column names (required)
- **Data rows**: One row per record
- **Format**: Standard CSV (comma-separated values)

**Example CSV:**
```csv
client_company,quote_number,client_name,client_website,date,contact_name,contact_phone,contact_email,contact_website
Wawa America,Q-2026-001,John Smith,www.wawa.com,February 25 2026,John Smith,555-0100,john.smith@wawa.com,www.wawa.com
ABC Corporation,Q-2026-002,Jane Doe,www.abc-corp.com,February 26 2026,Jane Doe,555-0200,jane.doe@abc-corp.com,www.abc-corp.com
```

### Placeholder Replacement Logic

#### Placeholder Detection
The system automatically detects placeholders in:
- **Text elements**: `{{variable_name}}` in content
- **Table cells**: `{{variable_name}}` in table data
- **Image sources**: `{{image_url}}` in image src

#### Field Mapping
1. **Auto-Mapping**:
   - Exact match: `{{client_company}}` → `client_company` column
   - Case-insensitive: `{{Client_Company}}` → `client_company` column
   - Fuzzy match: `{{clientcompany}}` → `client_company` column

2. **Manual Mapping**:
   - User can override auto-mappings
   - Dropdown selection for each placeholder
   - Visual mapping table interface

#### Data Replacement
```typescript
// Example replacement
Template: "Invoice for {{client_company}}"
CSV Row: { client_company: "Wawa America" }
Result: "Invoice for Wawa America"
```

### User Interaction

#### Uploading CSV File
1. Click "📁 Upload CSV" button in toolbar
2. Select CSV file or drag-and-drop
3. System parses and validates file
4. Preview shows first 5 rows
5. Click "Use This File" to proceed
6. Side-by-side view opens automatically

#### Using Side-by-Side View
1. **Select Data Row**:
   - Click any row in left panel
   - Template preview updates with that row's data
   - Row number displayed in preview

2. **Map Fields** (if needed):
   - View field mapping table
   - Adjust mappings using dropdowns
   - Preview updates automatically

3. **Generate PDF**:
   - Click "Generate PDF for Row #X" button
   - System replaces placeholders with data
   - PDF downloads with filled data

### Technical Implementation

#### CSV Parsing
```typescript
Papa.parse(file, {
  header: true,        // First row is headers
  skipEmptyLines: true,
  complete: (results) => {
    const data = results.data;      // Array of objects
    const headers = Object.keys(data[0]);  // Column names
  }
});
```

#### Placeholder Replacement
```typescript
function replacePlaceholdersWithData(
  elements: CanvasElement[],
  dataRow: any,
  fieldMapping: Record<string, string>
): CanvasElement[] {
  // Replace {{placeholder}} with data values
  // Handles text, table, and image elements
}
```

#### PDF Generation with Data
```typescript
async function handleGeneratePDFWithData(
  rowIndex: number,
  fieldMapping: Record<string, string>
) {
  // 1. Get data row from CSV
  // 2. Replace placeholders in template
  // 3. Update elements state
  // 4. Wait for DOM update
  // 5. Generate PDF
  // 6. Restore original template
}
```

### Field Mapping Interface

#### Auto-Mapping Algorithm
1. Extract all placeholders from template
2. For each placeholder:
   - Try exact match with CSV headers
   - Try case-insensitive match
   - Try fuzzy match (ignore special chars)
3. Create mapping object
4. Display in mapping table

#### Manual Override
- User can change any mapping
- Dropdown shows all CSV columns
- Preview updates in real-time
- Mapping persists during session

### Data Preview Features

#### Left Panel
- **Data Rows List**: Scrollable list of all CSV rows
- **Row Selection**: Click to select, highlights selected row
- **Row Preview**: Shows first 2 columns for quick identification
- **Field Mapping Table**: Template placeholders → CSV columns
- **Selected Row Data**: Full data for selected row

#### Right Panel
- **Template Preview**: Shows template with selected row's data
- **Live Updates**: Updates when row or mapping changes
- **PDF Generation**: Button to generate PDF for selected row

### Error Handling

#### CSV Upload Errors
- Invalid file format → Clear error message
- Empty file → Warning message
- Parse errors → Detailed error display
- Missing headers → Validation error

#### PDF Generation Errors
- No field mappings → Alert user
- Missing data → Empty string replacement
- Generation failure → Error message, restore template

### Visual Design

#### CSV Upload Wizard
- **Modal Overlay**: Dark background, centered modal
- **Dropzone**: Dashed border, hover effects
- **Preview Table**: Clean table with headers
- **Loading State**: Spinner animation
- **Error State**: Red background, clear message

#### Side-by-Side View
- **Split Layout**: 40% data panel, 60% template preview
- **Data Rows**: Card-based design, hover effects
- **Selected Row**: Blue highlight
- **Mapping Table**: Clean table with dropdowns
- **Template Preview**: Scaled-down A4 canvas preview

### Sample Data File

A sample CSV file (`sample_data.csv`) is included with:
- 5 sample rows
- All common fields (client info, dates, contact info)
- Proper CSV formatting
- Can be used for testing

### User Workflow Example

1. **Design Template**:
   - Create template with placeholders: `{{client_company}}`, `{{date}}`, etc.
   - Position elements as desired

2. **Prepare CSV Data**:
   - Create CSV with matching column names
   - Include header row
   - Add data rows

3. **Upload CSV**:
   - Click "Upload CSV" button
   - Select CSV file
   - Review preview
   - Click "Use This File"

4. **Map Fields** (if needed):
   - Review auto-mappings
   - Adjust if necessary
   - Verify in preview

5. **Generate PDF**:
   - Select data row
   - Preview template with data
   - Click "Generate PDF"
   - PDF downloads with filled data

### Edge Cases Handled
- Empty CSV files → Validation error
- Missing CSV columns → Unmapped placeholders shown
- No placeholders in template → Message displayed
- Empty field mappings → Warning before PDF generation
- Large CSV files → Efficient parsing and display
- Special characters in CSV → Proper handling
- Multiple placeholders in one element → All replaced
- Placeholders in tables → Cell-by-cell replacement

### Files Created/Modified
- `src/components/TemplateCanvas/CSVUploadWizard.tsx` - New CSV upload component
- `src/components/TemplateCanvas/CSVUploadWizard.css` - Upload wizard styling
- `src/components/TemplateCanvas/TemplateDataView.tsx` - New side-by-side view component
- `src/components/TemplateCanvas/TemplateDataView.css` - Data view styling
- `src/components/TemplateCanvas/TemplateCanvas.tsx` - Added CSV integration
- `src/components/TemplateCanvas/Toolbar.tsx` - Added CSV upload button
- `package.json` - Added papaparse dependency
- `sample_data.csv` - Sample CSV file for testing

### Toolbar Structure
```
[Add Text] [Add Table] [Add Image] | [Structures ▼] | [Save Template] [Load Template] [📁 Upload CSV] [Export PDF] | [Delete]
```

**Toolbar Sections:**
1. **Content Elements**: Text, Table, Image
2. **Structures**: Dropdown menu with Line and Box
3. **File Operations**: Save, Load, Upload CSV, Export PDF
4. **Actions**: Delete selected element

### Usage Examples

#### Basic CSV Upload and PDF Generation
1. Design template with `{{client_company}}`, `{{date}}`, etc.
2. Prepare CSV with matching columns
3. Click "Upload CSV" → Select file
4. Side-by-side view opens
5. Click row #1 → See preview
6. Click "Generate PDF" → PDF downloads with data

#### Custom Field Mapping
1. Upload CSV with different column names
2. In side-by-side view, see unmapped placeholders
3. Use dropdowns to map `{{client_name}}` → `customer_name`
4. Preview updates automatically
5. Generate PDF with correct mapping

#### Batch Processing (Future)
- Currently generates one PDF per row
- Future: Batch generate all rows
- Future: ZIP file download

### Performance Considerations
- **CSV Parsing**: Handles files up to 10MB efficiently
- **Preview Rendering**: Shows first 5 rows for quick validation
- **DOM Updates**: Optimized wait times for React re-renders
- **PDF Generation**: Temporary element replacement, restored after

### Known Limitations
- Single PDF generation per action (batch coming in future)
- CSV files only (JSON support coming)
- Client-side processing (large files may be slow)
- No data transformation (dates, numbers as-is)

### Future Enhancements
- **Batch PDF Generation**: Generate all rows at once
- **JSON File Support**: Upload JSON files
- **Data Transformation**: Format dates, numbers, currency
- **API Integration**: Fetch data from APIs
- **Template Variables**: Support for calculations, conditions
- **Export Options**: ZIP download, email delivery
- **Data Validation**: Validate data before PDF generation
- **Mapping Presets**: Save and reuse field mappings

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
- ✅ PDF Export with A4 page size
- ✅ **CSV Data Upload and Dynamic Binding**
