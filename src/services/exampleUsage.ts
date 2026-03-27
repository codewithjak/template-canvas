/**
 * Example Usage of Template API, Data API, and Mapping Engine
 * 
 * This file demonstrates how to:
 * 1. Fetch template from API
 * 2. Fetch data from API (CSV or JSON)
 * 3. Map data to template using mapping engine
 * 4. Generate PDF with mapped data
 */

import {
  fetchTemplate,
  fetchTemplateFromAPI,
  fetchCSVData,
  fetchDataFromAPI,
  mapTemplateToData,
  mapTemplateToMultipleData,
  validateMapping,
  getAllPlaceholders,
  autoMapFields,
} from './index';

/**
 * Example 1: Fetch template and CSV data, then map
 */
export async function example1_BasicMapping() {
  try {
    // 1. Fetch template
    const template = await fetchTemplate('cover.json');
    console.log('Template loaded:', template.name);
    
    // 2. Fetch CSV data
    const csvData = await fetchCSVData('sample_data.csv');
    console.log('CSV data loaded:', csvData.length, 'rows');
    
    // 3. Map first row to template
    const firstRow = csvData[0];
    const mappedElements = mapTemplateToData(template.elements, firstRow);
    
    console.log('Mapping complete!');
    console.log('Mapped elements:', mappedElements.length);
    
    return {
      template,
      data: firstRow,
      mappedElements,
    };
  } catch (error) {
    console.error('Error in example 1:', error);
    throw error;
  }
}

/**
 * Example 2: Fetch from custom APIs
 */
export async function example2_CustomAPIs(
  templateApiUrl: string,
  dataApiUrl: string
) {
  try {
    // 1. Fetch template from custom API
    const template = await fetchTemplateFromAPI(templateApiUrl);
    
    // 2. Fetch data from custom API
    const data = await fetchDataFromAPI(dataApiUrl);
    
    // 3. Handle single object or array
    if (Array.isArray(data)) {
      // Multiple records - map each one
      const mappedTemplates = mapTemplateToMultipleData(template.elements, data);
      return {
        template,
        data,
        mappedTemplates,
      };
    } else {
      // Single record
      const mappedElements = mapTemplateToData(template.elements, data);
      return {
        template,
        data,
        mappedElements,
      };
    }
  } catch (error) {
    console.error('Error in example 2:', error);
    throw error;
  }
}

/**
 * Example 3: Batch processing - map all CSV rows
 */
export async function example3_BatchProcessing() {
  try {
    // 1. Fetch template (once)
    const template = await fetchTemplate('cover.json');
    
    // 2. Fetch all CSV data
    const csvData = await fetchCSVData('sample_data.csv');
    
    // 3. Map all rows
    const allMappedTemplates = mapTemplateToMultipleData(
      template.elements,
      csvData
    );
    
    console.log(`Mapped ${csvData.length} templates`);
    
    return {
      template,
      data: csvData,
      mappedTemplates: allMappedTemplates,
    };
  } catch (error) {
    console.error('Error in example 3:', error);
    throw error;
  }
}

/**
 * Example 4: Validate mapping before processing
 */
export async function example4_ValidateMapping() {
  try {
    // 1. Fetch template and data
    const template = await fetchTemplate('cover.json');
    const csvData = await fetchCSVData('sample_data.csv');
    
    // 2. Get all placeholders
    const placeholders = getAllPlaceholders(template.elements);
    console.log('Template placeholders:', placeholders);
    
    // 3. Validate mapping for first row
    const firstRow = csvData[0];
    const validation = validateMapping(template.elements, firstRow);
    
    if (validation.isValid) {
      console.log('✅ All placeholders mapped successfully!');
      console.log('Mapped fields:', validation.mappedFields);
      
      // Proceed with mapping
      const mappedElements = mapTemplateToData(template.elements, firstRow);
      return {
        template,
        data: firstRow,
        mappedElements,
        validation,
      };
    } else {
      console.warn('⚠️ Some placeholders are missing data:');
      console.warn('Missing fields:', validation.missingFields);
      console.warn('Mapped fields:', validation.mappedFields);
      
      // Still proceed, but missing fields will show as placeholders
      const mappedElements = mapTemplateToData(template.elements, firstRow);
      return {
        template,
        data: firstRow,
        mappedElements,
        validation,
      };
    }
  } catch (error) {
    console.error('Error in example 4:', error);
    throw error;
  }
}

/**
 * Example 5: Custom field mapping
 */
export async function example5_CustomMapping() {
  try {
    // 1. Fetch template and data
    const template = await fetchTemplate('cover.json');
    const csvData = await fetchCSVData('sample_data.csv');
    
    // 2. Create custom field mapping
    // Example: Template uses {{company}} but CSV has {{client_company}}
    const customMapping = {
      company: 'client_company',
      name: 'client_name',
      website: 'client_website',
      // Add more mappings as needed
    };
    
    // 3. Map with custom mapping
    const firstRow = csvData[0];
    const mappedElements = mapTemplateToData(
      template.elements,
      firstRow,
      customMapping
    );
    
    return {
      template,
      data: firstRow,
      mappedElements,
      mapping: customMapping,
    };
  } catch (error) {
    console.error('Error in example 5:', error);
    throw error;
  }
}

/**
 * Example 6: Complete workflow - Template + Data → PDF Ready Elements
 */
export async function example6_CompleteWorkflow(rowIndex: number = 0) {
  try {
    console.log('Starting complete workflow...');
    
    // Step 1: Fetch template
    console.log('Step 1: Fetching template...');
    const template = await fetchTemplate('cover.json');
    console.log(`✅ Template loaded: ${template.elements.length} elements`);
    
    // Step 2: Fetch data
    console.log('Step 2: Fetching data...');
    const csvData = await fetchCSVData('sample_data.csv');
    console.log(`✅ Data loaded: ${csvData.length} rows`);
    
    if (rowIndex >= csvData.length) {
      throw new Error(`Row index ${rowIndex} out of range (0-${csvData.length - 1})`);
    }
    
    // Step 3: Validate mapping
    console.log('Step 3: Validating mapping...');
    const selectedRow = csvData[rowIndex];
    const validation = validateMapping(template.elements, selectedRow);
    
    if (!validation.isValid) {
      console.warn(`⚠️ Warning: ${validation.missingFields.length} unmapped fields`);
      console.warn('Missing:', validation.missingFields);
    }
    
    // Step 4: Map template to data
    console.log('Step 4: Mapping template to data...');
    const mappedElements = mapTemplateToData(
      template.elements,
      selectedRow
    );
    console.log(`✅ Mapping complete: ${mappedElements.length} elements`);
    
    // Step 5: Return ready-to-use elements
    return {
      success: true,
      template: {
        name: template.name,
        version: template.version,
        elementCount: template.elements.length,
      },
      data: {
        rowIndex,
        row: selectedRow,
        totalRows: csvData.length,
      },
      mapping: {
        isValid: validation.isValid,
        mappedFields: validation.mappedFields,
        missingFields: validation.missingFields,
      },
      mappedElements, // Ready to use in TemplateCanvas
    };
  } catch (error) {
    console.error('Error in complete workflow:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
