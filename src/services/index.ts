/**
 * Service exports
 * Central export point for all API and mapping services
 */

// Template API
export {
  fetchTemplate,
  fetchTemplateFromAPI,
  type Template,
} from './templateApi';

// Data API
export {
  fetchCSVData,
  fetchDataFromAPI,
  fetchDataById,
  fetchMultipleData,
  parseCSV,
  type DataRow,
} from './dataApi';

// Mapping Engine
export {
  mapTemplateToData,
  mapTemplateToMultipleData,
  replacePlaceholders,
  extractPlaceholders,
  autoMapFields,
  getAllPlaceholders,
  validateMapping,
  type CanvasElement,
} from './mappingEngine';
