/**
 * Service exports
 * Central export point for mapping services
 */

export {
  mapTemplateToData,
  mapTemplateToMultipleData,
  replacePlaceholders,
  extractPlaceholders,
  autoMapFields,
  getAllPlaceholders,
  getPlaceholdersByScope,
  validateMapping,
  type DataRow,
  type PlaceholderGroups,
  type CanvasElement,
} from './mappingEngine';
