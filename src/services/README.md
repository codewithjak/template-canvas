# API Services & Mapping Engine

This directory contains services for fetching templates, fetching data, and mapping data to templates.

## Files

- **`templateApi.ts`** - API service for fetching template JSON
- **`dataApi.ts`** - API service for fetching CSV or JSON data
- **`mappingEngine.ts`** - Engine for mapping data to template placeholders
- **`index.ts`** - Central export point
- **`exampleUsage.ts`** - Usage examples

## Quick Start

### 1. Fetch Template and Data

```typescript
import { fetchTemplate, fetchCSVData, mapTemplateToData } from './services';

// Fetch template
const template = await fetchTemplate('cover.json');

// Fetch CSV data
const csvData = await fetchCSVData('sample_data.csv');

// Map first row to template
const mappedElements = mapTemplateToData(template.elements, csvData[0]);
```

### 2. Use with Custom APIs

```typescript
import { fetchTemplateFromAPI, fetchDataFromAPI, mapTemplateToData } from './services';

// Fetch from your APIs
const template = await fetchTemplateFromAPI('https://api.example.com/templates/invoice');
const data = await fetchDataFromAPI('https://api.example.com/invoices/123');

// Map and use
const mappedElements = mapTemplateToData(template.elements, data);
```

## API Reference

### Template API

#### `fetchTemplate(templateId?: string)`
Fetches template from public folder or local file.

```typescript
const template = await fetchTemplate('cover.json');
```

#### `fetchTemplateFromAPI(apiUrl: string)`
Fetches template from custom API endpoint.

```typescript
const template = await fetchTemplateFromAPI('https://api.example.com/templates/123');
```

### Data API

#### `fetchCSVData(csvPath?: string)`
Fetches and parses CSV file.

```typescript
const data = await fetchCSVData('sample_data.csv');
// Returns: Array of objects with CSV column names as keys
```

#### `fetchDataFromAPI(apiUrl: string)`
Fetches data from JSON API.

```typescript
const data = await fetchDataFromAPI('https://api.example.com/invoices/123');
// Returns: Single object or array of objects
```

#### `fetchDataById(apiUrl: string, id: string | number)`
Fetches single record by ID.

```typescript
const invoice = await fetchDataById('https://api.example.com/invoices', 123);
```

### Mapping Engine

#### `mapTemplateToData(elements, data, fieldMapping?)`
Maps data to template placeholders.

```typescript
const mappedElements = mapTemplateToData(
  template.elements,
  dataRow,
  optionalFieldMapping
);
```

#### `mapTemplateToMultipleData(elements, dataRows, fieldMapping?)`
Maps template to multiple data rows (batch processing).

```typescript
const allMapped = mapTemplateToMultipleData(
  template.elements,
  csvData
);
```

#### `validateMapping(elements, data, fieldMapping?)`
Validates that all placeholders have corresponding data.

```typescript
const validation = validateMapping(template.elements, data);
if (validation.isValid) {
  // All fields mapped
} else {
  console.warn('Missing fields:', validation.missingFields);
}
```

#### `autoMapFields(placeholders, dataKeys)`
Automatically maps placeholders to data keys.

```typescript
const mapping = autoMapFields(
  ['client_company', 'date'],
  ['client_company', 'invoice_date']
);
// Returns: { client_company: 'client_company', date: 'invoice_date' }
```

## Examples

See `exampleUsage.ts` for complete examples:

1. **Basic Mapping** - Simple template + CSV mapping
2. **Custom APIs** - Using your own API endpoints
3. **Batch Processing** - Map multiple rows
4. **Validation** - Validate before mapping
5. **Custom Mapping** - Manual field mapping
6. **Complete Workflow** - End-to-end example

## Usage in TemplateCanvas

```typescript
import { example6_CompleteWorkflow } from './services/exampleUsage';

// In your component
const result = await example6_CompleteWorkflow(0); // Use first row

if (result.success) {
  // Use result.mappedElements in TemplateCanvas
  setElements(result.mappedElements);
  
  // Then generate PDF
  await handleExportPDF();
}
```

## Field Mapping

The mapping engine supports:

- **Exact match**: `{{client_company}}` → `client_company`
- **Case-insensitive**: `{{Client_Company}}` → `client_company`
- **Fuzzy match**: `{{clientcompany}}` → `client_company`
- **Custom mapping**: Manual field mapping object
- **Nested data**: `{{client.name}}` → `data.client.name`

## Error Handling

All functions throw errors that should be caught:

```typescript
try {
  const template = await fetchTemplate('cover.json');
  const data = await fetchCSVData('sample_data.csv');
  const mapped = mapTemplateToData(template.elements, data[0]);
} catch (error) {
  console.error('Error:', error);
  // Handle error
}
```

## File Locations

- **Templates**: `public/cover.json` (or your API)
- **CSV Data**: `public/sample_data.csv` (or your API)
- **Services**: `src/services/`
