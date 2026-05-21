/**
 * src/services/index.ts
 * Central export point for all service modules.
 * Aligned with the CanonicalDocument IR — no legacy exports.
 */

export {
  // Core resolvers
  resolve,
  replacePlaceholders,
  resolveCellValue,
  resolveElement,
  resolveAllElements,

  // Placeholder extraction
  getStaticPlaceholders,
  getTableInfos,

  // Auto-mapping helpers
  autoMapStaticFields,
  autoMapCollectionFields,
  buildInitialMappings,

  // Canvas preview
  mapTemplateForPreview,

  // Validation
  validateBindings,
} from './mappingEngine';

export type { DataRow } from '../types/dataSource';