# Bulk Document Generation with Related Collections

## Overview

This implementation provides a scalable solution for bulk PDF generation with support for related collections. The system automatically detects relationships between data collections and filters related data for each generated document.

## Key Features

### 1. **Automatic Relationship Detection**
- Detects relationships between collections based on shared key columns
- Identifies foreign keys across sheets/tables (e.g., `student_id` linking students to subjects)
- Calculates relationship strength (average rows per parent)
- Surfaces detected relationships in the UI before mapping

### 2. **Expandable JSON Tree Viewer**
- Shows data structure with collapsible/expandable nodes
- Displays sample records with actual data
- Record navigator for previewing different rows
- Shows which collections are related and how many rows each contains
- Allows users to verify data relationships before proceeding to mapping

### 3. **Scoped Collection Filtering**
- For each driver row, automatically filters related collections by FK
- Example: When generating invoice PDF for invoice #123, only show line_items where invoice_id = 123
- Prevents data leakage between related records
- Works transparently with template binding

### 4. **Preserved Parser Integrity**
- Parser core functionality unchanged
- Flat IR output format maintained
- Relationship detection is a pure UI/post-processing layer
- Can be disabled or replaced without affecting existing code

## Architecture

### Data Flow

```
User Upload File (CSV/Excel/JSON)
       ↓
Parser → CanonicalDocument (fields, collections)
       ↓
[NEW] Relationship Detection
       ↓
[NEW] DataStructureViewer → User confirms structure
       ↓
Field & Table Mapping (existing flow)
       ↓
[NEW] Backend: For each driver row:
       - Promote row fields to ir.fields
       - Filter related collections by FK
       - Generate PDF with scoped rowIr
       ↓
Stream ZIP with PDFs
```

### File Structure

#### Frontend

```
src/
  components/TemplateCanvas/
    DataStructureViewer.tsx       [NEW] Expandable JSON tree viewer
    DataStructureViewer.css        [NEW] Tree viewer styles
    TemplateCanvas.tsx             [UPDATED] Integrate viewer & detect relationships
    UploadData.tsx                 [UPDATED] Callback for IR parsing
    
  utils/
    relationshipDetector.ts        [NEW] Detect FK relationships
    
  services/
    dataSourceService.ts           [UPDATED] Enhanced BulkDocumentOptions
```

#### Backend

```
backend/
  index.js                         [UPDATED] Bulk export with related collection filtering
```

## Usage

### User Flow

1. **Upload Data**
   - Click "Upload Data" button
   - Drop/select Excel, CSV, or JSON file

2. **Review Structure**
   - DataStructureViewer shows parsed data as expandable tree
   - Displays detected relationships:
     ```
     students (100 records)
     ├── subjects (700 rows, ~7 per student)
     └── activities (200 rows, ~2 per student)
     ```
   - Can navigate through individual records to verify structure
   - Click "Proceed to Mapping" to continue

3. **Map Fields & Tables**
   - Existing mapping UI
   - Relationships are maintained for filtering

4. **Export**
   - Choose "Bulk PDFs" mode
   - Select driver collection
   - Set file name template
   - Click Export
   - Backend automatically filters related collections per row

### Relationship Detection Algorithm

The detector finds relationships by:

1. **Identifying shared key columns**
   - Looks for columns appearing in multiple collections
   - Prioritizes columns with "id" or "_key" suffix

2. **Verifying FK relationships**
   - Checks if 80%+ of foreign key values exist in parent table
   - Calculates average rows per parent

3. **Ranking by strength**
   - Returns relationships sorted by avg rows per parent
   - Shows strongest relationships first

### Example: Student Report Cards

**Input: Excel with 3 sheets**
```
students (100 rows)
  - student_id, student_name, grade, attendance_rate, final_result

subjects (700 rows)
  - student_id, subject_name, total_marks, obtained_marks, percentage, achievement_level

activities (200 rows)
  - student_id, activity_name, participation_level, achievement
```

**Detected Structure**
```
{
  students: {
    driverCollection: "students",
    relatedCollections: [
      { 
        collectionKey: "subjects",
        foreignKey: "student_id",
        primaryKey: "student_id",
        avgRowsPerParent: 7.0
      },
      { 
        collectionKey: "activities",
        foreignKey: "student_id", 
        primaryKey: "student_id",
        avgRowsPerParent: 2.0
      }
    ]
  }
}
```

**Template Bindings**
```
Template Elements:
  {{student_name}} → fields (promoted from row)
  {{grade}} → fields
  Table: subjects.rows → only rows where subjects.student_id = current.student_id
  Table: activities.rows → only rows where activities.student_id = current.student_id
```

**Generated Output**
```
report-card-001.pdf (for student 1 with 7 subjects + 2 activities)
report-card-002.pdf (for student 2 with 7 subjects + 2 activities)
...
report-card-100.pdf (for student 100 with 7 subjects + 2 activities)
[all files zipped]
```

## API Contracts

### Frontend → Backend

```typescript
// BulkDocumentOptions (enhanced)
{
  driverCollectionKey: "invoices",
  fileNameTemplate: "invoice-{{invoice_number}}.pdf",
  zipFileName: "invoices.zip",
  relatedCollections: {
    "line_items": {
      filterColumn: "invoice_id",      // column in line_items
      driverRowField: "id"             // field in current driver row
    }
  }
}
```

### Backend Processing Loop

```javascript
for (const row of driverCollection.rows) {
  // 1. Promote row fields
  const rowFields = { ...ir.fields, ...row };
  
  // 2. Filter related collections
  const scopedCollections = {
    [driverCollectionKey]: { rows: [row] },  // Driver is always 1 row
    // Related collections are filtered by FK:
    line_items: {
      rows: ir.collections.line_items.rows.filter(
        r => r.invoice_id === row.id  // FK match
      )
    }
  };
  
  // 3. Generate PDF with scoped data
  const rowIr = { ...ir, fields: rowFields, collections: scopedCollections };
  const pdf = await generatePdfBuffer({ ir: rowIr, ... });
  
  // 4. Add to ZIP
  entries.push({ name: resolvedFileName, data: pdf });
}
```

## Design Decisions

### Why Post-Processing?
- **Parser stability**: Core parser unchanged, easier to maintain
- **Composability**: Relationship detection can be extended independently
- **Flexibility**: UI layer can implement different relationship algorithms
- **Testing**: Each layer can be tested independently

### Why TreeViewer Before Mapping?
- **Data verification**: Users verify structure before spending time mapping
- **Reduced confusion**: Shows exactly which data belongs together
- **One-time cost**: Users see it once per data upload, prevents mapping mistakes

### Why FK Detection Heuristic?
- **Automatic**: No config needed, works out of the box
- **Reliable**: 80% validation threshold catches real relationships, ignores noise
- **Efficient**: O(n) scan through collections

### Why Not Nested JSON?
- **Parser complexity**: Would require rewriting parser logic
- **Backward compatibility**: Existing templates still work
- **Separation**: UI concerns stay separate from parsing concerns

## Future Enhancements

1. **Manual Relationship Configuration**
   - UI to override auto-detected relationships
   - Add/remove relationships as needed

2. **Streaming ZIP**
   - Replace in-memory buffer with streaming output
   - Enables unlimited scale (no memory limits)

3. **Collection Hierarchy UI**
   - Graphical representation of relationships
   - Drag-to-create relationships

4. **Relationship Caching**
   - Cache detected relationships per data source
   - Skip detection on repeated uploads

5. **Multi-level Nesting**
   - Support for 3+ level hierarchies (invoice → line items → serial numbers)
   - Recursive filtering logic

## Testing Recommendations

### Unit Tests
- `relationshipDetector.ts`
  - Test FK detection with various column names
  - Test validation threshold logic
  - Test edge cases (empty collections, no shared keys)

### Integration Tests
- DataStructureViewer with mock data
- Backend filtering logic with multi-level relationships
- File name template resolution with row fields

### E2E Tests
- Upload multi-sheet Excel → verify structure shown
- Modify mapping → verify bulk export produces correct files
- Verify related data filtering in generated PDFs

## Performance Notes

### Current Implementation
- **Time Complexity**
  - FK detection: O(n_collections × n_columns)
  - Filtering per row: O(n_related_rows) per related collection
  - Total: O(n_rows × Σ(n_rows_per_related_collection))

- **Space Complexity**
  - All PDFs buffered in memory before ZIP
  - For 500 rows × 2MB average: ~1GB RAM needed

### Optimization Path
1. Implement streaming ZIP (Phase 2)
2. Add batched generation with file cleanup
3. Implement background job processing for very large batches

## Troubleshooting

### Relationships Not Detected
- Verify column names match across sheets (case-sensitive in parser)
- Check that foreign key column has 80%+ matching values in parent
- Ensure collections have at least 10 rows (minimum threshold)

### Related Data Missing in PDF
- Verify relationship detected (check DataStructureViewer)
- Check file name template doesn't have syntax errors
- Ensure table binding points to correct collection

### ZIP Generation Fails
- Check for very long file names (sanitized to 255 chars max)
- Verify bulk collection has rows
- Check driver row field names are valid

## Code Examples

### Using the Relationship Detector

```typescript
import { detectRelationships, buildRelatedCollectionsConfig } from './utils/relationshipDetector';

const ir = await parseFile(file);
const relationships = detectRelationships(ir);

// Get config for backend
const config = buildRelatedCollectionsConfig('invoices', relationships);
// Returns: { line_items: { filterColumn: 'invoice_id', driverRowField: 'id' } }
```

### Custom Relationship Override

```typescript
// Advanced: manually define relationships if auto-detection fails
const customRelationships = {
  invoices: {
    driverCollection: 'invoices',
    relatedCollections: [
      {
        collectionKey: 'line_items',
        foreignKey: 'invoice_no',     // Different naming
        primaryKey: 'number',
        avgRowsPerParent: 5
      }
    ],
    rowCount: 1000
  }
};

const config = buildRelatedCollectionsConfig('invoices', customRelationships);
```

## Summary

This implementation provides:
- ✅ Automatic relationship detection (no config needed)
- ✅ Visual structure verification before mapping
- ✅ Transparent FK filtering in bulk export
- ✅ Parser core unchanged (stable, maintainable)
- ✅ Scalable architecture (ready for streaming ZIP)
- ✅ Backward compatible (existing templates still work)
